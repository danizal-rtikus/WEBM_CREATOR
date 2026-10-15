// Backend "browser": semua proyek & media disimpan di IndexedDB milik browser pengguna.
// Dipakai saat aplikasi berjalan sebagai situs statis (mis. Vercel) tanpa server Node.js.
import * as idb from './idb.js';
import { sanitizeSvg, svgSize, normalizeSvg } from './svg.js';
import { synthSfx } from './sfx.js';
import { renderInBrowser } from './render-browser.js';

const EXT_KIND = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image', avif: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', m4v: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', opus: 'audio',
};
const MAX_UPLOAD = 500 * 1024 * 1024;

const rid = (prefix) => {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}_${btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
};
const err = (msg, status) => Object.assign(new Error(msg), { status });

// ---------- Object URL per aset (dibuat sekali, dipakai ulang) ----------
const urls = new Map(); // key -> objectURL
async function blobUrl(key) {
  if (urls.has(key)) return urls.get(key);
  const blob = await idb.get('blobs', key);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  urls.set(key, u);
  return u;
}
function revoke(key) {
  const u = urls.get(key);
  if (u) URL.revokeObjectURL(u);
  urls.delete(key);
}

async function withUrls(meta) {
  const out = { ...meta, url: await blobUrl(meta.id) };
  if (meta.hasThumb) out.thumbUrl = await blobUrl(`${meta.id}:thumb`);
  return out;
}

// ---------- Metadata media ----------
function loadImageMeta(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(u); };
    img.onerror = () => { URL.revokeObjectURL(u); reject(err('Gambar tidak bisa dibaca browser ini', 415)); };
    img.src = u;
  });
}

function loadVideoMeta(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    const fail = () => { URL.revokeObjectURL(u); reject(err('Video tidak bisa diputar browser ini. Ubah ke MP4 (H.264) atau WebM (VP9) lalu upload ulang.', 415)); };
    v.onerror = fail;
    v.onloadeddata = () => {
      const meta = { width: v.videoWidth, height: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 };
      // Perkiraan ada-tidaknya audio (Chrome: webkitAudioDecodedByteCount, Firefox: mozHasAudio)
      if ('mozHasAudio' in v) meta.hasAudio = !!v.mozHasAudio;
      v.onseeked = async () => {
        let thumb = null;
        try {
          const w = 320;
          const h = Math.max(2, Math.round((w * meta.height) / Math.max(1, meta.width)));
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          c.getContext('2d').drawImage(v, 0, 0, w, h);
          thumb = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
        } catch { /* tanpa thumbnail */ }
        URL.revokeObjectURL(u);
        resolve({ meta, thumb });
      };
      v.currentTime = Math.min(1, meta.duration / 2 || 0);
    };
    v.src = u;
    setTimeout(fail, 30000);
  });
}

function loadAudioMeta(blob) {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(blob);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { URL.revokeObjectURL(u); resolve({ duration: Number.isFinite(a.duration) ? a.duration : 0 }); };
    a.onerror = () => { URL.revokeObjectURL(u); reject(err('Audio tidak bisa diputar browser ini', 415)); };
    a.src = u;
  });
}

// ---------- SFX bawaan ----------
let sfxReady = null;
function ensureSfx() {
  if (sfxReady) return sfxReady;
  sfxReady = (async () => {
    const existing = new Set((await idb.getAll('assets')).map((a) => a.id));
    const missing = ['whoosh', 'swoosh', 'pop', 'impact', 'chime', 'riser', 'wind'].filter((id) => !existing.has(`sfx_${id}`));
    if (!missing.length) return;
    for (const s of await synthSfx()) {
      const id = `sfx_${s.id}`;
      if (existing.has(id)) continue;
      await idb.put('blobs', s.blob, id);
      await idb.put('assets', {
        id, name: s.name, kind: 'audio', mime: 'audio/wav', size: s.blob.size, duration: s.duration,
        hasAudio: true, codec: 'pcm_s16le', sfx: s.id, builtin: true, createdAt: new Date().toISOString(),
      });
    }
  })().catch((e) => {
    console.warn('[sfx] gagal membuat SFX bawaan', e);
  });
  return sfxReady;
}

// ---------- Render (antrean di memori) ----------
const jobs = new Map();
const listeners = new Map();
function emit(job) {
  for (const fn of listeners.get(job.id) || []) fn({ ...job });
}
function setJob(job, patch) {
  Object.assign(job, patch);
  emit(job);
}
const safeName = (s) => String(s || 'render').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'render';

export const browserBackend = {
  mode: 'browser',
  label: 'Tersimpan di browser',
  capabilities: { renderProxy: false, outputPath: false },

  async init() {
    try {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
    } catch { /* opsional */ }
    await idb.db();
    ensureSfx();
  },

  async storageEstimate() {
    try {
      return navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    } catch {
      return null;
    }
  },

  // ---------- Proyek ----------
  async listProjects() {
    const all = await idb.getAll('projects');
    return all
      .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, settings: p.settings }))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  },
  async createProject({ name, settings } = {}) {
    const now = new Date().toISOString();
    const p = {
      id: rid('prj'),
      name: name || 'Proyek baru',
      settings: { width: 1920, height: 1080, fps: 30, duration: 10, background: '#000000', transparent: true, ...(settings || {}) },
      tracks: [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    await idb.put('projects', p);
    return p;
  },
  async getProject(id) {
    const p = await idb.get('projects', id);
    if (!p) throw err('Proyek tidak ditemukan', 404);
    return p;
  },
  async saveProject(body) {
    const cur = await browserBackend.getProject(body.id);
    if (typeof body.version === 'number' && body.version !== cur.version) {
      throw err('Proyek sudah diubah di tab lain. Muat ulang halaman.', 409);
    }
    const next = {
      ...cur,
      name: String(body.name || cur.name).slice(0, 200),
      settings: body.settings || cur.settings,
      tracks: Array.isArray(body.tracks) ? body.tracks : cur.tracks,
      version: cur.version + 1,
      updatedAt: new Date().toISOString(),
    };
    await idb.put('projects', next);
    return { id: next.id, version: next.version, updatedAt: next.updatedAt };
  },
  /** Simpan proyek apa adanya dengan id baru (dipakai saat import). */
  async putProject(p) {
    const now = new Date().toISOString();
    const next = { ...p, id: rid('prj'), version: 1, createdAt: now, updatedAt: now };
    await idb.put('projects', next);
    return next;
  },
  async deleteProject(id) {
    await idb.del('projects', id);
    return { ok: true };
  },

  // ---------- Aset ----------
  async listAssets() {
    await ensureSfx();
    const all = await idb.getAll('assets');
    all.sort((a, b) => (a.builtin ? 1 : 0) - (b.builtin ? 1 : 0) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return Promise.all(all.map(withUrls));
  },
  async deleteAsset(id) {
    const meta = await idb.get('assets', id);
    if (meta && meta.builtin) throw err('SFX bawaan tidak bisa dihapus', 400);
    await idb.del('assets', id);
    await idb.del('blobs', id);
    await idb.del('blobs', `${id}:thumb`);
    revoke(id);
    revoke(`${id}:thumb`);
    return { ok: true };
  },
  async getAssetBlob(asset) {
    const blob = await idb.get('blobs', asset.id);
    if (!blob) throw err(`Media "${asset.name || asset.id}" tidak ditemukan`, 404);
    return blob;
  },
  /** Ambil berkas lalu buat aset seperti upload biasa. */
  async uploadAsset(file, onProgress) {
    const name = file.name || 'upload';
    const ext = (name.split('.').pop() || '').toLowerCase();
    const kind = EXT_KIND[ext];
    if (!kind) throw err(`Format .${ext || '?'} tidak didukung`, 415);
    if (file.size > MAX_UPLOAD) throw err('File melebihi batas 500 MB', 413);
    onProgress && onProgress(0.1);
    const id = rid('ast');
    let blob = file;
    const meta = { id, name: name.slice(0, 120), kind, mime: file.type || '', size: file.size, createdAt: new Date().toISOString() };
    let thumb = null;
    if (ext === 'svg') {
      const src = await file.text();
      if (!/<svg\b/i.test(src)) throw err('File SVG tidak valid', 400);
      const clean = sanitizeSvg(src);
      const dims = svgSize(clean);
      blob = new Blob([normalizeSvg(clean, dims)], { type: 'image/svg+xml' });
      Object.assign(meta, dims, { mime: 'image/svg+xml', hasAlpha: true, size: blob.size });
    } else if (kind === 'image') {
      Object.assign(meta, await loadImageMeta(blob), { hasAlpha: ['png', 'webp', 'gif', 'avif'].includes(ext) });
    } else if (kind === 'video') {
      const r = await loadVideoMeta(blob);
      Object.assign(meta, r.meta);
      thumb = r.thumb;
    } else if (kind === 'audio') {
      Object.assign(meta, await loadAudioMeta(blob), { hasAudio: true });
    }
    onProgress && onProgress(0.7);
    await idb.put('blobs', blob, id);
    if (thumb) {
      await idb.put('blobs', thumb, `${id}:thumb`);
      meta.hasThumb = true;
    }
    await idb.put('assets', meta);
    onProgress && onProgress(1);
    return withUrls(meta);
  },
  /** Simpan aset dari berkas import (id dipertahankan bila belum dipakai). */
  async putAsset(meta, blob, thumb) {
    const clean = { ...meta };
    delete clean.url;
    delete clean.thumbUrl;
    delete clean.file;
    delete clean.thumbFile;
    delete clean.renderFile;
    delete clean.renderUrl;
    clean.hasThumb = !!thumb;
    if (await idb.get('assets', clean.id)) clean.id = rid('ast');
    await idb.put('blobs', blob, clean.id);
    if (thumb) await idb.put('blobs', thumb, `${clean.id}:thumb`);
    await idb.put('assets', clean);
    return withUrls(clean);
  },

  // ---------- Render ----------
  async startRender(body) {
    const project = await browserBackend.getProject(body.projectId);
    const assets = await browserBackend.listAssets();
    const job = { id: rid('job'), status: 'queued', progress: 0, createdAt: Date.now() };
    const ctrl = new AbortController();
    job.ctrl = ctrl;
    jobs.set(job.id, job);
    const dur = Math.min(project.settings.duration, body.end || project.settings.duration);
    const cut = body.cutMs ? `-cut${body.cutMs}ms` : '';
    const fileName = `${safeName(project.name)}${body.alpha ? '-alpha' : ''}${cut}.webm`;
    const t0 = performance.now();
    // Jalankan setelah handler kembali agar UI sempat berlangganan
    setTimeout(async () => {
      try {
        const res = await renderInBrowser({
          project,
          assets,
          assetUrl: (a) => a.url,
          getBlob: (a) => browserBackend.getAssetBlob(a),
          opts: { ...body, end: dur },
          signal: ctrl.signal,
          onProgress: (p) => setJob(job, p),
        });
        if (job.url) URL.revokeObjectURL(job.url);
        const url = URL.createObjectURL(res.blob);
        setJob(job, { status: 'done', progress: 1, url, downloadUrl: url, fileName, size: res.blob.size, elapsed: (performance.now() - t0) / 1000 });
      } catch (e) {
        if (e && e.name === 'AbortError') setJob(job, { status: 'canceled' });
        else {
          console.error('[render]', e);
          setJob(job, { status: 'failed', error: (e && e.message) || String(e) });
        }
      }
    }, 0);
    return { id: job.id, status: job.status, progress: 0 };
  },
  async cancelRender(id) {
    const job = jobs.get(id);
    if (job && job.ctrl) job.ctrl.abort();
    return { ok: true };
  },
  subscribeRender(id, onUpdate) {
    if (!listeners.has(id)) listeners.set(id, new Set());
    const set = listeners.get(id);
    const fn = (j) => {
      const { ctrl, ...rest } = j;
      onUpdate(rest);
    };
    set.add(fn);
    const job = jobs.get(id);
    if (job) fn({ ...job });
    return () => set.delete(fn);
  },
};
