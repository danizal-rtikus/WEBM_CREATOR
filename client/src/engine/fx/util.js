// Utilitas bersama untuk efek prosedural (FX). Semua fungsi deterministik:
// hasil hanya bergantung pada parameter + waktu, sehingga pratinjau = render.
import { ease } from '../easing.js';

export { ease };

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Progres 0..1 dari t di rentang [a, b] */
export const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a)));

/** Hash deterministik → [0, 1). seed, i (indeks partikel), k (saluran acak). */
export function rnd(seed, i, k = 0) {
  let h = (seed | 0) ^ Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const rndRange = (seed, i, k, a, b) => a + (b - a) * rnd(seed, i, k);
export const rndSigned = (seed, i, k) => rnd(seed, i, k) * 2 - 1;

const makeCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

// ---------- Logo placeholder ----------
let placeholder = null;
export function placeholderLogo() {
  if (placeholder) return placeholder;
  const c = makeCanvas(512, 512);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.font = '900 150px Inter, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  ['YOUR', 'LOGO', 'HERE'].forEach((w, i) => g.fillText(w, 256, 110 + i * 146));
  placeholder = c;
  return c;
}

// ---------- Sprite cache: logo + outline + tint pada ukuran tertentu ----------
const spriteCache = new Map();
const MAX_SPRITES = 120;

/**
 * Logo siap gambar dengan outline (stiker) dan/atau tint, di-cache per ukuran.
 * size = lebar target (px proyek). Mengembalikan { canvas, w, h, pad }.
 */
export function sprite(img, size, { outline = 0, outlineColor = '#000', tint = null } = {}) {
  const src = img && (img.naturalWidth || img.width) ? img : placeholderLogo();
  const iw = src.naturalWidth || src.width;
  const ih = src.naturalHeight || src.height;
  const w = Math.max(4, Math.round(size));
  const h = Math.max(4, Math.round((w * ih) / iw));
  const o = Math.round(outline);
  const key = `${src.src || 'ph'}|${w}|${o}|${outlineColor}|${tint}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const pad = o + 2;
  const c = makeCanvas(w + pad * 2, h + pad * 2);
  const g = c.getContext('2d');
  if (o > 0) {
    // Siluet berwarna digambar melingkar → outline stiker
    const sil = makeCanvas(w, h);
    const sg = sil.getContext('2d');
    sg.drawImage(src, 0, 0, w, h);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = outlineColor;
    sg.fillRect(0, 0, w, h);
    const steps = Math.max(12, o * 3);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      g.drawImage(sil, pad + Math.cos(a) * o, pad + Math.sin(a) * o);
    }
    g.drawImage(sil, pad, pad);
  }
  if (tint) {
    const tc = makeCanvas(w, h);
    const tg = tc.getContext('2d');
    tg.drawImage(src, 0, 0, w, h);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = tint;
    tg.fillRect(0, 0, w, h);
    g.drawImage(tc, pad, pad);
  } else {
    g.drawImage(src, pad, pad, w, h);
  }
  const res = { canvas: c, w, h, pad };
  if (spriteCache.size > MAX_SPRITES) spriteCache.delete(spriteCache.keys().next().value);
  spriteCache.set(key, res);
  return res;
}

/** Gambar sprite berpusat di (x,y) dengan rotasi (derajat), skala, flipX (−1..1 untuk efek 3D). */
export function drawSprite(ctx, spr, x, y, { rot = 0, scale = 1, alpha = 1, flip = 1 } = {}) {
  if (alpha <= 0.002 || scale <= 0.001) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  ctx.translate(x, y);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(scale * flip, scale);
  ctx.drawImage(spr.canvas, -spr.w / 2 - spr.pad, -spr.h / 2 - spr.pad);
  ctx.restore();
}

/** Skala transform saat ini (untuk shadowBlur yang tidak ikut transform canvas). */
export function pixelScale(ctx) {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b) || 1;
}

export function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur * pixelScale(ctx);
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

export function noGlow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}

/** Gradasi linear melintang layar dengan sudut (derajat). */
export function linearGrad(ctx, W, H, angle, stops) {
  const a = (angle * Math.PI) / 180;
  const r = Math.hypot(W, H) / 2;
  const cx = W / 2;
  const cy = H / 2;
  const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  stops.forEach((c, i) => g.addColorStop(i / Math.max(1, stops.length - 1), c));
  return g;
}

/** Latar panel: gradasi + vignette (seperti referensi panel biru). */
export function panelFill(ctx, x, y, w, h, c1, c2, W, H) {
  const g = ctx.createRadialGradient(W * 0.6, H * 0.35, 0, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.65);
  g.addColorStop(0, c2);
  g.addColorStop(1, c1);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/** Path tepi bergerigi vertikal di x (untuk wipe neon). Tetap (seed) agar tidak berkedip. */
export function jaggedEdge(seed, H, amp, segs = 9) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const y = (i / segs) * H;
    const off = (rnd(seed, i, 3) * 2 - 1) * amp;
    pts.push([off, y]);
    if (i < segs) pts.push([off + (rnd(seed, i, 4) > 0.5 ? amp * 0.7 : -amp * 0.7), y + H / segs / 2]);
  }
  return pts;
}

/** Tepi bergelombang (scallop) untuk tirai partikel alami. */
export function scallopPath(ctx, x, H, r, dir = 1, phase = 0) {
  // Kotak dari kiri layar sampai tepi x yang bergelombang
  const n = Math.ceil(H / r) + 1;
  ctx.moveTo(-10, -10);
  ctx.lineTo(x, -10);
  for (let i = 0; i <= n; i++) {
    const y = i * r;
    const bulge = r * (0.6 + 0.4 * Math.sin(i * 1.7 + phase));
    ctx.quadraticCurveTo(x + bulge * dir, y + r / 2, x, Math.min(H + 10, y + r));
  }
  ctx.lineTo(-10, H + 10);
  ctx.closePath();
}

/** Gambar sebuah teks besar dengan outline opsional. */
export function bigText(ctx, text, x, y, { size, font = 'Inter', weight = 900, color = '#fff', stroke = 0, strokeColor = '#000', align = 'center' }) {
  ctx.font = `${weight} ${size}px "${font}", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (stroke > 0) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke * 2;
    ctx.strokeStyle = strokeColor;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Hero logo di tengah: pop masuk, flip 3D opsional, extrude, glow; keluar mengecil. */
export function heroLogo(ctx, env, p, { tIn, tOut, spin = 0, depth = 0, depthColor = '#0a1a40', glowColor = null, glowBlur = 0 }) {
  const { t, W, H } = env;
  const img = env.image(p.logo);
  const size = (p.logoSize / 100) * W;
  const spr = sprite(img, size, { outline: p.logoOutline || 0, outlineColor: p.logoOutlineColor || '#000' });
  const kin = ease('overshoot', prog(t, tIn, tIn + 0.35));
  const kout = 1 - ease('smoothIn', prog(t, tOut, tOut + 0.25));
  const s = kin * kout;
  if (s <= 0.001) return;
  const ang = spin ? spin * prog(t, tIn, tOut + 0.25) * Math.PI * 2 : 0;
  const flip = spin ? Math.cos(ang) : 1;
  const cx = W / 2;
  const cy = H / 2;
  if (depth > 0) {
    const dspr = sprite(img, size, { outline: p.logoOutline || 0, outlineColor: depthColor, tint: depthColor });
    const dir = spin ? Math.sin(ang) : 0.7;
    const n = Math.max(2, Math.round(depth / 2));
    for (let i = n; i >= 1; i--) drawSprite(ctx, dspr, cx + dir * (i * depth) / n, cy + (spin ? 0 : (0.7 * i * depth) / n), { scale: s, flip: Math.abs(flip) < 0.05 ? 0.05 : flip });
  }
  ctx.save();
  if (glowColor) glow(ctx, glowColor, glowBlur);
  drawSprite(ctx, spr, cx, cy, { scale: s, flip: Math.abs(flip) < 0.05 ? 0.05 : flip });
  ctx.restore();
}

// ---------- Bentuk alami ----------
export function petalPath(ctx, s) {
  // Kelopak sakura: tetes dengan takik di ujung
  ctx.beginPath();
  ctx.moveTo(0, s * 0.5);
  ctx.bezierCurveTo(s * 0.55, s * 0.3, s * 0.5, -s * 0.35, s * 0.12, -s * 0.5);
  ctx.lineTo(0, -s * 0.36);
  ctx.lineTo(-s * 0.12, -s * 0.5);
  ctx.bezierCurveTo(-s * 0.5, -s * 0.35, -s * 0.55, s * 0.3, 0, s * 0.5);
  ctx.closePath();
}

export function leafPath(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.bezierCurveTo(s * 0.5, -s * 0.3, s * 0.45, s * 0.3, 0, s * 0.5);
  ctx.bezierCurveTo(-s * 0.45, s * 0.3, -s * 0.5, -s * 0.3, 0, -s * 0.55);
  ctx.closePath();
}

export function hexToRgba(hex, a) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shade(hex, amt) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
