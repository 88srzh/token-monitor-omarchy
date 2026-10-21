'use strict';

// Closes the directories the hub and agent write usage to, so other local
// users cannot read them: the hub's data/ in the checkout and the shared data
// directory (~/.config/Token Monitor on Linux), which holds the session usage
// archive and its SQLite sidecars. Both services run it before they start, so
// files an earlier install left readable are closed before any more data is
// collected; their UMask keeps new files owner-only.
//
//   node privateData.js   make both directories and everything in them owner-only

const fs = require('node:fs');
const path = require('node:path');
const { loadDotEnv, projectRoot, sharedDataDir } = require('../../src/shared/config');

function dataDirs(env = process.env) {
  const dataFile = env.TOKEN_MONITOR_DATA_FILE || path.join(projectRoot(), 'data', 'devices.json');
  return [path.dirname(path.resolve(dataFile)), sharedDataDir({ env })];
}

// Drops group and other access below dir. Symlinks are neither changed nor
// followed, so nothing outside the directory is touched.
function makeOwnerOnly(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const close = (entry, stat) => {
    if ((stat.mode & 0o077) !== 0) fs.chmodSync(entry, stat.mode & 0o7700);
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
  for (const dir of dataDirs()) makeOwnerOnly(dir);
}

module.exports = { dataDirs, makeOwnerOnly };
