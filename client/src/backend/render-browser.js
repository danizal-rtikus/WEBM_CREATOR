// Renderer mode browser: compositor yang sama dengan pratinjau → WebCodecs (VP9 + Opus) → WebM.
// Alpha: WebCodecs di Chrome belum bisa encode alpha VP9, jadi kanal alpha di-encode sebagai
// stream VP9 kedua (luma = alpha) lalu disimpan sebagai BlockAdditions — format standar
// WebM alpha yang sama dengan hasil FFmpeg (libvpx-vp9 yuva420p).
import { drawFrame } from '../engine/compositor.js';
import { MediaPool } from '../engine/media.js';
import { fxFonts } from '../engine/fx/index.js';
import { WebMWriter } from './webm-writer.js';

const SR = 48000;
const COLOR_SPACE = { primaries: 'smpte170m', transfer: 'smpte170m', matrix: 'smpte170m', fullRange: false };

export function browserRenderSupport() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') {
    return 'Browser ini belum mendukung WebCodecs. Gunakan Chrome atau Edge versi terbaru di komputer (desktop).';
  }
  return null;
}

/** RGBA (straight alpha, hasil getImageData) → I420 BT.601 limited, plus plane alpha opsional. */
function rgbaToI420(rgba, w, h, out, alphaOut) {
  const ySize = w * h;
  const cw = w >> 1;
  const ch = h >> 1;
  const Y = out.subarray(0, ySize);
  const U = out.subarray(ySize, ySize + cw * ch);
  const V = out.subarray(ySize + cw * ch);
  for (let i = 0, p = 0; i < ySize; i++, p += 4) {
    Y[i] = (16.5 + 0.256788 * rgba[p] + 0.504129 * rgba[p + 1] + 0.097906 * rgba[p + 2]) | 0;
  }
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p0 = ((y * 2) * w + x * 2) * 4;
      const p1 = p0 + w * 4;
      const r = (rgba[p0] + rgba[p0 + 4] + rgba[p1] + rgba[p1 + 4]) * 0.25;
      const g = (rgba[p0 + 1] + rgba[p0 + 5] + rgba[p1 + 1] + rgba[p1 + 5]) * 0.25;
      const b = (rgba[p0 + 2] + rgba[p0 + 6] + rgba[p1 + 2] + rgba[p1 + 6]) * 0.25;
      const k = y * cw + x;
      U[k] = (128.5 - 0.148223 * r - 0.290993 * g + 0.439216 * b) | 0;
      V[k] = (128.5 + 0.439216 * r - 0.367788 * g - 0.071427 * b) | 0;
    }
  }
  if (alphaOut) {
    const A = alphaOut.subarray(0, ySize);
    for (let i = 0, p = 3; i < ySize; i++, p += 4) A[i] = rgba[p];
    // plane U/V alpha sudah diisi 128 sekali di awal
  }
}

async function pickVideoConfig(w, h, fps, crf, speed) {
  const base = { width: w, height: h, framerate: fps, latencyMode: 'quality' };
  // Coba mode kuantizer (setara CRF); jika tidak didukung pakai bitrate variabel
  const codecs = ['vp09.00.10.08', 'vp09.00.40.08', 'vp09.00.50.08', 'vp09.00.61.08'];
  for (const codec of codecs) {
    const q = { ...base, codec, bitrateMode: 'quantizer' };
    try {
      if ((await VideoEncoder.isConfigSupported(q)).supported) return { config: q, quantizer: Math.max(0, Math.min(63, Math.round(crf))) };
    } catch { /* lanjut */ }
  }
  // Perkiraan bitrate dari CRF: CRF 30 ≈ 0.10 bit/piksel/frame
  const bpp = 0.1 * Math.pow(2, (30 - crf) / 6);
  const bitrate = Math.round(Math.min(60e6, Math.max(500e3, w * h * fps * bpp * (speed >= 4 ? 0.8 : 1))));
  for (const codec of codecs) {
    const v = { ...base, codec, bitrate, bitrateMode: 'variable' };
    try {
      if ((await VideoEncoder.isConfigSupported(v)).supported) return { config: v, quantizer: null };
    } catch { /* lanjut */ }
  }
  throw new Error(`Browser tidak bisa encode VP9 pada ${w}×${h}. Coba resolusi lebih kecil.`);
}

async function loadFonts(project) {
  const loads = [];
  for (const t of project.tracks)
    for (const c of t.clips)
      if (c.type === 'text') loads.push(document.fonts.load(`${c.text.fontWeight} ${c.text.fontSize}px "${c.text.fontFamily}"`, c.text.content));
      else if (c.type === 'fx') for (const f of [...fxFonts(c), 'Inter']) loads.push(document.fonts.load(`400 80px "${f}"`), document.fonts.load(`900 80px "${f}"`));
  await Promise.all(loads).catch(() => {});
  await document.fonts.ready;
}

/** Mix semua klip audio + audio video jadi satu AudioBuffer stereo 48 kHz. */
async function mixAudio(project, assets, getBlob, end) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const items = [];
  for (const track of project.tracks) {
    if (!track.visible) continue;
    for (const c of track.clips) {
      const a = byId.get(c.assetId);
      if (!a || c.muted || c.start >= end) continue;
      if (c.type === 'audio' || (c.type === 'video' && a.hasAudio !== false)) items.push({ c, a });
    }
  }
  if (!items.length) return null;
  const decodeCtx = new OfflineAudioContext(2, 1, SR);
  const cache = new Map();
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(end * SR)), SR);
  let used = 0;
  for (const { c, a } of items) {
    let buf = cache.get(a.id);
    if (buf === undefined) {
      try {
        const blob = await getBlob(a);
        buf = await decodeCtx.decodeAudioData(await blob.arrayBuffer());
      } catch {
        buf = null; // video tanpa audio / format tidak didukung
      }
      cache.set(a.id, buf);
    }
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = Math.max(0, c.volume ?? 1);
    src.connect(g).connect(ctx.destination);
    const inPoint = c.inPoint || 0;
    const dur = Math.min(c.duration, end - c.start, buf.duration - inPoint);
    if (dur <= 0) continue;
    src.start(c.start, inPoint, dur);
    used += 1;
  }
  if (!used) return null;
  return ctx.startRendering();
}

async function encodeAudio(buffer, writer, signal) {
  const cfg = { codec: 'opus', sampleRate: SR, numberOfChannels: 2, bitrate: 160000 };
  if (typeof AudioEncoder === 'undefined' || !(await AudioEncoder.isConfigSupported(cfg)).supported) return false;
  let err = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig && meta.decoderConfig.description) writer.setAudioPrivate(meta.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      writer.addAudio(data, chunk.timestamp);
    },
    error: (e) => { err = e; },
  });
  enc.configure(cfg);
  const L = buffer.getChannelData(0);
  const R = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : L;
  const step = SR; // 1 detik per AudioData
  for (let i = 0; i < buffer.length; i += step) {
    if (signal.aborted) break;
    const n = Math.min(step, buffer.length - i);
    const planar = new Float32Array(n * 2);
    planar.set(L.subarray(i, i + n), 0);
    planar.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data: planar });
    enc.encode(ad);
    ad.close();
  }
  await enc.flush();
  enc.close();
  if (err) throw err;
  return true;
}

/**
 * Render proyek di browser.
 * opts: { scale, crf, alpha, speed, end }
 * onProgress({ status, progress, frame, frames, eta })
 */
export async function renderInBrowser({ project, assets, assetUrl, getBlob, opts, onProgress, signal }) {
  const unsupported = browserRenderSupport();
  if (unsupported) throw new Error(unsupported);
  const { width, height, fps } = project.settings;
  const scale = opts.scale || 1;
  const W = Math.round((width * scale) / 2) * 2;
  const H = Math.round((height * scale) / 2) * 2;
  const end = Math.min(project.settings.duration, opts.end || project.settings.duration);
  const frames = Math.max(1, Math.round(end * fps));
  const alpha = !!opts.alpha;

  onProgress({ status: 'preparing', progress: 0 });
  await loadFonts(project);
  const pool = new MediaPool({ exact: true });
  pool.setAssets(assets.map((a) => ({ ...a, url: assetUrl(a) })));
  pool.sync(project);
  const failed = await pool.waitLoaded();
  if (failed.length) throw new Error('Ada video yang tidak bisa diputar browser ini. Coba ubah ke WebM/MP4 (H.264) lalu upload ulang.');

  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });

  const { config, quantizer } = await pickVideoConfig(W, H, fps, opts.crf ?? 30, opts.speed ?? 2);
  const writer = new WebMWriter({ width: W, height: H, fps, alpha, audio: { sampleRate: SR, channels: 2 } });
  const colorChunks = [];
  const alphaChunks = [];
  let encErr = null;
  const mk = (list) =>
    new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        list.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' });
      },
      error: (e) => { encErr = e; },
    });
  const colorEnc = mk(colorChunks);
  colorEnc.configure(config);
  const alphaEnc = alpha ? mk(alphaChunks) : null;
  if (alphaEnc) alphaEnc.configure(config);

  const ySize = W * H;
  const frameBytes = ySize + 2 * (W >> 1) * (H >> 1);
  const yuv = new Uint8Array(frameBytes);
  const ayuv = alpha ? new Uint8Array(frameBytes).fill(128) : null;
  const keyEvery = Math.max(1, Math.round(fps * 2));
  const t0 = performance.now();

  try {
    for (let i = 0; i < frames; i++) {
      if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');
      if (encErr) throw encErr;
      const t = i / fps;
      await pool.seekExact(project, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.setTransform(W / width, 0, 0, H / height, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      drawFrame(ctx, project, t, pool, { transparent: alpha });
      const rgba = ctx.getImageData(0, 0, W, H).data;
      rgbaToI420(rgba, W, H, yuv, ayuv);

      const ts = Math.round((i * 1e6) / fps);
      const dur = Math.round(1e6 / fps);
      const encOpts = { keyFrame: i % keyEvery === 0 };
      if (quantizer != null) encOpts.vp9 = { quantizer };
      const frame = new VideoFrame(yuv, { format: 'I420', codedWidth: W, codedHeight: H, timestamp: ts, duration: dur, colorSpace: COLOR_SPACE });
      colorEnc.encode(frame, encOpts);
      frame.close();
      if (alphaEnc) {
        const af = new VideoFrame(ayuv, { format: 'I420', codedWidth: W, codedHeight: H, timestamp: ts, duration: dur, colorSpace: COLOR_SPACE });
        alphaEnc.encode(af, encOpts);
        af.close();
      }
      // Tahan agar antrean encoder tidak membengkak (memori)
      while (colorEnc.encodeQueueSize > 3 || (alphaEnc && alphaEnc.encodeQueueSize > 3)) await new Promise((r) => setTimeout(r, 4));
      if (i % 2 === 0 || i === frames - 1) {
        const el = (performance.now() - t0) / 1000;
        onProgress({ status: 'rendering', progress: 0.02 + 0.9 * ((i + 1) / frames), frame: i + 1, frames, eta: (el / (i + 1)) * (frames - i - 1) });
        await new Promise((r) => setTimeout(r, 0)); // beri kesempatan UI menggambar ulang
      }
    }
    await colorEnc.flush();
    if (alphaEnc) await alphaEnc.flush();
    if (encErr) throw encErr;
  } finally {
    if (colorEnc.state !== 'closed') colorEnc.close();
    if (alphaEnc && alphaEnc.state !== 'closed') alphaEnc.close();
    pool.pauseAll();
  }

  const alphaByTs = new Map(alphaChunks.map((c) => [c.ts, c]));
  for (const c of colorChunks) {
    const a = alpha ? alphaByTs.get(c.ts) : null;
    writer.addVideo(c.data, c.ts, c.key, a ? a.data : null);
  }

  onProgress({ status: 'muxing', progress: 0.94 });
  const mixed = await mixAudio(project, assets, getBlob, end);
  if (mixed) await encodeAudio(mixed, writer, signal);
  if (signal.aborted) throw new DOMException('Dibatalkan', 'AbortError');

  const blob = writer.finalize(end);
  return { blob, width: W, height: H, frames, elapsed: (performance.now() - t0) / 1000 };
}
