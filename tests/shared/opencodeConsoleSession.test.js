'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  fetchConsoleSession,
  fetchConsoleOrgs,
  fetchUsageModels,
  parseUsageModels
} = require('../../src/shared/providers/opencode/console');

const NOW = Date.UTC(2026, 10, 7, 12);
const session = {
  access: 'oauth-access',
  orgId: 'org_FIXTURE',
  expiresAt: NOW + 60 * 60 * 1000,
  server: 'https://opencode.ai/console'
};
const meter = (used, limit, resetsAt = null) => ({ usedMicroCents: used, limitMicroCents: limit, resetsAt });
const goStatus = {
  product: 'go',
  access: {
    endsAt: '2026-11-30T16:45:09.000Z',
    meters: {
      fiveHour: meter('25', '1200'),
      week: meter('40', '3000'),
      month: meter('10', '6000')
    }
  }
};
const response = (body, status = 200) => ({ status, text: async () => typeof body === 'string' ? body : JSON.stringify(body) });

function fixture(handler = () => undefined) {
  const calls = [];
  const fetch = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, init, url, search: new URL(url).search });
    const result = await handler(path, init, url);
    if (result !== undefined) return result;
    if (path === '/console/api/go/status') return response(goStatus);
    if (path === '/console/api/orgs/current') {
      return response({ org: { id: 'org_FIXTURE' }, singleMember: true, hasGoSubscription: true });
    }
    if (path === '/console/api/usage/models') {
      return response({
        items: [
          { model: 'deepseek-v4.1-flash', provider: 'opencode-go', totalRequests: '12', totalCostMicroCents: '118909741' },
          { model: 'deepseek-v4.1-flash-free', provider: 'opencode', totalRequests: '4', totalCostMicroCents: '0' }
        ],
        pageInfo: { page: 1, pageSize: 100, total: 2, pageCount: 1 }
      });
    }
    return response('login', 401);
  };
  return { calls, fetch, env: {}, now: () => NOW };
}

test('an OAuth session reads Go meters, plan and the subscription end', async () => {
  const deps = fixture();
  const go = await fetchConsoleSession('go', session, deps);
  assert.equal(go.status, 'ok');
  assert.equal(go.workspaceId, 'org_FIXTURE');
  assert.equal(go.plan, 'go');
  assert.equal(go.access.endsAt, '2026-11-30T16:45:09.000Z');
  assert.deepEqual(go.windows.map(w => [w.kind, w.usedPercent]), [
    ['session', 2.1],
    ['weekly', 1.3],
    ['monthly', 0.2]
  ]);
  const call = deps.calls[0];
  assert.equal(call.init.headers.Authorization, 'Bearer oauth-access');
  assert.equal(call.init.headers.Cookie, undefined);
  assert.equal(call.init.headers['x-org-id'], 'org_FIXTURE');
  assert.equal(call.init.headers.Host, undefined);
  assert.equal(call.init.credentials, 'omit');
  assert.equal(call.init.redirect, 'manual');
});

test('the OAuth org check reports the single-member Go workspace', async () => {
  const deps = fixture();
  const org = await fetchConsoleOrgs(session, deps);
  assert.equal(org.status, 'ok');
  assert.equal(org.orgId, 'org_FIXTURE');
  assert.equal(org.singleMember, true);
  assert.equal(org.hasGoSubscription, true);
  assert.equal(deps.calls[0].init.headers.Authorization, 'Bearer oauth-access');
});

test('usage-by-model returns cost and requests for each model', async () => {
  const deps = fixture();
  const usage = await fetchUsageModels(session, deps);
  assert.equal(usage.status, 'ok');
  assert.deepEqual(usage.items, [
    { model: 'deepseek-v4.1-flash', provider: 'opencode-go', costUsd: 1.18909741, requests: 12 },
    { model: 'deepseek-v4.1-flash-free', provider: 'opencode', costUsd: 0, requests: 4 }
  ]);
  assert.equal(deps.calls[0].path, '/console/api/usage/models');
  assert.equal(deps.calls[0].search, '?pageSize=100');
  assert.equal(deps.calls[0].init.headers['x-org-id'], 'org_FIXTURE');
});

test('usage-by-model rejects a payload without an items array', () => {
  assert.throws(() => parseUsageModels(null), /usage models missing/);
  assert.throws(() => parseUsageModels({ items: 'nope' }), /usage models missing/);
  assert.deepEqual(parseUsageModels({ items: [] }), []);
});

test('usage-by-model skips malformed rows instead of inventing values', () => {
  assert.deepEqual(parseUsageModels({
    items: [
      null,
      { model: '', provider: 'opencode-go', totalCostMicroCents: '1' },
      { model: 'deepseek-v4-pro', provider: '', totalCostMicroCents: '1' },
      { model: 'deepseek-v4-pro', provider: 'opencode-go', totalCostMicroCents: '-1' },
      { model: 'deepseek-v4-pro', provider: 'opencode-go', totalCostMicroCents: '1e3' },
      { model: 'deepseek-v4-pro', provider: 'opencode-go', totalCostMicroCents: '150000000' }
    ]
  }), [{ model: 'deepseek-v4-pro', provider: 'opencode-go', costUsd: 1.5, requests: null }]);
});

test('a missing OAuth workspace is not guessed', async () => {
  const deps = fixture();
  await assert.rejects(fetchConsoleSession('go', { access: 'oauth-access' }, deps), (error) => {
    assert.equal(error.status, 'unavailable');
    return true;
  });
  assert.equal(deps.calls.length, 0);
});

for (const [status, expected] of [[401, 'unauthorized'], [429, 'sourceRateLimited'], [500, 'unavailable']]) {
  test(`usage-by-model ${status} maps to ${expected}`, async () => {
    const deps = fixture(() => response({}, status));
    await assert.rejects(fetchUsageModels(session, deps), (error) => {
      assert.equal(error.status, expected);
      return true;
    });
  });
}
