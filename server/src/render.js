// Pipeline render: headless Chromium menggambar setiap frame memakai compositor
// yang sama dengan pratinjau, lalu frame PNG di-pipe ke FFmpeg (VP9 + alpha).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once, EventEmitter } from 'node:events';
import { DIRS, CLIENT_DIST, PORT, DEV } from './config.js';
import { getProject, listAssets, newId } from './storage.js';
import { FFMPEG, ffmpeg } from './ffmpeg.js';
import { ensureRenderProxy } from './media.js';

const jobs = new Map();
const queue = [];
let running = false;
export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function getJob(id) {
  return jobs.get(id);
}

function publicJob(j) {
  const { cancel, proc, ...rest } = j; // eslint-disable-line no-unused-vars
  return rest;
}

function update(job, patch) {
  Object.assign(job, patch);
  bus.emit(job.id, publicJob(job));
}

export function createJob(opts) {
  const job = {
    id: newId('rnd'),
    projectId: opts.projectId,
    scale: [1, 0.75, 0.5, 0.25].includes(Number(opts.scale)) ? Number(opts.scale) : 1,
    crf: Math.min(63, Math.max(4, Math.round(Number(opts.crf) || 30))),
    alpha: !!opts.alpha,
    speed: [0, 1, 2, 3, 4, 5].includes(Number(opts.speed)) ? Number(opts.speed) : 2,
    // Akhir rentang render (detik). Kosong = seluruh durasi proyek.
    end: Number(opts.end) > 0 ? Number(opts.end) : null,
    cutMs: Number(opts.cutMs) > 0 ? Math.round(Number(opts.cutMs)) : null,
    status: 'queued',
    progress: 0,
    createdAt: Date.now(),
  };
  jobs.set(job.id, job);
  queue.push(job);
  pump();
  return publicJob(job);
}

export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  job.cancel = true;
  if (job.proc) job.proc.kill('SIGKILL');
  if (job.status === 'queued') update(job, { status: 'canceled' });
  return publicJob(job);
}

export { publicJob };

async function pump() {
  if (running) return;
  const job = queue.shift();
  if (!job) return;
  if (job.cancel) return pump();
  running = true;
  try {
    await runJob(job);
  } catch (e) {
    if (job.cancel) update(job, { status: 'canceled' });
    else {
      console.error(`[render ${job.id}] gagal:`, e && e.stack ? e.stack : e);
      update(job, { status: 'failed', error: e.message });
    }
  } finally {
    running = false;
    pump();
  }
}

// ---------- Browser headless ----------
async function launchBrowser() {
  const args = ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--force-color-profile=srgb'];
  let firstErr;
  try {
    const puppeteer = (await import('puppeteer')).default;
    return await puppeteer.launch({ headless: true, args, defaultViewport: { width: 800, height: 600 } });
  } catch (e) {
    firstErr = e;
  }
  // Alternatif: Playwright (mis. untuk lingkungan CI)
  if (process.env.PLAYWRIGHT_MODULE) {
    const pw = await import(process.env.PLAYWRIGHT_MODULE);
    const chromium = pw.chromium || (pw.default && pw.default.chromium);
    return chromium.launch({ headless: true, args, executablePath: process.env.CHROMIUM_PATH || undefined });
  }
  throw new Error(`Tidak bisa menjalankan Chromium headless (Puppeteer). Jalankan "npm install" di folder proyek. Detail: ${firstErr && firstErr.message}`);
}

function renderPageUrl(job, proxy) {
  const qs = `project=${encodeURIComponent(job.projectId)}&scale=${job.scale}&alpha=${job.alpha ? 1 : 0}${proxy ? '&proxy=1' : ''}`;
  if (!DEV && fs.existsSync(path.join(CLIENT_DIST, 'render.html'))) return `http://127.0.0.1:${PORT}/render.html?${qs}`;
  const base = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${base}/render.html?${qs}`;
}

const NATIVE_CODECS = new Set(['vp8', 'vp9', 'av1']);

async function prepareRenderProxies(job, project, assets, can) {
  const used = new Set();
  for (const t of project.tracks) for (const c of t.clips) if (c.type === 'video' && c.assetId) used.add(c.assetId);
  let count = 0;
  for (const a of assets) {
    if (!used.has(a.id) || NATIVE_CODECS.has(a.codec)) continue;
    if ((a.codec === 'h264' && can.h264) || (a.codec === 'hevc' && can.hevc)) continue;
    count++;
    if (a.renderFile && fs.existsSync(path.join(DIRS.media, a.renderFile))) continue;
    if (job.cancel) throw new Error('Dibatalkan');
    update(job, { status: 'preparing', note: `Menyiapkan ${a.name} untuk renderer…` });
    await ensureRenderProxy(a, { onSpawn: (p) => (job.proc = p) });
  }
  if (count) update(job, { status: 'rendering', note: null });
  return count > 0;
}

function slug(s) {
  return String(s || 'render').toLowerCase().normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'render';
}

// ---------- Job ----------
async function runJob(job) {
  const t0 = Date.now();
  const project = await getProject(job.projectId);
  const assets = await listAssets();
  update(job, { status: 'rendering', progress: 0, projectName: project.name, note: 'Membuka Chromium…' });
  console.log(`[render ${job.id}] mulai: ${project.name}`);

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const fileName = `${slug(project.name)}-${stamp}${job.cutMs ? `-cut${job.cutMs}ms` : ''}.webm`;
  const tmpVideo = path.join(DIRS.tmp, `${job.id}-video.webm`);
  const outFile = path.join(DIRS.renders, fileName);

  console.log(`[render ${job.id}] membuka Chromium…`);
  const browser = await launchBrowser();
  console.log(`[render ${job.id}] Chromium terbuka, memuat ${renderPageUrl(job, false)}`);
  let info;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    const open = async (proxy) => {
      await page.goto(renderPageUrl(job, proxy), { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction('window.__renderReady === true', { timeout: 30000 }).catch(() => {
        throw new Error(`Halaman render tidak siap. ${errors.join(' | ') || 'Pastikan client berjalan (npm run dev) atau sudah di-build.'}`);
      });
    };
    await open(false);
    // Chromium headless tanpa codec proprietary (mis. H.264) → siapkan salinan VP9 khusus render
    const can = await page.evaluate(() => window.__canPlay());
    const proxied = await prepareRenderProxies(job, project, assets, can);
    if (proxied) await open(true);
    info = await page.evaluate(() => window.__renderSetup()).catch((e) => {
      throw new Error(`Gagal menyiapkan halaman render: ${e.message}${errors.length ? ` | ${errors.join(' | ')}` : ''}`);
    });
    if (job.end) info.duration = Math.min(info.duration, job.end);
    const frames = Math.max(1, Math.round(info.duration * info.fps));
    update(job, { frames, frame: 0, note: null });

    const threads = String(Math.max(2, Math.min(16, os.cpus().length)));
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libvpx-vp9',
      '-pix_fmt', job.alpha ? 'yuva420p' : 'yuv420p',
      '-crf', String(job.crf), '-b:v', '0',
      '-deadline', 'good', '-cpu-used', String(job.speed),
      '-row-mt', '1', '-threads', threads,
      ...(job.alpha ? ['-auto-alt-ref', '0'] : []),
      '-an', tmpVideo,
    ];
    const ff = spawn(FFMPEG, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    // Jika FFmpeg berhenti lebih awal, tulisan ke stdin memicu EPIPE — tangkap agar server tidak crash
    let pipeErr = null;
    ff.stdin.on('error', (e) => {
      pipeErr = e;
    });
    job.proc = ff;
    let ffErr = '';
    ff.stderr.on('data', (d) => (ffErr += d));
    const ffDone = new Promise((resolve, reject) => {
      ff.on('error', reject);
      ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(job.cancel ? 'Dibatalkan' : `FFmpeg gagal (${code}): ${ffErr.trim().split('\n').slice(-2).join(' ')}`))));
    });
    ffDone.catch(() => {});

    const tStart = Date.now();
    for (let i = 0; i < frames; i++) {
      if (job.cancel) throw new Error('Dibatalkan');
      const dataUrl = await page.evaluate((n) => window.__renderFrame(n), i);
      const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      if (pipeErr) break;
      if (!ff.stdin.write(buf)) await Promise.race([once(ff.stdin, 'drain'), ffDone, new Promise((r) => ff.stdin.once('error', r))]);
      if (i % 3 === 0 || i === frames - 1) {
        const per = (Date.now() - tStart) / (i + 1);
        update(job, { frame: i + 1, progress: ((i + 1) / frames) * 0.92, eta: ((frames - i - 1) * per) / 1000 });
      }
    }
    if (!pipeErr) ff.stdin.end();
    await ffDone;
    if (errors.length) console.warn('[render page]', errors.join(' | '));
  } finally {
    job.proc = null;
    await browser.close().catch(() => {});
  }

  // ---------- Audio: mix klip audio & audio dari video ----------
  update(job, { status: 'muxing', progress: 0.94 });
  const byId = new Map(assets.map((a) => [a.id, a]));
  const sources = [];
  for (const track of project.tracks) {
    if (!track.visible) continue;
    for (const c of track.clips) {
      const a = byId.get(c.assetId);
      if (!a || c.muted) continue;
      if (c.type === 'audio' || (c.type === 'video' && a.hasAudio)) {
        if (c.start >= info.duration) continue;
        sources.push({ file: path.join(DIRS.media, a.file), start: c.start, inPoint: c.inPoint || 0, duration: Math.min(c.duration, info.duration - c.start), volume: c.volume ?? 1 });
      }
    }
  }

  if (sources.length === 0) {
    await fsp.rename(tmpVideo, outFile).catch(async () => {
      await fsp.copyFile(tmpVideo, outFile);
      await fsp.rm(tmpVideo, { force: true });
    });
  } else {
    const inputs = ['-i', tmpVideo];
    const filters = [];
    sources.forEach((s, k) => {
      inputs.push('-i', s.file);
      const ms = Math.round(s.start * 1000);
      filters.push(
        `[${k + 1}:a]atrim=start=${s.inPoint.toFixed(3)}:duration=${s.duration.toFixed(3)},asetpts=PTS-STARTPTS,` +
          `aresample=48000,volume=${s.volume.toFixed(3)},adelay=${ms}|${ms}[a${k}]`,
      );
    });
    const mixIn = sources.map((_, k) => `[a${k}]`).join('');
    filters.push(sources.length > 1 ? `${mixIn}amix=inputs=${sources.length}:duration=longest:normalize=0[aout]` : `${mixIn}anull[aout]`);
    // Video dengan alpha harus dicopy apa adanya (stream alpha ada di BlockAdditional)
    await ffmpeg(
      ['-y', ...inputs, '-filter_complex', filters.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'libopus', '-b:a', '192k', '-t', info.duration.toFixed(3), outFile],
      { onSpawn: (p) => (job.proc = p) },
    );
    await fsp.rm(tmpVideo, { force: true });
  }

  const stat = await fsp.stat(outFile);
  update(job, {
    status: 'done',
    progress: 1,
    fileName,
    size: stat.size,
    url: `/renders/${encodeURIComponent(fileName)}`,
    outputPath: outFile,
    elapsed: (Date.now() - t0) / 1000,
    eta: 0,
  });
}
