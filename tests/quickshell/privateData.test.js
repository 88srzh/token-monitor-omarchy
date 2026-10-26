'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DatabaseSync } = require('node:sqlite');
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
  const names = ['session-usage-archive.sqlite', 'session-usage-archive.sqlite-wal', 'session-usage-archive.sqlite-shm', 'nested/cache.json'];
  for (const name of names) fs.writeFileSync(path.join(dir, name), `x ${name}`, { mode: 0o644 });
  const inodes = new Map(names.map((name) => [name, fs.statSync(path.join(dir, name)).ino]));
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
  for (const name of names) {
    const file = path.join(dir, name);
    assert.equal(modeOf(file), 0o600, name);
    assert.notEqual(fs.statSync(file).ino, inodes.get(name), `${name} is a new file`);
    assert.equal(fs.readFileSync(file, 'utf8'), `x ${name}`, `${name} keeps its contents`);
  }
  assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')), []);
  assert.equal(modeOf(outside), 0o644);
  assert.equal(modeOf(outsideDir), 0o755);
  assert.equal(modeOf(path.join(outsideDir, 'file')), 0o644);
});

test('a descriptor opened on the readable archive sees none of the records written after closing it', posixOnly, () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-private-')), 'Token Monitor');
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  const file = path.join(dir, 'session-usage-archive.sqlite');
  const write = (marker) => {
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS sessions (entry TEXT)');
    db.prepare('INSERT INTO sessions VALUES (?)').run(marker);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
  };
  write('before-upgrade');
  fs.chmodSync(file, 0o644);
  // Another user opens the database while it is still readable.
  const earlier = fs.openSync(file, 'r');
  try {
    makeOwnerOnly(dir);
    write('after-upgrade');

    const leaked = fs.readFileSync(earlier).toString('latin1');
    assert.match(leaked, /before-upgrade/);
    assert.doesNotMatch(leaked, /after-upgrade/);
    assert.equal(modeOf(file), 0o600);
    const db = new DatabaseSync(file, { readOnly: true });
    assert.deepEqual(db.prepare('SELECT entry FROM sessions').all().map((row) => row.entry), ['before-upgrade', 'after-upgrade']);
    db.close();
  } finally {
    fs.closeSync(earlier);
  }
});

test('a missing directory is created owner-only', posixOnly, () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-private-')), 'a', 'Token Monitor');
  makeOwnerOnly(dir);
  assert.equal(modeOf(dir), 0o700);
});

test('the hub data and the shared data directory belong to the hub and the agent', posixOnly, () => {
  const env = { TOKEN_MONITOR_DATA_FILE: '/srv/tm/devices.json', XDG_CONFIG_HOME: '/home/u/.config' };
  assert.deepEqual(dataDirs(env), { hub: '/srv/tm', agent: sharedDataDir({ env }) });
});

test('each service closes its own data directory with an owner-only umask before starting', () => {
  const install = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'omarchy', 'install.sh'), 'utf8');
  const units = install.split(/^cat > /m).slice(1);
  assert.equal(units.length, 2);
  for (const unit of units) {
    const service = unit.match(/token-monitor-(hub|agent)\.service/)[1];
    assert.match(unit, /^UMask=0077$/m);
    const guard = unit.indexOf(`ExecStartPre=$node $repo/scripts/omarchy/privateData.js ${service}\n`);
    assert.ok(guard > 0 && guard < unit.indexOf('ExecStart='), `${service}: privateData.js runs before ExecStart`);
  }
  // The agent stops before the hub's pre-start step and starts after it.
  assert.match(units[1], /^After=token-monitor-hub\.service$/m);
});
