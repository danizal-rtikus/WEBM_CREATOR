import './log.js';
// Server lokal WEBM Editor: REST API, upload aset, render job (SSE), file statis.
// Hanya memakai modul bawaan Node.js; render memakai Puppeteer + FFmpeg.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { HOST, PORT, DIRS, CLIENT_DIST, DATA_DIR } from './config.js';
import * as store from './storage.js';
import { handleUpload, ensureRenderProxy } from './media.js';
import { createJob, getJob, cancelJob, publicJob, bus } from './render.js';
import { FFMPEG } from './ffmpeg.js';
import { ensureSfx } from './sfx.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.flac': 'audio/flac', '.opus': 'audio/ogg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

async function readJson(req, limit = 25 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Body terlalu besar'), { status: 413 });
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error('JSON tidak valid'), { status: 400 });
  }
}

/** Kirim file statis dengan dukungan HTTP Range (wajib untuk seek video). */
function serveFile(req, res, file, { download, cache } = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, { error: 'Tidak ditemukan' });
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cache ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    };
    if (type === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'";
    if (download) headers['Content-Disposition'] = `attachment; filename="${path.basename(file).replace(/"/g, '')}"`;
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (m && !m[1] && m[2]) {
        start = st.size - parseInt(m[2], 10);
        end = st.size - 1;
      }
      if (start >= st.size || end >= st.size || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
        return res.end();
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/** Cegah path traversal: file harus berada di dalam baseDir. */
function safeJoin(baseDir, rel) {
  const p = path.resolve(baseDir, '.' + path.sep + decodeURIComponent(rel));
  if (!p.startsWith(path.resolve(baseDir) + path.sep)) return null;
  return p;
}

const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ method, re, keys, handler });
};

// ---------- Proyek ----------
route('GET', '/api/projects', async (req, res) => send(res, 200, await store.listProjects()));
route('POST', '/api/projects', async (req, res) => send(res, 201, await store.createProject(await readJson(req))));
route('GET', '/api/projects/:id', async (req, res, p) => send(res, 200, await store.getProject(p.id)));
route('PUT', '/api/projects/:id', async (req, res, p) => {
  const saved = await store.saveProject(p.id, await readJson(req));
  send(res, 200, { id: saved.id, version: saved.version, updatedAt: saved.updatedAt });
});
route('DELETE', '/api/projects/:id', async (req, res, p) => {
  await store.deleteProject(p.id);
  send(res, 200, { ok: true });
});

// ---------- Aset ----------
route('GET', '/api/assets', async (req, res) => send(res, 200, await store.listAssets()));
route('POST', '/api/assets', async (req, res) => send(res, 201, await handleUpload(req)));
route('POST', '/api/assets/:id/proxy', async (req, res, p) => {
  const a = (await store.listAssets()).find((x) => x.id === p.id);
  if (!a) return send(res, 404, { error: 'Aset tidak ditemukan' });
  if (a.kind !== 'video') return send(res, 400, { error: 'Hanya untuk video' });
  send(res, 200, await ensureRenderProxy(a));
});
route('DELETE', '/api/assets/:id', async (req, res, p) => send(res, 200, await store.removeAsset(p.id)));

// ---------- Render ----------
route('POST', '/api/renders', async (req, res) => {
  const body = await readJson(req);
  await store.getProject(body.projectId); // validasi
  send(res, 201, createJob(body));
});
route('GET', '/api/renders/:id', async (req, res, p) => {
  const j = getJob(p.id);
  if (!j) return send(res, 404, { error: 'Job tidak ditemukan' });
  send(res, 200, publicJob(j));
});
route('DELETE', '/api/renders/:id', async (req, res, p) => {
  const j = cancelJob(p.id);
  if (!j) return send(res, 404, { error: 'Job tidak ditemukan' });
  send(res, 200, j);
});
route('GET', '/api/renders/:id/events', async (req, res, p) => {
  const j = getJob(p.id);
  if (!j) return send(res, 404, { error: 'Job tidak ditemukan' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const push = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  push(publicJob(j));
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  bus.on(j.id, push);
  req.on('close', () => {
    clearInterval(ping);
    bus.off(j.id, push);
  });
});
route('GET', '/api/health', async (req, res) => send(res, 200, { ok: true, ffmpeg: FFMPEG, dataDir: DATA_DIR }));

// ---------- Server ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  try {
    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        return await r.handler(req, res, params);
      }
      return send(res, 404, { error: 'Endpoint tidak ditemukan' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method tidak diizinkan' });
    if (pathname.startsWith('/media/')) {
      const f = safeJoin(DIRS.media, pathname.slice('/media/'.length));
      return f ? serveFile(req, res, f, { cache: true }) : send(res, 400, { error: 'Path tidak valid' });
    }
    if (pathname.startsWith('/renders/')) {
      const f = safeJoin(DIRS.renders, pathname.slice('/renders/'.length));
      return f ? serveFile(req, res, f, { download: url.searchParams.has('download') }) : send(res, 400, { error: 'Path tidak valid' });
    }
    // Client hasil build (npm start). Saat dev, buka http://localhost:5173.
    if (fs.existsSync(CLIENT_DIST)) {
      const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
      const f = safeJoin(CLIENT_DIST, rel);
      if (f && fs.existsSync(f) && fs.statSync(f).isFile()) return serveFile(req, res, f, { cache: rel.startsWith('assets/') });
      return serveFile(req, res, path.join(CLIENT_DIST, 'index.html'));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<p style="font-family:sans-serif">Server API WEBM Editor berjalan. Buka <a href="http://localhost:5173">http://localhost:5173</a> (mode dev) atau jalankan <code>npm start</code>.</p>');
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: e.message });
    else res.end();
  }
});

server.requestTimeout = 0; // upload besar
// Jangan biarkan satu error tak tertangkap mematikan seluruh server
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

ensureSfx().catch((e) => console.warn('[sfx]', e.message));
server.listen(PORT, HOST, () => {
  console.log(`\n  WEBM Editor API  →  http://${HOST}:${PORT}`);
  console.log(`  Data             →  ${DATA_DIR}`);
  console.log(`  FFmpeg           →  ${FFMPEG}`);
  if (fs.existsSync(CLIENT_DIST)) console.log(`  Editor (build)   →  http://localhost:${PORT}\n`);
  else console.log('  Editor (dev)     →  http://localhost:5173\n');
});
