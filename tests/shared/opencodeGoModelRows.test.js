'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchOpenCodeLimits } = require('../../src/shared/providers/opencode/limits');
const { hashKey } = require('../../src/shared/hashKey');

const NOW = Date.UTC(2026, 10, 7, 12);
const MONTH_END = '2026-11-30T16:45:09.000Z';
const session = {
  access: 'oauth-access',
  orgId: 'org_FIXTURE',
  expiresAt: NOW + 60 * 60 * 1000,
  server: 'https://opencode.ai/console'
};

const goIfy = (percent, kind, resetsAt) => ({
  kind,
  usedPercent: percent,
  used: null,
  limit: null,
  resetsAt,
  windowMinutes: kind === 'session' ? 300 : kind === 'weekly' ? 10080 : 43200
});

function goResult(overrides = {}) {
  return {
    status: 'ok',
    workspaceId: 'org_FIXTURE',
    plan: 'go',
    access: { endsAt: MONTH_END },
    windows: [
      goIfy(2, 'session', '2026-11-07T19:50:58.000Z'),
      goIfy(3, 'weekly', '2026-11-09T00:00:00.000Z'),
      goIfy(4, 'monthly', MONTH_END)
    ],
    ...overrides
  };
}

function deepseekUsage(costUsd = 1.18909741) {
  return {
    status: 'ok',
    items: [
      { model: 'deepseek-v4.1-flash', provider: 'opencode-go', costUsd, requests: 779 },
      { model: 'deepseek-v4.1-flash-free', provider: 'opencode', costUsd: 0, requests: 538 },
      { model: 'kimi-k3', provider: 'opencode-go', costUsd: 4, requests: 10 }
    ]
  };
}

function baseDeps(overrides = {}) {
  return {
    env: {},
    now: () => NOW,
    opencodeReadGoApiKey: () => '',
    opencodeReadConsoleSession: () => session,
    opencodeReadConsoleIdentity: () => null,
    opencodeCollectGoApi: async () => ({ status: 'notConfigured', windows: [], identity: '' }),
    opencodeFetchConsoleGo: async (s) => goResult({ workspaceId: s.orgId }),
    opencodeFetchConsoleOrgs: async () => ({
      status: 'ok', orgId: 'org_FIXTURE', singleMember: true, hasGoSubscription: true
    }),
    opencodeFetchUsageModels: async () => deepseekUsage(),
    ...overrides
  };
}

function rows(result) {
  return Array.isArray(result) ? result : [result];
}

test('ambient OAuth publishes the Go row and the DeepSeek monthly allowance', async () => {
  const deps = baseDeps();
  const result = await fetchOpenCodeLimits({}, deps);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 2);

  const [go, deepseek] = result;
  assert.equal(go.status, 'ok');
  assert.equal(go.source, 'web');
  assert.equal(go.accountLabel, 'Go');
  assert.equal(go.accountKey, hashKey('opencode', 'workspace:org_FIXTURE'));
  assert.deepEqual(go.windows.map(w => w.kind), ['session', 'weekly', 'billing']);

  assert.equal(deepseek.provider, 'opencode');
  assert.equal(deepseek.status, 'ok');
  assert.equal(deepseek.source, 'web');
  assert.equal(deepseek.accountKey, hashKey('opencode', 'go-model:org_FIXTURE:deepseek-v4.1-flash'));
  assert.equal(deepseek.accountLabel, 'DeepSeek V4.1 Flash');
  assert.equal(deepseek.planLabel, 'Go');
  assert.equal(deepseek.windows.length, 1);
  const monthly = deepseek.windows[0];
  assert.equal(monthly.kind, 'billing');
  assert.equal(monthly.label, 'Monthly');
  assert.equal(monthly.used, 1.18909741);
  assert.equal(monthly.limit, 100);
  assert.equal(monthly.currency, 'USD');
  assert.equal(monthly.resetsAt, MONTH_END);
  assert.equal(monthly.usedPercent, 1.18909741);
});

test('the API-key Go row keeps the same model rows when the OAuth session matches', async () => {
  const deps = baseDeps({
    opencodeReadGoApiKey: () => 'go-key',
    opencodeCollectGoApi: async () => ({
      status: 'ok',
      identity: 'go-api:key-hash',
      windows: [goIfy(5, 'session', '2026-11-07T19:50:58.000Z'), goIfy(6, 'weekly', '2026-11-09T00:00:00.000Z')]
    })
  });
  const result = rows(await fetchOpenCodeLimits({}, deps));
  assert.equal(result.length, 2);
  assert.equal(result[0].source, 'api');
  assert.equal(result[0].accountKey, hashKey('opencode', 'workspace:org_FIXTURE'));
  assert.ok(result[0].accountKeyAliases.includes(hashKey('opencode', 'go-api:key-hash')));
  assert.equal(result[1].accountLabel, 'DeepSeek V4.1 Flash');
});

test('an empty usage-by-model result leaves the single Go row', async () => {
  const result = await fetchOpenCodeLimits({}, baseDeps({
    opencodeFetchUsageModels: async () => ({ status: 'ok', items: [] })
  }));
  assert.ok(!Array.isArray(result));
  assert.equal(result.accountLabel, 'Go');
  assert.deepEqual(result.windows.map(w => w.kind), ['session', 'weekly', 'billing']);
});

test('a multi-member workspace does not publish workspace usage under one member', async () => {
  const result = await fetchOpenCodeLimits({}, baseDeps({
    opencodeFetchConsoleOrgs: async () => ({
      status: 'ok', orgId: 'org_FIXTURE', singleMember: false, hasGoSubscription: true
    })
  }));
  assert.ok(!Array.isArray(result));
});

test('a workspace without a Go subscription has no model rows', async () => {
  const result = await fetchOpenCodeLimits({}, baseDeps({
    opencodeFetchConsoleOrgs: async () => ({
      status: 'ok', orgId: 'org_FIXTURE', singleMember: true, hasGoSubscription: false
    })
  }));
  assert.ok(!Array.isArray(result));
});

test('disabling ambient discovery skips the OAuth session entirely', async () => {
  let read = 0;
  const result = await fetchOpenCodeLimits({ opencodeAmbientEnabled: false }, baseDeps({
    opencodeReadConsoleSession: () => { read += 1; return session; }
  }));
  assert.equal(read, 0);
  assert.ok(!Array.isArray(result));
});

test('an explicit profile does not inherit the ambient Console session', async () => {
  let read = 0;
  const result = await fetchOpenCodeLimits({
    opencodeProfiles: { work: { enabled: true, apiKey: 'profile-key' } }
  }, baseDeps({
    opencodeCollectGoApi: async () => ({
      status: 'ok', identity: 'go-api:profile', windows: [goIfy(5, 'session', '2026-11-07T19:50:58.000Z')]
    }),
    opencodeReadConsoleSession: () => { read += 1; return session; }
  }));
  assert.equal(read, 0);
  assert.ok(!Array.isArray(result));
});

test('Go Plus selects the Go Plus DeepSeek allowance', async () => {
  const result = rows(await fetchOpenCodeLimits({}, baseDeps({
    opencodeFetchConsoleGo: async () => goResult({ plan: 'go-plus' })
  })));
  assert.equal(result.length, 2);
  assert.equal(result[1].planLabel, 'Go Plus');
  assert.equal(result[1].windows[0].limit, 200);
});

test('a cookie workspace that differs from the OAuth session is not mixed', async () => {
  const deps = baseDeps({
    opencodeFetchGoWeb: async () => ({
      status: 'ok', workspaceId: 'org_OTHER', windows: [goIfy(7, 'session', '2026-11-07T19:50:58.000Z')]
    }),
    opencodeFetchZen: async () => ({ status: 'notConfigured', windows: [], balanceUsd: null })
  });
  const result = await fetchOpenCodeLimits({ opencodeCookie: '__Host-console_session=fixture' }, deps);
  assert.ok(!Array.isArray(result));
  assert.equal(result.webAccountKey, hashKey('opencode', 'workspace:org_OTHER'));
});

test('only models with a known allowance and recorded spend get a row', async () => {
  const result = await fetchOpenCodeLimits({}, baseDeps({
    opencodeFetchUsageModels: async () => ({
      status: 'ok',
      items: [
        { model: 'deepseek-v4-pro', provider: 'opencode-go', costUsd: 0, requests: 0 },
        { model: 'deepseek-v4.1-flash', provider: 'opencode-go', costUsd: 0.5, requests: 3 },
        { model: 'glm-5.3', provider: 'opencode-go', costUsd: 2, requests: 4 }
      ]
    })
  }));
  const providers = rows(result);
  assert.equal(providers.length, 2);
  assert.equal(providers[1].accountLabel, 'DeepSeek V4.1 Flash');
  assert.equal(providers[1].windows[0].used, 0.5);
});
