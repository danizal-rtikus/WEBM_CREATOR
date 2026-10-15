import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, '../..');
// Mode dev (npm run dev): halaman render diambil dari Vite dev server
export const DEV = process.argv.includes('--dev');
export const PORT = Number(process.env.PORT || 3001);
// Hanya listen di localhost — editor ini untuk pemakaian pribadi
export const HOST = process.env.HOST || '127.0.0.1';
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
export const DIRS = {
  projects: path.join(DATA_DIR, 'projects'),
  media: path.join(DATA_DIR, 'media'),
  thumbs: path.join(DATA_DIR, 'media', 'thumbs'),
  renders: path.join(DATA_DIR, 'renders'),
  tmp: path.join(DATA_DIR, 'tmp'),
};
export const CLIENT_DIST = path.join(ROOT, 'client', 'dist');
export const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_MB || 500) * 1024 * 1024;

for (const d of Object.values(DIRS)) fs.mkdirSync(d, { recursive: true });
