// Upload & pemrosesan aset: validasi, sanitasi SVG, probe metadata,
// thumbnail, dan transcode ke format yang bisa diputar browser bila perlu.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { DIRS, MAX_UPLOAD } from './config.js';
import { newId, addAsset, updateAsset } from './storage.js';
import { ffprobe, ffmpeg } from './ffmpeg.js';

const EXT_KIND = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image', avif: 'image', bmp: 'image',
  mp4: 'video', webm: 'video', mov: 'video', mkv: 'video', m4v: 'video', avi: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', opus: 'audio',
};

const BROWSER_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
const BROWSER_VIDEO_EXT = new Set(['mp4', 'webm', 'm4v', 'mov']);
const BROWSER_AUDIO_CODECS = new Set(['mp3', 'aac', 'opus', 'vorbis', 'flac', 'pcm_s16le', 'pcm_s24le', 'pcm_f32le', 'pcm_u8']);

function safeName(name) {
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
}

export function sanitizeSvg(src) {
  return src
    .replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href\s*=\s*["'])\s*(javascript:|https?:|\/\/)[^"']*(["'])/gi, '$1#$3')
    .replace(/@import[^;]+;/gi, '');
}

function svgSize(src) {
  const tag = (src.match(/<svg\b[^>]*>/i) || [''])[0];
  const num = (attr) => {
    const m = tag.match(new RegExp(`\\s${attr}\\s*=\\s*["']?([\\d.]+)(px)?["']?`, 'i'));
    return m ? parseFloat(m[1]) : null;
  };
  let w = num('width');
  let h = num('height');
  const vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if ((!w || !h) && vb) {
    const vw = parseFloat(vb[1]);
    const vh = parseFloat(vb[2]);
    if (w && !h) h = (w * vh) / vw;
    else if (h && !w) w = (h * vw) / vh;
    else {
      w = vw;
      h = vh;
    }
  }
  w = w || 512;
  h = h || 512;
  // Rasterisasi SVG mengikuti ukuran ini; naikkan agar logo tetap tajam di 4K
  const k = Math.max(1, 1024 / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** Pastikan SVG punya width/height eksplisit agar browser tahu ukuran naturalnya. */
function normalizeSvg(src, size) {
  return src.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    let a = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    if (!/viewBox/i.test(a)) a += ` viewBox="0 0 ${size.width} ${size.height}"`;
    return `<svg${a} width="${size.width}" height="${size.height}">`;
  });
}

/** Simpan upload (raw body) ke disk, lalu proses jadi aset. */
export async function handleUpload(req) {
  const rawName = decodeURIComponent(String(req.headers['x-filename'] || 'upload'));
  const ext = path.extname(rawName).slice(1).toLowerCase();
  const kind = EXT_KIND[ext];
  if (!kind) throw Object.assign(new Error(`Format .${ext || '?'} tidak didukung`), { status: 415 });
  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_UPLOAD) throw Object.assign(new Error('File melebihi batas 500 MB'), { status: 413 });

  const id = newId('ast');
  const base = `${id}-${safeName(path.basename(rawName, path.extname(rawName)))}`;
  let file = `${base}.${ext}`;
  const dest = path.join(DIRS.media, file);

  let size = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > MAX_UPLOAD) cb(Object.assign(new Error('File melebihi batas 500 MB'), { status: 413 }));
      else cb(null, chunk);
    },
  });
  try {
    await pipeline(req, limiter, fs.createWriteStream(dest));
  } catch (e) {
    await fsp.rm(dest, { force: true });
    throw e;
  }

  const asset = {
    id,
    name: rawName.slice(0, 120),
    kind,
    file,
    url: `/media/${encodeURIComponent(file)}`,
    size,
    createdAt: new Date().toISOString(),
  };

  try {
    if (ext === 'svg') {
      const src = await fsp.readFile(dest, 'utf8');
      if (!/<svg\b/i.test(src)) throw Object.assign(new Error('File SVG tidak valid'), { status: 400 });
      const clean = sanitizeSvg(src);
      const dims = svgSize(clean);
      await fsp.writeFile(dest, normalizeSvg(clean, dims));
      Object.assign(asset, dims, { mime: 'image/svg+xml', hasAlpha: true });
    } else {
      const info = await ffprobe(dest);
      const v = info.streams.find((s) => s.codec_type === 'video');
      const a = info.streams.find((s) => s.codec_type === 'audio');
      const duration = parseFloat(info.format && info.format.duration) || (v && parseFloat(v.duration)) || 0;

      if (kind === 'image') {
        if (!v) throw Object.assign(new Error('Gambar tidak bisa dibaca'), { status: 400 });
        Object.assign(asset, { width: v.width, height: v.height, hasAlpha: /a|pal8/.test(v.pix_fmt || '') });
      } else if (kind === 'video') {
        if (!v) throw Object.assign(new Error('Tidak ada stream video'), { status: 400 });
        const alpha = (v.tags && (v.tags.alpha_mode === '1' || v.tags.ALPHA_MODE === '1')) || /yuva|rgba|argb|bgra/.test(v.pix_fmt || '');
        Object.assign(asset, { width: v.width, height: v.height, duration, fps: evalRate(v.avg_frame_rate), hasAudio: !!a, hasAlpha: !!alpha, codec: v.codec_name });
        // Rotasi metadata (video HP) — tukar dimensi
        const rot = Math.abs(Number((v.tags && v.tags.rotate) || (v.side_data_list || []).find((d) => d.rotation != null)?.rotation || 0));
        if (rot === 90 || rot === 270) [asset.width, asset.height] = [asset.height, asset.width];

        const playable = BROWSER_VIDEO_CODECS.has(v.codec_name) && BROWSER_VIDEO_EXT.has(ext) && !/yuva|rgba/.test(v.pix_fmt || '') || (ext === 'webm' && BROWSER_VIDEO_CODECS.has(v.codec_name));
        if (!playable) {
          // Transcode ke WebM VP9 (alpha dipertahankan jika ada)
          const out = `${base}.converted.webm`;
          await ffmpeg([
            '-y', '-i', dest,
            '-c:v', 'libvpx-vp9', '-pix_fmt', alpha ? 'yuva420p' : 'yuv420p', '-crf', '20', '-b:v', '0',
            '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1',
            ...(a ? ['-c:a', 'libopus', '-b:a', '192k'] : ['-an']),
            path.join(DIRS.media, out),
          ]);
          await fsp.rm(dest, { force: true });
          file = out;
          asset.file = out;
          asset.url = `/media/${encodeURIComponent(out)}`;
          asset.size = (await fsp.stat(path.join(DIRS.media, out))).size;
          asset.converted = true;
        }
        const thumb = `thumbs/${id}.jpg`;
        await ffmpeg(['-y', '-ss', String(Math.min(1, duration / 2)), '-i', path.join(DIRS.media, file), '-frames:v', '1', '-vf', 'scale=320:-2', '-q:v', '4', path.join(DIRS.media, thumb)]).catch(() => null);
        if (fs.existsSync(path.join(DIRS.media, thumb))) {
          asset.thumbFile = thumb;
          asset.thumbUrl = `/media/${thumb}`;
        }
      } else if (kind === 'audio') {
        if (!a) throw Object.assign(new Error('Tidak ada stream audio'), { status: 400 });
        Object.assign(asset, { duration, hasAudio: true, codec: a.codec_name });
        if (!BROWSER_AUDIO_CODECS.has(a.codec_name)) {
          const out = `${base}.converted.ogg`;
          await ffmpeg(['-y', '-i', dest, '-vn', '-c:a', 'libopus', '-b:a', '192k', path.join(DIRS.media, out)]);
          await fsp.rm(dest, { force: true });
          asset.file = out;
          asset.url = `/media/${encodeURIComponent(out)}`;
          asset.converted = true;
        }
      }
    }
  } catch (e) {
    await fsp.rm(path.join(DIRS.media, asset.file), { force: true });
    throw e;
  }
  return addAsset(asset);
}

/**
 * Salinan VP9 untuk browser tanpa codec proprietary (H.264/HEVC), mis. Chromium
 * headless milik Puppeteer atau Firefox. Kualitas tinggi (CRF 12) agar render tetap tajam.
 */
export async function ensureRenderProxy(asset, { onSpawn } = {}) {
  if (asset.renderFile && fs.existsSync(path.join(DIRS.media, asset.renderFile))) return asset;
  const out = `render-proxy/${asset.id}.webm`;
  await fsp.mkdir(path.join(DIRS.media, 'render-proxy'), { recursive: true });
  await ffmpeg(
    ['-y', '-i', path.join(DIRS.media, asset.file), '-c:v', 'libvpx-vp9', '-pix_fmt', asset.hasAlpha ? 'yuva420p' : 'yuv420p', '-crf', '12', '-b:v', '0',
      '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1', '-an', path.join(DIRS.media, out)],
    { onSpawn },
  );
  const patch = { renderFile: out, renderUrl: `/media/${out}` };
  Object.assign(asset, patch);
  await updateAsset(asset.id, patch);
  return asset;
}

function evalRate(r) {
  if (!r || r === '0/0') return null;
  const [a, b] = r.split('/').map(Number);
  return b ? Math.round((a / b) * 1000) / 1000 : a;
}
