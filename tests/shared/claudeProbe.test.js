'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { claudeProbeDir, prepareClaudeProbeDir } = require('../../src/shared/providers/claude/probe');

const posix = process.platform !== 'win32';
const settingsOf = (dir) => fs.readFileSync(path.join(dir, '.claude', 'settings.local.json'), 'utf8');
const SETTINGS = '{"disableDeepLinkRegistration":"disable"}\n';

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-claude-probe-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('the probe directory is in the user data directory, not the shared temp directory', () => {
  const dir = claudeProbeDir({ platform: 'linux', env: { XDG_CONFIG_HOME: '/home/u/.config' } });
  assert.equal(dir, path.join('/home/u/.config', 'Token Monitor', 'claude-probe'));
  assert.equal(dir.startsWith(os.tmpdir()), false);
});

test('a new probe directory is owner-only with only our settings', (t) => {
  const dir = path.join(tempRoot(t), 'Token Monitor', 'claude-probe');
  assert.equal(prepareClaudeProbeDir({ claudeProbeDir: dir }), dir);
  assert.equal(settingsOf(dir), SETTINGS);
  if (posix) {
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(dir, '.claude')).mode & 0o777, 0o700);
  }
});

test('settings left in the probe directory are replaced before every start', (t) => {
  const dir = path.join(tempRoot(t), 'claude-probe');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), '{"hooks":{"SessionStart":[]}}');
  prepareClaudeProbeDir({ claudeProbeDir: dir });
  assert.equal(settingsOf(dir), SETTINGS);
});

test('a probe directory others could write to is recreated empty', { skip: !posix }, (t) => {
  const dir = path.join(tempRoot(t), 'claude-probe');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.chmodSync(dir, 0o777);
  fs.writeFileSync(path.join(dir, '.mcp.json'), '{}');
  prepareClaudeProbeDir({ claudeProbeDir: dir });
  assert.deepEqual(fs.readdirSync(dir), ['.claude']);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
});

test('a symlinked probe directory is refused', { skip: !posix }, (t) => {
  const root = tempRoot(t);
  const target = path.join(root, 'elsewhere');
  fs.mkdirSync(target, { mode: 0o700 });
  const dir = path.join(root, 'claude-probe');
  fs.symlinkSync(target, dir);
  assert.throws(() => prepareClaudeProbeDir({ claudeProbeDir: dir }), /not a directory/);
  assert.deepEqual(fs.readdirSync(target), []);
});

test('a probe directory owned by another user is refused', { skip: !posix }, (t) => {
  const dir = path.join(tempRoot(t), 'claude-probe');
  fs.mkdirSync(dir, { mode: 0o700 });
  t.mock.method(process, 'getuid', () => process.geteuid() + 1);
  assert.throws(() => prepareClaudeProbeDir({ claudeProbeDir: dir }), /owned by another user/);
  assert.deepEqual(fs.readdirSync(dir), []);
});
