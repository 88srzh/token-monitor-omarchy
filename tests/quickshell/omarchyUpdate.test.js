'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');

test('the widget updater refreshes the plugin and installs its pinned backend', (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'omarchy-update-check-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const plugin = path.join(temp, 'plugin');
  const home = path.join(temp, 'home');
  const backend = path.join(home, '.local', 'share', 'token-monitor');
  const installer = path.join(backend, 'scripts', 'omarchy', 'install.sh');
  const bin = path.join(temp, 'bin');
  const log = path.join(temp, 'calls.log');
  const pin = '0123456789abcdef0123456789abcdef01234567';
  fs.mkdirSync(plugin, { recursive: true });
  fs.mkdirSync(path.dirname(installer), { recursive: true });
  fs.mkdirSync(bin);

  const updater = path.join(plugin, 'update.sh');
  fs.copyFileSync(path.join(root, 'omarchy-plugin', 'update.sh'), updater);
  fs.writeFileSync(installer, '#!/bin/sh\nprintf \'install\\n\' >> "$CALL_LOG"\n');
  fs.chmodSync(installer, 0o755);
  fs.writeFileSync(path.join(bin, 'omarchy'), '#!/bin/sh\nprintf \'omarchy:%s\\n\' "$*" >> "$CALL_LOG"\n');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh
if [ "$3" = "show" ]; then
    printf '  && git -C backend checkout --detach %s \\\\n' "$PIN"
    exit 0
fi
printf 'git:%s\\n' "$*" >> "$CALL_LOG"
`);
  fs.chmodSync(path.join(bin, 'omarchy'), 0o755);
  fs.chmodSync(path.join(bin, 'git'), 0o755);

  const result = spawnSync(updater, [], {
    cwd: temp,
    env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CALL_LOG: log, PIN: pin },
    encoding: 'utf8'
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), [
    'omarchy:plugin update io.github.88srzh.token-monitor --yes',
    `git:-C ${backend} fetch origin`,
    `git:-C ${backend} checkout --detach ${pin}`,
    'install'
  ]);
});
