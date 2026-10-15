// Klien REST untuk backend Node.js lokal.

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

export const api = {
  listProjects: () => fetch('/api/projects').then(json),
  createProject: (body) =>
    fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(json),
  getProject: (id) => fetch(`/api/projects/${id}`).then(json),
  saveProject: (p) =>
    fetch(`/api/projects/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }).then(json),
  deleteProject: (id) => fetch(`/api/projects/${id}`, { method: 'DELETE' }).then(json),

  listAssets: () => fetch('/api/assets').then(json),
  deleteAsset: (id) => fetch(`/api/assets/${id}`, { method: 'DELETE' }).then(json),
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
  renderEvents: (id) => new EventSource(`/api/renders/${id}/events`),
};
