'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dotenv = require('dotenv');

const { provisionEnv, hasSecret } = require('../../scripts/omarchy/hubSecret');

function tempEnv(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-hub-secret-'));
  const file = path.join(dir, '.env');
  if (content !== undefined) fs.writeFileSync(file, content, { mode: 0o644 });
  return file;
}

const fixed = { randomSecret: () => 'generated' };

test('a missing .env gets an owner-only secret and a loopback host', () => {
  const file = tempEnv();
  assert.deepEqual(provisionEnv(file, fixed), ['TOKEN_MONITOR_SECRET', 'TOKEN_MONITOR_HOST']);
  assert.deepEqual(dotenv.parse(fs.readFileSync(file)), { TOKEN_MONITOR_SECRET: 'generated', TOKEN_MONITOR_HOST: '127.0.0.1' });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('an empty secret copied from .env.example is filled in place', () => {
  const file = tempEnv('# hub\nTOKEN_MONITOR_SECRET=\nTOKEN_MONITOR_PORT=17321');
  provisionEnv(file, fixed);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.match(/TOKEN_MONITOR_SECRET=/g).length, 1);
  assert.deepEqual(dotenv.parse(text), {
    TOKEN_MONITOR_SECRET: 'generated', TOKEN_MONITOR_PORT: '17321', TOKEN_MONITOR_HOST: '127.0.0.1'
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('a secret and host the owner set are kept', () => {
  const file = tempEnv('TOKEN_MONITOR_SECRET="mine"\nTOKEN_MONITOR_HOST=0.0.0.0\n');
  assert.deepEqual(provisionEnv(file, fixed), []);
  assert.deepEqual(dotenv.parse(fs.readFileSync(file)), { TOKEN_MONITOR_SECRET: 'mine', TOKEN_MONITOR_HOST: '0.0.0.0' });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('the default secret is long and random', () => {
  const file = tempEnv();
  provisionEnv(file);
  const { TOKEN_MONITOR_SECRET: secret } = dotenv.parse(fs.readFileSync(file));
  assert.match(secret, /^[0-9a-f]{64}$/);
});

test('a blank secret does not count as one', () => {
  assert.equal(hasSecret({}), false);
  assert.equal(hasSecret({ TOKEN_MONITOR_SECRET: '  ' }), false);
  assert.equal(hasSecret({ TOKEN_MONITOR_SECRET: 'x' }), true);
});

test('both services refuse to start without the secret', () => {
  const install = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'omarchy', 'install.sh'), 'utf8');
  const guards = install.match(/^ExecStartPre=\$node \$repo\/scripts\/omarchy\/hubSecret\.js require$/gm) || [];
  assert.equal(guards.length, 2);
});
