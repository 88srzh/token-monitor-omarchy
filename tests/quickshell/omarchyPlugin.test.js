'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..', '..');
const pluginDir = path.join(root, 'omarchy-plugin');
const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8'));

// The rules omarchy-plugin-validate enforces, so a broken manifest fails here
// rather than as a silently skipped widget on someone's bar.
test('the plugin manifest passes the omarchy-shell schema rules', () => {
  assert.equal(manifest.schemaVersion, 1);
  for (const field of ['id', 'name', 'version', 'kinds', 'entryPoints']) assert.ok(field in manifest, field);
  assert.match(manifest.id, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  assert.ok(!manifest.id.startsWith('omarchy.'), 'omarchy.* is reserved');
  assert.deepEqual(manifest.kinds, ['bar-widget']);
  assert.ok(['left', 'center', 'right'].includes(manifest.barWidget.defaultSection));
  for (const entry of Object.values(manifest.entryPoints)) {
    assert.ok(!entry.startsWith('/') && !entry.includes('..'), entry);
    assert.ok(fs.statSync(path.join(pluginDir, entry)).isFile(), entry);
  }
  assert.ok(manifest.entryPoints.barWidget);
});

test('the plugin folder holds no symlinks and no local.json', () => {
  for (const name of fs.readdirSync(pluginDir)) {
    assert.equal(fs.lstatSync(path.join(pluginDir, name)).isSymbolicLink(), false, name);
  }
  // local.json is machine-specific and written by the installer.
  assert.equal(fs.existsSync(path.join(pluginDir, 'local.json')), false);
});

test('the widget launches the bridge at its real path', () => {
  const feed = fs.readFileSync(path.join(pluginDir, 'Feed.qml'), 'utf8');
  const match = feed.match(/root\.repoRoot \+ "(\/[^"]+)"/);
  assert.ok(match, 'Feed.qml builds the bridge path from repoRoot');
  assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
});

test('the period setting offers exactly the periods the model builds', () => {
  const { buildDashboardModel } = require('../../src/quickshell/dashboardModel');
  const schema = manifest.barWidget.schema.find((entry) => entry.key === 'period');
  assert.deepEqual(schema.options, Object.keys(buildDashboardModel({}).periods));
  assert.equal(manifest.barWidget.defaults.period, schema.defaultValue);
});
