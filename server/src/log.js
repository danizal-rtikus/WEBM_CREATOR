// Salin semua output console ke data/logs/server.log agar mudah diperiksa saat ada masalah.
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import { DATA_DIR } from './config.js';

const dir = path.join(DATA_DIR, 'logs');
fs.mkdirSync(dir, { recursive: true });
export const LOG_FILE = path.join(dir, 'server.log');

try {
  if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) {
    fs.renameSync(LOG_FILE, path.join(dir, 'server.old.log'));
  }
} catch {
  /* abaikan */
}

for (const level of ['log', 'warn', 'error']) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    try {
      const line = `${new Date().toISOString()} [${level}] ${util.format(...args)}\n`;
      fs.appendFileSync(LOG_FILE, line);
    } catch {
      /* jangan sampai logging mematikan server */
    }
  };
}

console.log(`==== server mulai (pid ${process.pid}, node ${process.version}, ${process.platform}) ====`);
process.on('exit', (code) => {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [exit] proses berhenti, kode ${code}\n`);
  } catch {
    /* noop */
  }
});
