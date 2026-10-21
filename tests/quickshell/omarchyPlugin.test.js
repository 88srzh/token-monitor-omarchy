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

// The plugin folder is published as its own repository for `omarchy plugin
// add` and the plugin marketplace, which require these files at its root.
test('the plugin folder is a publishable plugin repository', () => {
  for (const name of fs.readdirSync(pluginDir)) {
    assert.equal(fs.lstatSync(path.join(pluginDir, name)).isSymbolicLink(), false, name);
  }
  for (const name of ['README.md', 'LICENSE', 'preview.png']) {
    assert.ok(fs.statSync(path.join(pluginDir, name)).isFile(), name);
  }
  // The MIT notice of the project the widget is built on must travel with it.
  assert.match(fs.readFileSync(path.join(pluginDir, 'LICENSE'), 'utf8'), /Copyright \(c\) 2026 Javis\n/);
  // Marketplace ids are global, so they are namespaced.
  assert.match(manifest.id, /^io\.github\.[^.]+\.[a-z0-9-]+$/);
});

test('the installer adds the plugin this folder publishes and writes the config it reads', () => {
  const install = fs.readFileSync(path.join(root, 'scripts', 'omarchy', 'install.sh'), 'utf8');
  assert.equal(install.match(/^plugin_id=(.+)$/m)[1], manifest.id);
  const feed = fs.readFileSync(path.join(pluginDir, 'Feed.qml'), 'utf8');
  const relative = install.match(/^backend_config=\$config_home\/(.+)$/m)[1];
  assert.ok(feed.includes(`"/${relative}"`), relative);
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

// The marketplace reviews the backend revision the widget installs, so the
// README pins it; publish-plugin.sh fills in the SHA.
test('the widget README installs and updates a pinned backend commit', () => {
  const readme = fs.readFileSync(path.join(pluginDir, 'README.md'), 'utf8');
  const blocks = readme.match(/```bash\n[\s\S]*?```/g).filter((block) => block.includes('install.sh') && !block.includes('--uninstall'));
  assert.equal(blocks.length, 2);
  for (const block of blocks) {
    // The marketplace scanner only counts a pin that stays in one && chain
    // up to the installer, so a failed checkout cannot fall through to it.
    assert.match(block, /checkout --detach @BACKEND_REV@ \\\n\s*&& [^\n]*install\.sh/);
    assert.doesNotMatch(block, /git pull/);
  }
  const publish = fs.readFileSync(path.join(root, 'scripts', 'omarchy', 'publish-plugin.sh'), 'utf8');
  assert.ok(publish.includes('s/@BACKEND_REV@/$rev/g'));
});
