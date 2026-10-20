'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const { createHub } = require('../../src/hub/server');
const { createSseParser, runBridge } = require('../../src/quickshell/bridge');

function waitFor(predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() >= deadline) return reject(new Error('timed out waiting for bridge output'));
      setTimeout(check, 10);
    };
    check();
  });
}

async function startHub(t, secret = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-quickshell-bridge-'));
  const hub = createHub({ port: 0, host: '127.0.0.1', secret, dataFile: path.join(dir, 'devices.json'), logger: { error() {}, warn() {} } });
  await hub.start();
  t.after(async () => {
    await hub.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { hub, url: `http://127.0.0.1:${hub.server.address().port}` };
}

test('the SSE parser joins data lines, splits events and skips comments', () => {
  const events = [];
  const feed = createSseParser((event) => events.push(event));
  feed(': hb\n\nevent: snap');
  feed('shot\r\ndata: {"a":\ndata: 1}\n\n');
  feed('data: plain\n\n');
  assert.deepEqual(events, [
    { event: 'snapshot', data: '{"a":\n1}' },
    { event: 'message', data: 'plain' }
  ]);
});

test('the bridge prints a model for the snapshot and for each ingest', async (t) => {
  const { hub, url } = await startHub(t);
  const lines = [];
  const stop = runBridge({ hubUrl: `${url}/`, write: (line) => lines.push(line) });
  t.after(stop);

  await waitFor(() => lines.some((line) => line.type === 'model'));
  assert.equal(lines[0].connected, true);
  assert.equal(lines[0].hubUrl, url);
  assert.equal(lines[0].model.periods.today.tokensText, '0');

  hub.ingest({
    deviceId: 'omarchy',
    updatedAt: new Date().toISOString(),
    today: { totalTokens: 2500, costUsd: 0.5, clients: { claude: 2500 }, clientCosts: { claude: 0.5 } },
    month: { totalTokens: 2500, costUsd: 0.5 },
    allTime: { totalTokens: 2500, costUsd: 0.5 }
  });
  await waitFor(() => lines.at(-1)?.model?.periods.today.tokensText === '2.5K');
  assert.equal(lines.at(-1).model.periods.today.clients[0].label, 'Claude Code');
  assert.equal(lines.at(-1).model.devices[0].name, 'omarchy');
});

test('the bridge fetches the full history with the secret and passes it on', async (t) => {
  const { url } = await startHub(t, 'right');
  const historyCalls = [];
  const fetchImpl = (target, init) => {
    if (String(target).endsWith('/api/history')) {
      historyCalls.push(init.headers.authorization);
      const body = { daily: [{ date: '2026-01-05', tokens: 5, cost: 0 }], summary: { activeDays: 77 } };
      return Promise.resolve(new Response(JSON.stringify(body)));
    }
    return fetch(target, init);
  };
  const lines = [];
  const stop = runBridge({ hubUrl: url, secret: 'right', write: (line) => lines.push(line), fetchImpl });
  t.after(stop);

  await waitFor(() => lines.at(-1)?.model?.activity.activeDaysText === '77 active days');
  // One snapshot, one revision: fetched once.
  assert.deepEqual(historyCalls, ['Bearer right']);
});

test('the bridge reports a wrong secret as a status line and keeps retrying', async (t) => {
  const { url } = await startHub(t, 'right');
  const lines = [];
  const stop = runBridge({ hubUrl: url, secret: 'wrong', write: (line) => lines.push(line) });
  t.after(stop);

  await waitFor(() => lines.length > 0);
  assert.deepEqual(lines[0], { type: 'status', connected: false, hubUrl: url, error: 'unauthorized: check TOKEN_MONITOR_SECRET' });
});

test('the bridge authenticates with the secret as a bearer header', async (t) => {
  const { url } = await startHub(t, 'right');
  const lines = [];
  const stop = runBridge({ hubUrl: url, secret: 'right', write: (line) => lines.push(line) });
  t.after(stop);

  await waitFor(() => lines.some((line) => line.type === 'model'));
  assert.equal(lines.some((line) => line.type === 'status'), false);
});

test('an unreachable hub yields a status line instead of an exit', async (t) => {
  const { hub, url } = await startHub(t);
  await hub.stop();
  const lines = [];
  const stop = runBridge({ hubUrl: url, write: (line) => lines.push(line) });
  t.after(stop);

  await waitFor(() => lines.length > 0);
  assert.equal(lines[0].type, 'status');
  assert.equal(lines[0].connected, false);
  assert.equal(lines[0].error, 'ECONNREFUSED');
});
