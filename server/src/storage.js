// Penyimpanan berbasis file JSON di disk lokal (tanpa server database).
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DIRS, DATA_DIR } from './config.js';

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('base64url')}`;
}

async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  try {
    await fs.rename(tmp, file);
  } catch {
    // Windows kadang menolak rename saat file sedang dibuka antivirus/indexer
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    await fs.rm(tmp, { force: true });
  }
}

// ---------- Proyek ----------
const projectFile = (id) => {
  if (!/^[\w-]+$/.test(id)) throw Object.assign(new Error('ID tidak valid'), { status: 400 });
  return path.join(DIRS.projects, `${id}.json`);
};

export async function listProjects() {
  const files = (await fs.readdir(DIRS.projects)).filter((f) => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const p = JSON.parse(await fs.readFile(path.join(DIRS.projects, f), 'utf8'));
      out.push({ id: p.id, name: p.name, updatedAt: p.updatedAt, settings: p.settings });
    } catch {
      /* lewati file rusak */
    }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getProject(id) {
  try {
    return JSON.parse(await fs.readFile(projectFile(id), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') throw Object.assign(new Error('Proyek tidak ditemukan'), { status: 404 });
    throw e;
  }
}

export async function createProject({ name, settings } = {}) {
  const now = new Date().toISOString();
  const p = {
    id: newId('prj'),
    name: name || 'Proyek baru',
    settings: { width: 1920, height: 1080, fps: 30, duration: 10, background: '#000000', transparent: true, ...(settings || {}) },
    tracks: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonAtomic(projectFile(p.id), p);
  return p;
}

export async function saveProject(id, body) {
  const cur = await getProject(id);
  if (typeof body.version === 'number' && body.version !== cur.version) {
    throw Object.assign(new Error('Proyek sudah diubah di tab lain. Muat ulang halaman.'), { status: 409 });
  }
  const next = {
    ...cur,
    name: String(body.name || cur.name).slice(0, 200),
    settings: body.settings || cur.settings,
    tracks: Array.isArray(body.tracks) ? body.tracks : cur.tracks,
    version: cur.version + 1,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(projectFile(id), next);
  return next;
}

export async function deleteProject(id) {
  await fs.rm(projectFile(id), { force: true });
}

// ---------- Aset ----------
const ASSETS_FILE = path.join(DATA_DIR, 'assets.json');
let assetsCache = null;

export async function listAssets() {
  if (!assetsCache) {
    try {
      assetsCache = JSON.parse(await fs.readFile(ASSETS_FILE, 'utf8'));
    } catch {
      assetsCache = [];
    }
  }
  return assetsCache;
}

export async function addAsset(asset) {
  const list = await listAssets();
  list.unshift(asset);
  await writeJsonAtomic(ASSETS_FILE, list);
  return asset;
}

export async function updateAsset(id, patch) {
  const list = await listAssets();
  const a = list.find((x) => x.id === id);
  if (!a) return null;
  Object.assign(a, patch);
  await writeJsonAtomic(ASSETS_FILE, list);
  return a;
}

export async function removeAsset(id) {
  const list = await listAssets();
  const a = list.find((x) => x.id === id);
  if (!a) throw Object.assign(new Error('Aset tidak ditemukan'), { status: 404 });
  assetsCache = list.filter((x) => x.id !== id);
  await writeJsonAtomic(ASSETS_FILE, assetsCache);
  for (const f of [a.file, a.thumbFile, a.renderFile].filter(Boolean)) await fs.rm(path.join(DIRS.media, f), { force: true });
  return a;
}
