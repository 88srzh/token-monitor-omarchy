'use strict';

// Keeps the Omarchy install's hub private to its owner. Without a secret the
// hub accepts every request, and loopback binding does not stop other local
// users from reading device records or deleting them. With a secret, though,
// the hub binds every interface unless told otherwise, so the host is pinned
// too.
//
//   node hubSecret.js provision <.env>  add a secret and a loopback host if missing; make the file owner-only
//   node hubSecret.js require           exit non-zero when the checkout's .env gives no secret

const crypto = require('node:crypto');
const fs = require('node:fs');
const dotenv = require('dotenv');

const SECRET_KEY = 'TOKEN_MONITOR_SECRET';
const HOST_KEY = 'TOKEN_MONITOR_HOST';

function keyLine(key) {
  return new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, 'm');
}

// Returns the keys it added, so the installer can say what changed.
function provisionEnv(file, { randomSecret = () => crypto.randomBytes(32).toString('hex') } = {}) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const values = dotenv.parse(text);
  const added = [];
  const set = (key, value) => {
    const line = `${key}=${value}`;
    // An empty `KEY=` copied from .env.example is filled in rather than
    // followed by a second assignment.
    if (keyLine(key).test(text)) text = text.replace(keyLine(key), line);
    else text += `${text === '' || text.endsWith('\n') ? '' : '\n'}${line}\n`;
    added.push(key);
  };
  if (!String(values[SECRET_KEY] || '').trim()) set(SECRET_KEY, randomSecret());
  if (!String(values[HOST_KEY] || '').trim()) set(HOST_KEY, '127.0.0.1');
  fs.writeFileSync(file, text, { mode: 0o600 });
  // writeFileSync's mode only applies when it creates the file.
  fs.chmodSync(file, 0o600);
  return added;
}

function hasSecret(env = process.env) {
  return String(env[SECRET_KEY] || '').trim() !== '';
}

if (require.main === module) {
  const [command, file] = process.argv.slice(2);
  if (command === 'provision' && file) {
    const added = provisionEnv(file);
    if (added.length) process.stdout.write(`Added ${added.join(' and ')} to ${file}.\n`);
  } else if (command === 'require') {
    require('../../src/shared/config').loadDotEnv();
    if (!hasSecret()) {
      process.stderr.write(`${SECRET_KEY} is not set; re-run scripts/omarchy/install.sh, which provisions one.\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write('usage: hubSecret.js provision <.env> | require\n');
    process.exit(2);
  }
}

module.exports = { provisionEnv, hasSecret };
