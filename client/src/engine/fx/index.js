// Registri efek prosedural (layer FX) + penggambar untuk compositor.
import particles from './particles.js';
import panels from './panels.js';
import shapes from './shapes.js';
import nature from './nature.js';
import type from './type.js';
import cards from './cards.js';
import { defaultsOf } from './schema.js';

export const FX_LIST = [...cards, ...particles, ...panels, ...shapes, ...nature, ...type];
export const FX = Object.fromEntries(FX_LIST.map((f) => [f.id, f]));
export const FX_CATEGORIES = [...new Set(FX_LIST.map((f) => f.category))];

export function fxDefaults(id) {
  return defaultsOf(FX[id].params);
}

/** Titik potong lokal klip (detik sejak awal klip). */
export function fxCut(clip, project) {
  const D = clip.duration;
  const def = FX[clip.fx.kind];
  const ratio = def ? def.cut / def.duration : 0.5;
  const cp = project.settings.cutPoint;
  let c = cp != null ? cp - clip.start : D * ratio;
  if (!(c > 0.1 && c < D - 0.1)) c = D * ratio;
  return c;
}

/** Semua assetId gambar yang dipakai parameter FX (untuk dimuat lebih dulu). */
export function fxAssets(clip) {
  const def = FX[clip.fx && clip.fx.kind];
  if (!def) return [];
  return Object.entries(def.params)
    .filter(([, s]) => s.type === 'asset')
    .map(([k]) => clip.fx.params[k])
    .filter(Boolean);
}

export function fxFonts(clip) {
  const def = FX[clip.fx && clip.fx.kind];
  if (!def) return [];
  return Object.entries(def.params)
    .filter(([, s]) => s.type === 'font')
    .map(([k]) => clip.fx.params[k])
    .filter(Boolean);
}

export function drawFx(ctx, clip, project, t, media) {
  const def = FX[clip.fx && clip.fx.kind];
  if (!def) return;
  const p = { ...defaultsOf(def.params), ...(clip.fx.params || {}) };
  const env = {
    t: t - clip.start,
    D: clip.duration,
    c: fxCut(clip, project),
    W: project.settings.width,
    H: project.settings.height,
    fps: project.settings.fps,
    image: (id) => (id ? media.image(id) : null),
  };
  ctx.save();
  try {
    def.draw(ctx, env, p);
  } catch (e) {
    if (!drawFx.warned) {
      console.error('[fx]', def.id, e);
      drawFx.warned = true;
    }
  }
  ctx.restore();
}
