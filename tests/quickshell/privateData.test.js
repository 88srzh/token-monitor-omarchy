'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { dataDirs, makeOwnerOnly } = require('../../scripts/omarchy/privateData');
const { sharedDataDir } = require('../../src/shared/config');

const modeOf = (file) => fs.lstatSync(file).mode & 0o7777;

// The Omarchy scripts run on Linux only: these checks rely on POSIX modes,
// renaming over an existing file and Linux data paths.
const posixOnly = { skip: process.platform === 'win32' };

test('a readable archive left by an earlier install becomes owner-only', posixOnly, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-private-'));
  const dir = path.join(root, 'Token Monitor');
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true, mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  for (const name of ['session-usage-archive.sqlite', 'session-usage-archive.sqlite-wal', 'session-usage-archive.sqlite-shm', 'nested/cache.json']) {
    fs.writeFileSync(path.join(dir, name), 'x', { mode: 0o644 });
  }
  const outside = path.join(root, 'outside');
  fs.writeFileSync(outside, 'x', { mode: 0o644 });
  fs.symlinkSync(outside, path.join(dir, 'link'));
  const outsideDir = path.join(root, 'outside-dir');
  fs.mkdirSync(outsideDir, { mode: 0o755 });
  fs.chmodSync(outsideDir, 0o755);
  fs.writeFileSync(path.join(outsideDir, 'file'), 'x', { mode: 0o644 });
  fs.symlinkSync(outsideDir, path.join(dir, 'dir-link'));

  makeOwnerOnly(dir);

  assert.equal(modeOf(dir), 0o700);
  assert.equal(modeOf(path.join(dir, 'nested')), 0o700);
  for (const name of ['session-usage-archive.sqlite', 'session-usage-archive.sqlite-wal', 'session-usage-archive.sqlite-shm', 'nested/cache.json']) {
    assert.equal(modeOf(path.join(dir, name)), 0o600, name);
  }
  assert.equal(modeOf(outside), 0o644);
  assert.equal(modeOf(outsideDir), 0o755);
  assert.equal(modeOf(path.join(outsideDir, 'file')), 0o644);
});

test('a missing directory is created owner-only', posixOnly, () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-private-')), 'a', 'Token Monitor');
  makeOwnerOnly(dir);
  assert.equal(modeOf(dir), 0o700);
});

test('both the hub data and the shared data directory are covered', posixOnly, () => {
  const env = { TOKEN_MONITOR_DATA_FILE: '/srv/tm/devices.json', XDG_CONFIG_HOME: '/home/u/.config' };
  assert.deepEqual(dataDirs(env), ['/srv/tm', sharedDataDir({ env })]);
});

test('both services close the data directories with an owner-only umask before starting', () => {
  const install = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'omarchy', 'install.sh'), 'utf8');
  for (const unit of install.split(/^cat > /m).slice(1)) {
    assert.match(unit, /^UMask=0077$/m);
    const guard = unit.indexOf('ExecStartPre=$node $repo/scripts/omarchy/privateData.js\n');
    assert.ok(guard > 0 && guard < unit.indexOf('ExecStart='), 'privateData.js runs before ExecStart');
  }
});
