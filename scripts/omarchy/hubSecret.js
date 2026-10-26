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
const path = require('node:path');
const dotenv = require('dotenv');

const SECRET_KEY = 'TOKEN_MONITOR_SECRET';
const HOST_KEY = 'TOKEN_MONITOR_HOST';

function keyLine(key) {
  return new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, 'm');
}

// Replaces the file with an owner-only one in a single rename, so the new
// secret never lands in the old inode: chmod after the write would leave a
// window, and a descriptor another user opened earlier stays readable.
function replaceOwnerOnly(file, text) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

// Returns the keys it added, so the installer can say what changed, and
// whether a secret the owner had already set was readable by other users.
function provisionEnv(file, { randomSecret = () => crypto.randomBytes(32).toString('hex') } = {}) {
  const exists = fs.existsSync(file);
  let text = exists ? fs.readFileSync(file, 'utf8') : '';
  const wasShared = exists && (fs.statSync(file).mode & 0o077) !== 0;
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
  const hadSecret = String(values[SECRET_KEY] || '').trim() !== '';
  if (!hadSecret) set(SECRET_KEY, randomSecret());
  if (!String(values[HOST_KEY] || '').trim()) set(HOST_KEY, '127.0.0.1');
  if (added.length) replaceOwnerOnly(file, text);
  else fs.chmodSync(file, 0o600);
  return { added, exposedSecret: hadSecret && wasShared };
}

function hasSecret(env = process.env) {
  return String(env[SECRET_KEY] || '').trim() !== '';
}

if (require.main === module) {
  const [command, file] = process.argv.slice(2);
  if (command === 'provision' && file) {
    const { added, exposedSecret } = provisionEnv(file);
    if (added.length) process.stdout.write(`Added ${added.join(' and ')} to ${file}.\n`);
    if (exposedSecret) {
      process.stderr.write(`warning: ${file} was readable by other users, so they may know its ${SECRET_KEY}. It is owner-only now; replace the secret, and update it on any device that uses this hub.\n`);
    }
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

module.exports = { provisionEnv, hasSecret, replaceOwnerOnly };
