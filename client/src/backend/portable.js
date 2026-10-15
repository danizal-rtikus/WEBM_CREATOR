// Export / import proyek: JSON + media tertanam, JSON saja, atau ZIP.
// Berlaku di kedua mode (server lokal & browser), jadi proyek bisa dipindah antar-perangkat.
import { FX } from '../engine/fx/index.js';

export const FORMAT_ID = 'webm-editor-project';
export const EMBED_WARN_BYTES = 50 * 1024 * 1024;

// ---------- Utilitas ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const te = new TextEncoder();
const td = new TextDecoder();

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
async function dataUrlToBlob(u) {
  return (await fetch(u)).blob();
}

const extOf = (asset) => {
  const m = String(asset.name || '').match(/\.([a-z0-9]{1,5})$/i);
  if (m) return m[1].toLowerCase();
  const mime = String(asset.mime || '');
  return { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'video/webm': 'webm', 'video/mp4': 'mp4', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' }[mime] || 'bin';
};
const safe = (s) => String(s || 'proyek').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'proyek';

/** Daftar id aset yang dipakai proyek (klip media + parameter logo di layer FX). */
export function usedAssetIds(project) {
  const ids = new Set();
  for (const t of project.tracks)
    for (const c of t.clips) {
      if (c.assetId) ids.add(c.assetId);
      if (c.type === 'fx') {
        const def = FX[c.fx && c.fx.kind];
        if (def) for (const [k, s] of Object.entries(def.params)) if (s.type === 'asset' && c.fx.params[k]) ids.add(c.fx.params[k]);
      }
    }
  return [...ids];
}

function remapProject(project, map) {
  const p = structuredClone(project);
  for (const t of p.tracks)
    for (const c of t.clips) {
      if (c.assetId && map.has(c.assetId)) c.assetId = map.get(c.assetId);
      if (c.type === 'fx') {
        const def = FX[c.fx && c.fx.kind];
        if (def) for (const [k, s] of Object.entries(def.params)) if (s.type === 'asset' && map.has(c.fx.params[k])) c.fx.params[k] = map.get(c.fx.params[k]);
      }
    }
  return p;
}

const assetMeta = (a) => {
  const m = { ...a };
  for (const k of ['url', 'thumbUrl', 'file', 'thumbFile', 'renderFile', 'renderUrl', 'hasThumb', 'converted']) delete m[k];
  return m;
};

function cleanProject(project) {
  const { version, ...rest } = project;
  return rest;
}

// ---------- ZIP (STORE saat menulis; STORE/DEFLATE saat membaca) ----------
async function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = te.encode(f.name);
    const data = f.data instanceof Uint8Array ? f.data : new Uint8Array(await f.data.arrayBuffer());
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nama UTF-8
    local.setUint16(8, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('File ZIP rusak atau bukan ZIP');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Direktori ZIP rusak');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = td.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = buf.subarray(start, start + csize);
    files.set(name, { method, raw });
  }
  const read = async (name) => {
    const f = files.get(name);
    if (!f) return null;
    if (f.method === 0) return new Blob([f.raw]);
    if (f.method === 8 && typeof DecompressionStream !== 'undefined') {
      return new Response(new Blob([f.raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    }
    throw new Error(`Metode kompresi ZIP tidak didukung untuk ${name}`);
  };
  return { names: [...files.keys()], read };
}

// ---------- Export ----------
/**
 * format: 'embedded' (satu .json berisi media), 'json' (tanpa media), 'zip' (project.json + folder media/)
 * Mengembalikan { blob, fileName }.
 */
export async function exportProject(api, project, assets, format = 'embedded', onProgress) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const ids = usedAssetIds(project).filter((id) => byId.has(id));
  const list = ids.map((id) => byId.get(id));
  const base = {
    format: FORMAT_ID,
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    app: 'WEBM Editor',
    project: cleanProject(project),
  };
  const name = safe(project.name);

  if (format === 'json') {
    const doc = { ...base, media: 'none', assets: list.map(assetMeta) };
    return { blob: new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), fileName: `${name}.webm-project.json` };
  }

  const entries = [];
  let i = 0;
  for (const a of list) {
    const meta = assetMeta(a);
    if (a.builtin) entries.push({ meta, blob: null });
    else entries.push({ meta, blob: await api.getAssetBlob(a) });
    onProgress && onProgress(++i / Math.max(1, list.length));
  }

  if (format === 'zip') {
    const files = [];
    const metas = [];
    for (const { meta, blob } of entries) {
      if (blob) {
        const path = `media/${meta.id}.${extOf(meta)}`;
        files.push({ name: path, data: blob });
        metas.push({ ...meta, path });
      } else metas.push(meta);
    }
    const doc = { ...base, media: 'zip', assets: metas };
    files.unshift({ name: 'project.json', data: te.encode(JSON.stringify(doc, null, 2)) });
    return { blob: await makeZip(files), fileName: `${name}.webm-project.zip` };
  }

  const metas = [];
  for (const { meta, blob } of entries) metas.push(blob ? { ...meta, data: await blobToDataUrl(blob) } : meta);
  const doc = { ...base, media: 'embedded', assets: metas };
  return { blob: new Blob([JSON.stringify(doc)], { type: 'application/json' }), fileName: `${name}.webm-project.json` };
}

/** Perkiraan ukuran media yang akan ikut diekspor (byte). */
export function estimateMediaBytes(project, assets) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return usedAssetIds(project).reduce((n, id) => {
    const a = byId.get(id);
    return a && !a.builtin ? n + (a.size || 0) : n;
  }, 0);
}

// ---------- Import ----------
/**
 * Import berkas .json / .zip. Mengembalikan { project, missing: [nama aset], added }.
 */
export async function importProject(api, file, onProgress) {
  let doc;
  let zip = null;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (head[0] === 0x50 && head[1] === 0x4b) {
    zip = await readZip(file);
    const pj = await zip.read('project.json');
    if (!pj) throw new Error('ZIP tidak berisi project.json');
    doc = JSON.parse(await pj.text());
  } else {
    try {
      doc = JSON.parse(await file.text());
    } catch {
      throw new Error('File bukan JSON proyek yang valid');
    }
  }
  // Terima juga JSON proyek mentah (mis. dari folder data/projects server lokal)
  if (doc && !doc.format && Array.isArray(doc.tracks) && doc.settings) doc = { format: FORMAT_ID, project: doc, assets: [] };
  if (!doc || doc.format !== FORMAT_ID || !doc.project || !Array.isArray(doc.project.tracks)) {
    throw new Error('Format file tidak dikenali sebagai proyek WEBM Editor');
  }

  const existing = await api.listAssets();
  const byId = new Map(existing.map((a) => [a.id, a]));
  const map = new Map();
  const missing = [];
  let added = 0;
  const metas = doc.assets || [];
  let i = 0;
  for (const meta of metas) {
    onProgress && onProgress(i++ / Math.max(1, metas.length));
    // SFX bawaan & aset yang sudah ada di perangkat ini: pakai yang ada
    const here = byId.get(meta.id);
    if (here && (meta.builtin || (!meta.data && !meta.path) || (meta.size && here.size === meta.size))) continue;
    let blob = null;
    if (meta.data) blob = await dataUrlToBlob(meta.data);
    else if (meta.path && zip) blob = await zip.read(meta.path);
    if (!blob) {
      const same = existing.find((a) => a.name === meta.name && (!meta.size || a.size === meta.size) && a.kind === meta.kind);
      if (same) map.set(meta.id, same.id);
      else missing.push(meta.name || meta.id);
      continue;
    }
    const clean = { ...meta };
    delete clean.data;
    delete clean.path;
    let saved;
    if (api.putAsset) saved = await api.putAsset(clean, blob);
    else {
      const name = /\.[a-z0-9]{1,5}$/i.test(meta.name || '') ? meta.name : `${meta.name || meta.id}.${extOf(meta)}`;
      saved = await api.uploadAsset(new File([blob], name, { type: blob.type || meta.mime || '' }));
    }
    if (saved.id !== meta.id) map.set(meta.id, saved.id);
    added += 1;
  }
  const project = remapProject(doc.project, map);
  const name = project.name ? `${project.name}` : 'Proyek impor';
  const created = await api.putProject({ ...project, name });
  onProgress && onProgress(1);
  return { project: created, missing, added };
}

export function downloadBlob(blob, fileName) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
