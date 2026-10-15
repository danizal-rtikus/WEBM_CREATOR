// Backend "server lokal": REST ke server Node.js (FFmpeg + Chromium) di PC sendiri.

async function json(res) {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error) msg = body.error;
    } catch {
      /* noop */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Cek apakah server lokal tersedia (bukan halaman statis seperti di Vercel). */
export async function detectServer() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('/api/health', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok || !(res.headers.get('content-type') || '').includes('application/json')) return false;
    const body = await res.json();
    return body && body.ok === true;
  } catch {
    return false;
  }
}

export const serverBackend = {
  mode: 'server',
  label: 'Server lokal',
  capabilities: { renderProxy: true, outputPath: true },

  listProjects: () => fetch('/api/projects').then(json),
  createProject: (body) =>
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(json),
  getProject: (id) => fetch(`/api/projects/${id}`).then(json),
  saveProject: (p) =>
    fetch(`/api/projects/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(json),
  /** Simpan proyek apa adanya (dipakai saat import). */
  putProject: async (p) => {
    const created = await serverBackend.createProject({ name: p.name, settings: p.settings });
    const res = await serverBackend.saveProject({ ...p, id: created.id, version: created.version });
    return { ...p, id: created.id, version: res.version };
  },
  deleteProject: (id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }).then(json),

  listAssets: () => fetch('/api/assets').then(json),
  deleteAsset: (id) => fetch(`/api/assets/${id}`, { method: 'DELETE' }).then(json),
  getAssetBlob: (asset) => fetch(asset.url).then((r) => r.blob()),
  uploadAsset(file, onProgress) {
    // Upload sebagai raw body (tanpa multipart) dengan progres via XHR
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/assets');
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        try {
          const body = JSON.parse(xhr.responseText);
          if (xhr.status >= 400) reject(new Error(body.error || xhr.statusText));
          else resolve(body);
        } catch (e) {
          reject(e);
        }
      };
      xhr.onerror = () => reject(new Error('Upload gagal'));
      xhr.send(file);
    });
  },

  startRender: (body) =>
    fetch('/api/renders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json),
  cancelRender: (id) => fetch(`/api/renders/${id}`, { method: 'DELETE' }).then(json),

  /** Pantau progres render (SSE + polling cadangan). Mengembalikan fungsi berhenti. */
  subscribeRender(id, onUpdate) {
    const finished = (s) => s === 'done' || s === 'failed' || s === 'canceled';
    let stopped = false;
    const es = new EventSource(`/api/renders/${id}/events`);
    es.onmessage = (ev) => {
      const data = JSON.parse(ev.data);
      onUpdate(data);
      if (finished(data.status)) es.close();
    };
    es.onerror = () => es.close();
    let misses = 0;
    const poll = setInterval(async () => {
      if (stopped) return;
      try {
        const res = await fetch(`/api/renders/${id}`);
        if (res.status === 404) {
          clearInterval(poll);
          onUpdate({ status: 'failed', error: 'Job hilang — server API kemungkinan restart/crash. Lihat data/logs/server.log lalu coba lagi.' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        misses = 0;
        const data = await res.json();
        onUpdate(data);
        if (finished(data.status)) clearInterval(poll);
      } catch {
        misses += 1;
        if (misses >= 8) {
          clearInterval(poll);
          onUpdate({ status: 'failed', error: 'Server API (port 3001) tidak merespons. Periksa terminal "npm run dev".' });
        }
      }
    }, 1000);
    return () => {
      stopped = true;
      es.close();
      clearInterval(poll);
    };
  },
};
