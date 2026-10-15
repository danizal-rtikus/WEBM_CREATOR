// Interpolasi keyframe — satu sumber kebenaran untuk pratinjau dan render.
import { ease, DEFAULT_EASE } from './easing.js';
import { ANIMATABLE, PROP_DEFAULTS } from './project.js';

export const KF_EPS = 1 / 120; // toleransi waktu (detik) untuk menganggap dua keyframe "sama"

/** Nilai satu properti pada waktu lokal klip (detik sejak awal klip). */
export function evaluateProp(clip, prop, t) {
  const kfs = clip.keyframes && clip.keyframes[prop];
  if (!kfs || kfs.length === 0) return clip.transform[prop] ?? PROP_DEFAULTS[prop];
  if (t <= kfs[0].t) return kfs[0].v;
  const last = kfs[kfs.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      if (span <= 0) return b.v;
      const p = ease(a.ease || 'linear', (t - a.t) / span, a.bez);
      return a.v + (b.v - a.v) * p;
    }
  }
  return last.v;
}

/** Semua properti transform pada waktu lokal t. */
export function evaluate(clip, t) {
  const out = { ...clip.transform };
  for (const p of ANIMATABLE) out[p] = evaluateProp(clip, p, t);
  return out;
}

export function isAnimated(clip, prop) {
  return !!(clip.keyframes && clip.keyframes[prop] && clip.keyframes[prop].length);
}

export function keyframeIndexAt(clip, prop, t) {
  const kfs = (clip.keyframes && clip.keyframes[prop]) || [];
  return kfs.findIndex((k) => Math.abs(k.t - t) < KF_EPS);
}

/** Tambah / timpa keyframe (mutasi langsung pada clip draft). */
export function upsertKeyframe(clip, prop, t, v, easeName, bez) {
  if (!clip.keyframes) clip.keyframes = {};
  const kfs = clip.keyframes[prop] || (clip.keyframes[prop] = []);
  const i = kfs.findIndex((k) => Math.abs(k.t - t) < KF_EPS);
  if (i >= 0) {
    kfs[i].v = v;
    if (easeName) {
      kfs[i].ease = easeName;
      if (bez) kfs[i].bez = bez;
      else delete kfs[i].bez;
    }
  } else {
    const k = { t: Math.max(0, t), v, ease: easeName || DEFAULT_EASE };
    if (bez) k.bez = bez;
    kfs.push(k);
    kfs.sort((a, b) => a.t - b.t);
  }
}

export function removeKeyframe(clip, prop, t) {
  const kfs = clip.keyframes && clip.keyframes[prop];
  if (!kfs) return;
  const i = kfs.findIndex((k) => Math.abs(k.t - t) < KF_EPS);
  if (i >= 0) kfs.splice(i, 1);
  if (kfs.length === 0) delete clip.keyframes[prop];
}

/**
 * Set nilai properti dari UI: jika properti beranimasi, buat/timpa keyframe pada waktu t;
 * jika tidak, ubah nilai statis.
 */
export function setPropValue(clip, prop, t, v) {
  if (isAnimated(clip, prop)) upsertKeyframe(clip, prop, t, v);
  else clip.transform[prop] = v;
}

/** Nyalakan / matikan animasi (stopwatch) untuk satu properti. */
export function toggleAnimation(clip, prop, t) {
  if (isAnimated(clip, prop)) {
    clip.transform[prop] = evaluateProp(clip, prop, t);
    delete clip.keyframes[prop];
  } else {
    upsertKeyframe(clip, prop, t, evaluateProp(clip, prop, t));
  }
}

/** Geser semua keyframe (dipakai saat trim kiri agar animasi tetap di waktu absolut yang sama). */
export function shiftKeyframes(clip, dt) {
  if (!clip.keyframes) return;
  for (const p of Object.keys(clip.keyframes)) {
    clip.keyframes[p] = clip.keyframes[p].map((k) => ({ ...k, t: k.t + dt }));
  }
}

/** Potong klip pada waktu lokal s; mengembalikan klip kanan (klip kiri dimutasi). */
export function splitClipAt(left, s, newId) {
  const right = JSON.parse(JSON.stringify(left));
  right.id = newId;
  right.start = left.start + s;
  right.duration = left.duration - s;
  right.inPoint = (left.inPoint || 0) + s;
  right.keyframes = {};
  const leftKfs = {};
  for (const p of Object.keys(left.keyframes || {})) {
    const atSplit = evaluateProp(left, p, s);
    const kfs = left.keyframes[p];
    const l = kfs.filter((k) => k.t < s - KF_EPS);
    l.push({ t: s, v: atSplit, ease: 'linear' });
    const r = kfs.filter((k) => k.t > s + KF_EPS).map((k) => ({ ...k, t: k.t - s }));
    const easeAtSplit = (kfs.filter((k) => k.t <= s).pop() || kfs[0]).ease;
    r.unshift({ t: 0, v: atSplit, ease: easeAtSplit || 'linear' });
    leftKfs[p] = l;
    right.keyframes[p] = r;
  }
  left.keyframes = leftKfs;
  left.duration = s;
  return right;
}
