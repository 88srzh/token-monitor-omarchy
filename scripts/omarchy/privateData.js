'use strict';

// Closes the directories the hub and agent write usage to, so other local
// users cannot read them: the hub's data/ in the checkout and the shared data
// directory (~/.config/Token Monitor on Linux), which holds the session usage
// archive and its SQLite sidecars. Each service runs it for its own directory
// before it starts, so files an earlier install left readable are closed
// before any more data is collected; their UMask keeps new files owner-only.
//
// A readable file is replaced by an owner-only copy rather than chmodded: a
// descriptor another user opened earlier stays readable after chmod, and the
// writers keep updating the same inode (SQLite in place). Replacing the inode
// is only safe while nothing has the file open, which is why each service
// closes only the directory it writes, before it starts.
//
//   node privateData.js hub     the hub's data/ directory
//   node privateData.js agent   the shared data directory
//   node privateData.js         both

const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv, projectRoot, sharedDataDir } = require('../../src/shared/config');
const { replaceOwnerOnly } = require('./hubSecret');

function dataDirs(env = process.env) {
  const dataFile = env.TOKEN_MONITOR_DATA_FILE || path.join(projectRoot(), 'data', 'devices.json');
  return { hub: path.dirname(path.resolve(dataFile)), agent: sharedDataDir({ env }) };
}

// Drops group and other access below dir. Symlinks are neither changed nor
// followed, so nothing outside the directory is touched. Each directory is
// closed before anything in it is copied, so no other user can reach a copy.
function makeOwnerOnly(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const close = (entry, stat) => {
    if ((stat.mode & 0o077) === 0) return;
    if (stat.isFile()) replaceOwnerOnly(entry, fs.readFileSync(entry));
    else fs.chmodSync(entry, stat.mode & 0o7700);
  };
  const walk = (current) => {
    for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
      if (dirent.isSymbolicLink()) continue;
      const entry = path.join(current, dirent.name);
      close(entry, fs.lstatSync(entry));
      if (dirent.isDirectory()) walk(entry);
    }
  };
  close(dir, fs.statSync(dir));
  walk(dir);
}

if (require.main === module) {
  loadDotEnv();
  const dirs = dataDirs();
  const [service] = process.argv.slice(2);
  if (service && !Object.hasOwn(dirs, service)) {
    process.stderr.write('usage: privateData.js [hub | agent]\n');
    process.exit(2);
  }
  for (const dir of service ? [dirs[service]] : Object.values(dirs)) makeOwnerOnly(dir);
}

module.exports = { dataDirs, makeOwnerOnly };
