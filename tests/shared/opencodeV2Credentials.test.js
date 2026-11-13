'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const {
  readV2Credential,
  readV2ApiKey,
  readV2ConsoleIdentity,
  readV2ConsoleSession,
  normalizeConsoleServer
} = require('../../src/shared/providers/opencode/v2Credentials');

const NOW = Date.UTC(2026, 10, 7, 12);

function tempDataDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-v2-'));
  fs.mkdirSync(path.join(dir, 'opencode'), { recursive: true });
  return dir;
}

function createDb(env, rows, { table = true } = {}) {
  const dbPath = path.join(env.XDG_DATA_HOME, 'opencode', 'opencode.db');
  const db = new DatabaseSync(dbPath);
  if (table) {
    db.exec(`
      CREATE TABLE credential (
        id TEXT PRIMARY KEY,
        integration_id TEXT NOT NULL,
        label TEXT,
        value TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        time_created INTEGER,
        time_updated INTEGER
      )
    `);
    const insert = db.prepare(`
      INSERT INTO credential (id, integration_id, label, value, active, time_created, time_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    rows.forEach((row, index) => insert.run(
      `cred_${index}`,
      row.integrationId,
      row.label || '',
      typeof row.value === 'string' ? row.value : JSON.stringify(row.value),
      row.active === false ? 0 : 1,
      row.timeUpdated || NOW,
      row.timeUpdated || NOW
    ));
  }
  db.close();
  return dbPath;
}

function envWithDb(rows, options) {
  const env = { XDG_DATA_HOME: tempDataDir() };
  createDb(env, rows, options);
  return env;
}

test('reads the Go API key from the OpenCode 2.x credential table', () => {
  const env = envWithDb([{
    integrationId: 'opencode-go',
    value: { type: 'key', key: ' go-key ' }
  }]);
  assert.equal(readV2ApiKey('opencode-go', env), 'go-key');
  assert.equal(readV2Credential('opencode-go', env).type, 'key');
});

test('reads the newest active credential and ignores inactive rows', () => {
  const env = envWithDb([
    { integrationId: 'opencode-go', value: { type: 'key', key: 'old' }, timeUpdated: NOW - 1000 },
    { integrationId: 'opencode-go', value: { type: 'key', key: 'new' }, timeUpdated: NOW },
    { integrationId: 'opencode-go', value: { type: 'key', key: 'inactive' }, active: false, timeUpdated: NOW + 1000 }
  ]);
  assert.equal(readV2ApiKey('opencode-go', env), 'new');
});

test('a malformed newest row does not hide an older usable credential', () => {
  const env = envWithDb([
    { integrationId: 'opencode-go', value: '{not json', timeUpdated: NOW },
    { integrationId: 'opencode-go', value: { type: 'key', key: 'usable' }, timeUpdated: NOW - 1000 }
  ]);
  assert.equal(readV2ApiKey('opencode-go', env), 'usable');
});

test('only key/api credential types become a Go key', () => {
  for (const type of ['oauth', 'env', 'account', '']) {
    const env = envWithDb([{ integrationId: 'opencode-go', value: { type, key: 'not-a-key' } }]);
    assert.equal(readV2ApiKey('opencode-go', env), '', type);
  }
});

test('reads a live Console OAuth session with its workspace identity', () => {
  const env = envWithDb([{
    integrationId: 'opencode',
    value: {
      type: 'oauth',
      access: 'st_access',
      refresh: 'rt_refresh',
      expires: NOW + 60 * 60 * 1000,
      metadata: { server: 'https://opencode.ai/console', orgID: 'org_FIXTURE' }
    }
  }]);
  const session = readV2ConsoleSession(env, { now: () => NOW });
  assert.deepEqual(session, {
    access: 'st_access',
    orgId: 'org_FIXTURE',
    expiresAt: NOW + 60 * 60 * 1000,
    server: 'https://opencode.ai/console'
  });
});

test('expired OAuth sessions are ignored rather than refreshed', () => {
  const env = envWithDb([{
    integrationId: 'opencode',
    value: {
      type: 'oauth',
      access: 'st_access',
      refresh: 'rt_refresh',
      expires: NOW + 30 * 1000,
      metadata: { server: 'https://opencode.ai/console', orgID: 'org_FIXTURE' }
    }
  }]);
  assert.equal(readV2ConsoleSession(env, { now: () => NOW }), null);
});

test('an expired OAuth session still exposes its workspace identity', () => {
  const env = envWithDb([{
    integrationId: 'opencode',
    value: {
      type: 'oauth',
      access: 'st_access',
      refresh: 'rt_refresh',
      expires: NOW + 30 * 1000,
      metadata: { server: 'https://opencode.ai/console', orgID: 'org_FIXTURE' }
    }
  }]);
  assert.deepEqual(readV2ConsoleIdentity(env, { now: () => NOW }), {
    orgId: 'org_FIXTURE',
    server: 'https://opencode.ai/console'
  });
});

for (const [name, patch] of [
  ['missing access', { access: '' }],
  ['missing org', { metadata: { server: 'https://opencode.ai/console' } }],
  ['invalid org', { metadata: { server: 'https://opencode.ai/console', orgID: 'workspace' } }],
  ['missing expiry', { expires: undefined }],
  ['foreign server', { metadata: { server: 'https://example.com/console', orgID: 'org_FIXTURE' } }],
  ['wrong type', { type: 'key' }]
]) test(`OAuth session without ${name} is not usable`, () => {
  const env = envWithDb([{
    integrationId: 'opencode',
    value: {
      type: 'oauth',
      access: 'st_access',
      refresh: 'rt_refresh',
      expires: NOW + 60 * 60 * 1000,
      metadata: { server: 'https://opencode.ai/console', orgID: 'org_FIXTURE' },
      ...patch
    }
  }]);
  assert.equal(readV2ConsoleSession(env, { now: () => NOW }), null);
  assert.equal(readV2ConsoleIdentity(env, { now: () => NOW }), null);
});

test('an empty env is not a licence to read the developer home database', () => {
  assert.equal(readV2ApiKey('opencode-go', {}), '');
  assert.equal(readV2ConsoleSession({}), null);
  assert.equal(readV2ConsoleIdentity({}), null);
});

test('a missing credential table reads as no credential', () => {
  const env = envWithDb([], { table: false });
  assert.equal(readV2Credential('opencode-go', env), null);
});

test('OPENCODE_DB overrides data-directory discovery', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-v2-db-'));
  const dbPath = path.join(dir, 'custom.db');
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE credential (
      id TEXT PRIMARY KEY, integration_id TEXT, value TEXT, active INTEGER, time_updated INTEGER
    )
  `);
  db.prepare('INSERT INTO credential VALUES (?, ?, ?, 1, ?)')
    .run('cred', 'opencode-go', JSON.stringify({ type: 'key', key: 'override-key' }), NOW);
  db.close();
  assert.equal(readV2ApiKey('opencode-go', { OPENCODE_DB: dbPath }), 'override-key');
});

test('Console server normalization accepts only the public Console origins', () => {
  assert.equal(normalizeConsoleServer('https://opencode.ai/console/'), 'https://opencode.ai/console');
  assert.equal(normalizeConsoleServer('https://console.opencode.ai'), 'https://console.opencode.ai');
  assert.equal(normalizeConsoleServer('https://example.com/console'), '');
  assert.equal(normalizeConsoleServer(''), '');
});
