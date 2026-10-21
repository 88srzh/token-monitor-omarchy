'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sharedDataDir } = require('../../config');

// The CLI fallback starts Claude in this directory and accepts its
// workspace-trust prompt, so whatever .claude/ settings and hooks it holds run
// as this user. It therefore lives in the user's own data directory and must
// be a real directory that only this user can write; the old shared
// /tmp/token-monitor-claude-probe could be pre-created by another local user.
function claudeProbeDir(deps = {}) {
  return deps.claudeProbeDir || path.join(sharedDataDir(deps), 'claude-probe');
}

// Probe sessions from before the move still carry the old cwd.
function legacyClaudeProbeDir() {
  return path.join(os.tmpdir(), 'token-monitor-claude-probe');
}

const PROBE_SETTINGS = '{"disableDeepLinkRegistration":"disable"}\n';

function ownerOnlyDir(dir, platform) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let stat = fs.lstatSync(dir);
  if (!stat.isDirectory()) throw new Error(`Claude probe directory ${dir} is not a directory`);
  if (platform === 'win32') return;
  if (stat.uid !== process.getuid()) throw new Error(`Claude probe directory ${dir} is owned by another user`);
  // Anything a group or other user could have written into it is untrusted.
  if ((stat.mode & 0o022) !== 0) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { mode: 0o700 });
    stat = fs.lstatSync(dir);
  }
  if ((stat.mode & 0o077) !== 0) fs.chmodSync(dir, 0o700);
}

// Creates the probe directory and its settings before every CLI start, and
// returns its path. Throws instead of using a directory it cannot trust.
function prepareClaudeProbeDir(deps = {}) {
  const dir = claudeProbeDir(deps);
  const platform = deps.platform || process.platform;
  ownerOnlyDir(dir, platform);
  ownerOnlyDir(path.join(dir, '.claude'), platform);
  const settings = path.join(dir, '.claude', 'settings.local.json');
  const temp = `${settings}.${process.pid}.tmp`;
  fs.rmSync(temp, { force: true });
  fs.writeFileSync(temp, PROBE_SETTINGS, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, settings);
  return dir;
}

function canonicalPath(dir) {
  try { return fs.realpathSync(dir); }
  catch (_) { return path.resolve(dir); } // The probe may not have run yet.
}

function isClaudeProbeCwd(cwd, probeDir = claudeProbeDir()) {
  if (typeof cwd !== 'string' || !cwd) return false;
  // macOS registry paths use /private/var while os.tmpdir() can use /var.
  const actual = canonicalPath(cwd);
  return [probeDir, legacyClaudeProbeDir()].some((dir) => actual === canonicalPath(dir));
}

module.exports = { claudeProbeDir, isClaudeProbeCwd, prepareClaudeProbeDir };
