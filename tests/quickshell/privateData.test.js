'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DatabaseSync } = require('node:sqlite');
const { MARKER, dataDirs, makeOwnerOnly } = require('../../scripts/omarchy/privateData');
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

function archiveFixture() {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tm-private-')), 'Token Monitor');
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  const file = path.join(dir, 'session-usage-archive.sqlite');
  const write = (entry) => {
    const db = new DatabaseSync(file);
    db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS sessions (entry TEXT)');
    db.prepare('INSERT INTO sessions VALUES (?)').run(entry);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db.close();
  };
  const entries = () => {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      return db.prepare('SELECT entry FROM sessions').all().map((row) => row.entry);
    } finally {
      db.close();
    }
  };
  return { dir, file, write, entries };
}

// Another user opened the database while it was readable; after closing, the
// owner's later writes must not reach that descriptor.
function assertEarlierDescriptorIsCutOff({ dir, file, write, entries }, earlier) {
  try {
    makeOwnerOnly(dir);
    write('after-upgrade');

    const leaked = fs.readFileSync(earlier).toString('latin1');
    assert.match(leaked, /before-upgrade/);
    assert.doesNotMatch(leaked, /after-upgrade/);
    assert.equal(modeOf(file), 0o600);
    assert.deepEqual(entries(), ['before-upgrade', 'after-upgrade']);
  } finally {
    fs.closeSync(earlier);
  }
}

test('a descriptor opened on the readable archive sees none of the records written after closing it', posixOnly, () => {
  const fixture = archiveFixture();
  fixture.write('before-upgrade');
  fs.chmodSync(fixture.file, 0o644);
  assertEarlierDescriptorIsCutOff(fixture, fs.openSync(fixture.file, 'r'));
});

test('an archive an earlier release closed with chmod alone still moves to a new inode', posixOnly, () => {
  const fixture = archiveFixture();
  fixture.write('before-upgrade');
  fs.chmodSync(fixture.file, 0o644);
  const earlier = fs.openSync(fixture.file, 'r');
  // What the chmod-only release did: owner-only modes on the same inodes.
  fs.chmodSync(fixture.dir, 0o700);
  fs.chmodSync(fixture.file, 0o600);
  assertEarlierDescriptorIsCutOff(fixture, earlier);
});

test('once every file has a new inode, later runs leave owner-only files in place', posixOnly, () => {
  const { dir, file, write } = archiveFixture();
  write('entry');
  makeOwnerOnly(dir);
  assert.ok(fs.existsSync(path.join(dir, MARKER)));
  const inode = fs.statSync(file).ino;

  makeOwnerOnly(dir);
  assert.equal(fs.statSync(file).ino, inode);

  fs.chmodSync(file, 0o644);
  makeOwnerOnly(dir);
  assert.notEqual(fs.statSync(file).ino, inode, 'a file readable again is still replaced');
  assert.equal(modeOf(file), 0o600);
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
