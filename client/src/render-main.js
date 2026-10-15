// Halaman render headless: dibuka oleh worker (Puppeteer) untuk menggambar
// setiap frame dengan compositor yang sama persis dengan pratinjau editor.
import { drawFrame } from './engine/compositor.js';
import { MediaPool } from './engine/media.js';
import { fxFonts } from './engine/fx/index.js';

const params = new URLSearchParams(location.search);
const projectId = params.get('project');
const scale = Number(params.get('scale') || 1);
const alpha = params.get('alpha') === '1';
const useProxy = params.get('proxy') === '1';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: true });
const pool = new MediaPool({ exact: true });
let project = null;

async function setup() {
  const [p, assets] = await Promise.all([
    fetch(`/api/projects/${projectId}`).then((r) => r.json()),
    fetch('/api/assets').then((r) => r.json()),
  ]);
  project = p;
  // Jika server menyiapkan salinan VP9 khusus render, pakai itu
  if (useProxy) for (const a of assets) if (a.renderUrl) a.url = a.renderUrl;
  const { width, height } = project.settings;
  canvas.width = Math.round((width * scale) / 2) * 2;
  canvas.height = Math.round((height * scale) / 2) * 2;
  pool.setAssets(assets);
  pool.sync(project);
  const failed = await pool.waitLoaded();
  if (failed.length) throw new Error(`Video gagal dimuat di renderer (klip: ${failed.join(', ')})`);

  // Pastikan semua font yang dipakai sudah dimuat sebelum frame pertama
  const fontLoads = [];
  for (const t of project.tracks)
    for (const c of t.clips)
      if (c.type === 'text') fontLoads.push(document.fonts.load(`${c.text.fontWeight} ${c.text.fontSize}px "${c.text.fontFamily}"`, c.text.content));
      else if (c.type === 'fx') for (const f of [...fxFonts(c), 'Inter']) fontLoads.push(document.fonts.load(`400 80px "${f}"`), document.fonts.load(`900 80px "${f}"`));
  await Promise.all(fontLoads).catch(() => {});
  await document.fonts.ready;

  return {
    width: canvas.width,
    height: canvas.height,
    fps: project.settings.fps,
    duration: project.settings.duration,
  };
}

async function renderFrame(i) {
  const t = i / project.settings.fps;
  await pool.seekExact(project, t);
  ctx.setTransform(canvas.width / project.settings.width, 0, 0, canvas.height / project.settings.height, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  drawFrame(ctx, project, t, pool, { transparent: alpha });
  return canvas.toDataURL('image/png');
}

/** Codec yang bisa diputar Chromium headless ini (H.264 tidak ada di Chromium open-source). */
window.__canPlay = () => ({
  h264: !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'),
  hevc: !!document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"'),
});
window.__renderSetup = setup;
window.__renderFrame = renderFrame;
window.__renderReady = true;
