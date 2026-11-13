'use strict';

// OpenCode 2.x keeps integration credentials in its SQLite database instead of
// auth.json. Two ambient credentials matter to the limits collector: the Go API
// key (`opencode-go`) and the Console OAuth session (`opencode`). Both are read
// from the same `credential` table the OpenCode client uses.
//
// This module only reads. An expired OAuth access token is ignored rather than
// refreshed: refreshing it would rotate a single-use refresh token out from
// under the OpenCode client that owns it, and the token becomes fresh again the
// next time the user signs in or starts the client. The workspace identity the
// stale credential still carries is read separately, because aliases let the
// Hub group this device with another one that holds the same account through a
// different credential.

const { discoverDbPaths } = require('./goLimits');
const { cleanSecret } = require('../../limits/providerHelpers');

let sqlite = null;
try { sqlite = require('node:sqlite'); } catch (_) { sqlite = null; }

const CONSOLE_SERVERS = new Set([
  'https://opencode.ai/console',
  'https://console.opencode.ai'
]);
const OAUTH_EXPIRY_SKEW_MS = 60_000;

function hasDataDirHint(env) {
  // A caller that passes `{}` is asking for no ambient credentials (credential
  // probes in particular do this). Without this guard discoverDbPaths would
  // fall back to the developer's home directory and mix a real account into a
  // test or a probe.
  return Boolean(env && (env.OPENCODE_DB || env.XDG_DATA_HOME || env.HOME || env.USERPROFILE));
}

function readCredentialRows(dbPath, sqliteMod = sqlite) {
  const db = new sqliteMod.DatabaseSync(dbPath, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout = 250');
    const table = db.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'credential'"
    ).get();
    if (!table) return [];
    return db.prepare(`
      SELECT integration_id AS integrationId, value, time_updated AS timeUpdated
      FROM credential
      WHERE active = 1
      ORDER BY time_updated DESC
    `).all();
  } finally {
    db.close();
  }
}

function readV2Credential(integrationId, env = process.env, deps = {}) {
  const id = String(integrationId || '').trim();
  if (!id || !hasDataDirHint(env)) return null;
  const sqliteMod = deps.sqlite !== undefined ? deps.sqlite : sqlite;
  if (!sqliteMod) return null;

  const rows = [];
  for (const dbPath of discoverDbPaths(env)) {
    try {
      rows.push(...readCredentialRows(dbPath, sqliteMod));
    } catch (_) { /* unreadable channel database */ }
  }

  const candidates = rows
    .filter((row) => String(row.integrationId || '') === id)
    .sort((a, b) => Number(b.timeUpdated || 0) - Number(a.timeUpdated || 0));
  for (const row of candidates) {
    try {
      const value = JSON.parse(String(row.value || ''));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch (_) { /* skip malformed credential */ }
  }
  return null;
}

function readV2ApiKey(integrationId, env = process.env, deps = {}) {
  const credential = readV2Credential(integrationId, env, deps);
  if (!credential) return '';
  const type = String(credential.type || '').toLowerCase();
  // 2.x writes `key`; auth.json's API entries say `api`. Accept both so an
  // upgraded installation that carried a row across keeps working.
  if (type !== 'key' && type !== 'api') return '';
  return cleanSecret(credential.key);
}

function normalizeConsoleServer(raw) {
  const text = String(raw || '').trim().replace(/\/+$/, '');
  return CONSOLE_SERVERS.has(text) ? text : '';
}

function consoleIdentityFromCredential(credential) {
  if (!credential || String(credential.type || '').toLowerCase() !== 'oauth') return null;
  if (!cleanSecret(credential.access)) return null;

  const metadata = credential.metadata && typeof credential.metadata === 'object'
    ? credential.metadata
    : {};
  const orgId = String(metadata.orgID || credential.orgID || '').trim();
  const server = normalizeConsoleServer(metadata.server || credential.server || 'https://opencode.ai/console');
  const expires = Number(credential.expires);
  if (!/^(?:wrk_|org_)[A-Za-z0-9_-]+$/.test(orgId) || !server) return null;
  if (!Number.isFinite(expires) || expires <= 0) return null;
  return { orgId, server };
}

// The workspace identity is useful even when the access token has expired: it
// is the stable id a key-only device on the same account can be grouped with,
// and reading it does not touch the token or the refresh chain.
function readV2ConsoleIdentity(env = process.env, deps = {}) {
  return consoleIdentityFromCredential(readV2Credential('opencode', env, deps));
}

function readV2ConsoleSession(env = process.env, deps = {}) {
  const credential = readV2Credential('opencode', env, deps);
  const identity = consoleIdentityFromCredential(credential);
  if (!identity) return null;

  const access = cleanSecret(credential.access);
  if (!access) return null;

  const expires = Number(credential.expires);
  if (!Number.isFinite(expires) || expires <= 0) return null;
  const expiresAt = expires > 1e12 ? expires : expires * 1000;
  const now = (deps.now || Date.now)();
  if (expiresAt <= now + OAUTH_EXPIRY_SKEW_MS) return null;

  return { access, ...identity, expiresAt };
}

module.exports = {
  hasDataDirHint,
  readCredentialRows,
  readV2Credential,
  readV2ApiKey,
  readV2ConsoleIdentity,
  readV2ConsoleSession,
  normalizeConsoleServer
};
