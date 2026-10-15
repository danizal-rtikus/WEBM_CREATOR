// Compositor canvas 2D: menggambar satu frame proyek pada waktu t.
// Dipakai PreviewCanvas (editor) dan render-main.js (export) — kode yang sama.
import { evaluate } from './evaluate.js';
import { drawFx } from './fx/index.js';
import { sprite, pixelScale } from './fx/util.js';

const measureCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const measureCtx = measureCanvas ? measureCanvas.getContext('2d') : null;

export function fontString(text) {
  return `${text.fontWeight || 400} ${text.fontSize}px "${text.fontFamily}", sans-serif`;
}

export function textLayout(text) {
  const ctx = measureCtx;
  ctx.font = fontString(text);
  try {
    ctx.letterSpacing = `${text.letterSpacing || 0}px`;
  } catch {
    /* browser lama */
  }
  const lines = String(text.content || '').split('\n');
  const widths = lines.map((l) => ctx.measureText(l).width);
  const lineH = text.fontSize * (text.lineHeight || 1.2);
  return { lines, widths, lineH, w: Math.max(1, ...widths), h: Math.max(1, lines.length * lineH) };
}

/** Ukuran natural elemen (sebelum skala). */
export function clipSize(clip, media, project) {
  if (clip.type === 'fx') return { w: project ? project.settings.width : 1920, h: project ? project.settings.height : 1080 };
  if (clip.type === 'text') {
    const l = textLayout(clip.text);
    return { w: l.w, h: l.h };
  }
  if (clip.type === 'shape') return { w: clip.shape.width, h: clip.shape.height };
  const asset = media.asset(clip.assetId);
  if (clip.type === 'video') {
    const v = media.video(clip.id);
    if (v && v.videoWidth) return { w: v.videoWidth, h: v.videoHeight };
  }
  if (asset && asset.width) return { w: asset.width, h: asset.height };
  const img = media.image(clip.assetId);
  if (img && img.naturalWidth) return { w: img.naturalWidth, h: img.naturalHeight };
  return { w: 100, h: 100 };
}

export function activeClips(project, t) {
  const out = [];
  for (const track of project.tracks) {
    if (!track.visible) continue;
    for (const clip of track.clips) {
      if (clip.type === 'audio') continue;
      if (t >= clip.start && t < clip.start + clip.duration) out.push({ track, clip });
    }
  }
  return out;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawText(ctx, text, w, override) {
  const l = textLayout(text);
  ctx.font = fontString(text);
  try {
    ctx.letterSpacing = `${text.letterSpacing || 0}px`;
  } catch {
    /* noop */
  }
  if (text.bgEnabled) {
    const p = text.bgPadding || 0;
    ctx.save();
    ctx.fillStyle = override || text.bgColor;
    roundRect(ctx, -p, -p, l.w + p * 2, l.h + p * 2, Math.min(24, p));
    ctx.fill();
    ctx.restore();
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = text.align || 'center';
  const x = text.align === 'left' ? 0 : text.align === 'right' ? w : w / 2;
  if (text.shadow && !override) {
    ctx.shadowColor = text.shadowColor;
    ctx.shadowBlur = text.shadowBlur * pixelScale(ctx);
    ctx.shadowOffsetY = Math.round(text.shadowBlur / 3) * pixelScale(ctx);
  }
  l.lines.forEach((line, i) => {
    const y = i * l.lineH + l.lineH / 2;
    if (text.strokeWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = text.strokeWidth * 2;
      ctx.strokeStyle = override || text.strokeColor;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = override || text.color;
    ctx.fillText(line, x, y);
  });
}

// ---------- Shape ----------
function shapeFill(ctx, s, w, h) {
  if (s.fillType === 'linear') {
    const a = ((s.gradAngle || 0) * Math.PI) / 180;
    const r = Math.hypot(w, h) / 2;
    const g = ctx.createLinearGradient(w / 2 - Math.cos(a) * r, h / 2 - Math.sin(a) * r, w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    g.addColorStop(0, s.fill);
    g.addColorStop(1, s.fill2 || s.fill);
    return g;
  }
  if (s.fillType === 'radial') {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2);
    g.addColorStop(0, s.fill);
    g.addColorStop(1, s.fill2 || s.fill);
    return g;
  }
  return s.fill;
}

function polyPath(ctx, w, h, n, inner) {
  const pts = inner ? n * 2 : n;
  ctx.beginPath();
  for (let i = 0; i < pts; i++) {
    const a = -Math.PI / 2 + (i / pts) * Math.PI * 2;
    const k = inner && i % 2 ? inner : 1;
    const x = w / 2 + Math.cos(a) * (w / 2) * k;
    const y = h / 2 + Math.sin(a) * (h / 2) * k;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawShape(ctx, s, w, h, override) {
  const fill = override || shapeFill(ctx, s, w, h);
  if (s.kind === 'ring') {
    const th = Math.min(s.thickness || 20, Math.min(w, h) / 2);
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.ellipse(w / 2, h / 2, Math.max(0, w / 2 - th), Math.max(0, h / 2 - th), 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
    return;
  }
  if (s.kind === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (s.kind === 'polygon') polyPath(ctx, w, h, Math.max(3, Math.round(s.sides || 6)), 0);
  else if (s.kind === 'star') polyPath(ctx, w, h, Math.max(3, Math.round(s.points || 5)), s.inner || 0.45);
  else roundRect(ctx, 0, 0, w, h, s.radius || 0);
  ctx.fillStyle = fill;
  ctx.fill();
}

// ---------- Konten satu klip (di koordinat lokal 0..w, 0..h) ----------
function drawContent(ctx, clip, w, h, media, override) {
  const fx = clip.effects || {};
  if (clip.type === 'text') drawText(ctx, clip.text, w, override);
  else if (clip.type === 'shape') drawShape(ctx, clip.shape, w, h, override);
  else if (clip.type === 'video') {
    const v = media.video(clip.id);
    if (v && v.readyState >= 2) {
      if (override) {
        // Siluet video untuk extrude: gunakan kotak berwarna
        ctx.fillStyle = override;
        ctx.fillRect(0, 0, w, h);
      } else ctx.drawImage(v, 0, 0, w, h);
    }
  } else {
    const img = media.image(clip.assetId);
    if (!img || !img.complete || !img.naturalWidth) return;
    const outline = fx.outline && fx.outline.on ? fx.outline.width : 0;
    const tint = override || (fx.tint && fx.tint.on ? fx.tint.color : null);
    if (outline || tint) {
      const spr = sprite(img, w, { outline, outlineColor: override || fx.outline.color, tint });
      ctx.drawImage(spr.canvas, -spr.pad, -spr.pad, spr.w + spr.pad * 2, spr.h + spr.pad * 2);
    } else ctx.drawImage(img, 0, 0, w, h);
  }
}

function applyTransform(ctx, p, w, h) {
  ctx.translate(p.x, p.y);
  ctx.rotate((p.rotation * Math.PI) / 180);
  const ry = Math.cos(((p.rotateY || 0) * Math.PI) / 180);
  ctx.scale(p.scaleX * (Math.abs(ry) < 0.01 ? 0.01 : ry), p.scaleY);
  ctx.translate(-p.anchorX * w, -p.anchorY * h);
}

/** Gambar satu klip visual pada waktu t (tanpa motion blur). */
function drawClipAt(ctx, clip, t, media, project, alphaMul = 1) {
  if (clip.type === 'fx') {
    const p = evaluate(clip, t - clip.start);
    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, p.opacity)) * alphaMul;
    if (clip.effects && clip.effects.blend) ctx.globalCompositeOperation = clip.effects.blend;
    drawFx(ctx, clip, project, t, media);
    ctx.restore();
    return;
  }
  const p = evaluate(clip, t - clip.start);
  if (p.opacity <= 0.001) return;
  const { w, h } = clipSize(clip, media, project);
  const fx = clip.effects || {};
  ctx.save();
  ctx.globalAlpha *= Math.max(0, Math.min(1, p.opacity)) * alphaMul;
  if (fx.blend) ctx.globalCompositeOperation = fx.blend;

  // Extrude / ketebalan: salinan bertumpuk berwarna gelap di belakang
  if (fx.depth && fx.depth.on && fx.depth.size > 0) {
    const n = Math.min(40, Math.max(2, Math.round(fx.depth.size / 1.5)));
    const ry = ((p.rotateY || 0) * Math.PI) / 180;
    const ang = ((fx.depth.angle ?? 45) * Math.PI) / 180;
    const dx = p.rotateY ? Math.sin(ry) : Math.cos(ang);
    const dy = p.rotateY ? 0 : Math.sin(ang);
    for (let i = n; i >= 1; i--) {
      const d = (fx.depth.size * i) / n;
      ctx.save();
      ctx.translate(dx * d, dy * d);
      applyTransform(ctx, p, w, h);
      drawContent(ctx, clip, w, h, media, fx.depth.color || '#000000');
      ctx.restore();
    }
  }

  applyTransform(ctx, p, w, h);
  if (fx.glow && fx.glow.on) {
    ctx.shadowColor = fx.glow.color;
    ctx.shadowBlur = fx.glow.blur * pixelScale(ctx);
    const reps = Math.max(1, Math.round(fx.glow.strength || 1));
    for (let i = 1; i < reps; i++) drawContent(ctx, clip, w, h, media);
  }
  drawContent(ctx, clip, w, h, media);
  ctx.restore();
}

// ---------- Layer offscreen (untuk motion blur & track matte) ----------
const layers = new Map();
function getLayer(ctx, key) {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  let c = layers.get(key);
  if (!c || c.width !== cw || c.height !== ch) {
    c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    layers.set(key, c);
  }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, cw, ch);
  g.setTransform(ctx.getTransform());
  g.imageSmoothingQuality = 'high';
  return g;
}

function blit(ctx, layerCtx, op) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (op) ctx.globalCompositeOperation = op;
  ctx.drawImage(layerCtx.canvas, 0, 0);
  ctx.restore();
}

function drawClip(ctx, clip, t, media, project, depth = 0) {
  const mb = clip.effects && clip.effects.motionBlur;
  if (mb && mb.on && clip.type !== 'fx' && depth < 2) {
    // Rata-rata beberapa sampel waktu dalam satu "shutter"
    const fps = project.settings.fps;
    const n = Math.max(2, Math.min(16, Math.round(mb.samples || 8)));
    const shutter = (mb.shutter ?? 180) / 360 / fps;
    const g = getLayer(ctx, `mb${depth}`);
    for (let i = 0; i < n; i++) {
      const ts = t - shutter / 2 + (shutter * i) / (n - 1);
      g.save();
      g.globalAlpha = 1 / (i + 1);
      drawClipAt(g, clip, Math.max(clip.start, ts), media, project);
      g.restore();
    }
    blit(ctx, g);
    return;
  }
  drawClipAt(ctx, clip, t, media, project);
}

function drawTrack(ctx, track, t, media, project, depth) {
  for (const clip of track.clips) {
    if (clip.type === 'audio') continue;
    if (t >= clip.start && t < clip.start + clip.duration) drawClip(ctx, clip, t, media, project, depth);
  }
}

/**
 * Gambar frame.
 * @param ctx CanvasRenderingContext2D yang sudah di-scale ke koordinat proyek
 * @param media { asset(id), image(assetId), video(clipId) }
 * @param opts { transparent?: boolean } — jika true, latar tidak digambar
 */
export function drawFrame(ctx, project, t, media, opts = {}) {
  const { width, height, background } = project.settings;
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  const transparent = opts.transparent ?? project.settings.transparent;
  if (!transparent) {
    ctx.fillStyle = background || '#000';
    ctx.fillRect(0, 0, width, height);
  }
  const tracks = project.tracks;
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    // Track ini dipakai sebagai matte oleh track di bawahnya → tidak digambar sendiri
    if (i > 0 && tracks[i - 1].matte && tracks[i - 1].visible) continue;
    if (!track.visible) continue;
    if (track.matte && tracks[i + 1]) {
      const a = getLayer(ctx, 'matteA');
      drawTrack(a, track, t, media, project, 1);
      const b = getLayer(ctx, 'matteB');
      drawTrack(b, tracks[i + 1], t, media, project, 1);
      blit(a, b, track.matte === 'invert' ? 'destination-out' : 'destination-in');
      blit(ctx, a);
    } else {
      drawTrack(ctx, track, t, media, project, 0);
    }
  }
  ctx.restore();
}

/** Empat sudut kotak klip dalam koordinat proyek (untuk seleksi & hit-test). */
export function clipCorners(clip, t, media, project) {
  const p = evaluate(clip, t - clip.start);
  const { w, h } = clipSize(clip, media, project);
  const rad = (p.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sx = p.scaleX * Math.cos(((p.rotateY || 0) * Math.PI) / 180);
  const pts = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ].map(([lx, ly]) => {
    const x = (lx - p.anchorX * w) * sx;
    const y = (ly - p.anchorY * h) * p.scaleY;
    return [p.x + x * cos - y * sin, p.y + x * sin + y * cos];
  });
  return { pts, props: p, w, h };
}

/** Apakah titik (px,py) dalam koordinat proyek berada di dalam klip? */
export function hitTest(clip, t, media, px, py, project) {
  if (clip.type === 'fx') return false;
  const p = evaluate(clip, t - clip.start);
  const { w, h } = clipSize(clip, media, project);
  const rad = (-p.rotation * Math.PI) / 180;
  const sx = p.scaleX * Math.cos(((p.rotateY || 0) * Math.PI) / 180);
  const dx = px - p.x;
  const dy = py - p.y;
  const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / (Math.abs(sx) < 1e-4 ? 1e-4 : sx) + p.anchorX * w;
  const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / (p.scaleY || 1e-6) + p.anchorY * h;
  return lx >= 0 && lx <= w && ly >= 0 && ly <= h;
}
