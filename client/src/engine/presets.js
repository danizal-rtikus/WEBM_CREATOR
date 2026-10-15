// Preset posisi & animasi logo. Preset menghasilkan keyframe biasa,
// jadi setelah diterapkan semuanya tetap bisa diedit manual.
import { round } from './project.js';

export const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

export const ANIM_IN = {
  none: 'Tanpa animasi',
  fade: 'Fade',
  'slide-left': 'Slide dari kiri',
  'slide-right': 'Slide dari kanan',
  'slide-up': 'Slide dari bawah',
  'slide-down': 'Slide dari atas',
  pop: 'Pop / scale',
  spin: 'Spin-in',
  drop: 'Drop (bounce)',
};

export const ANIM_OUT = {
  none: 'Tanpa animasi',
  fade: 'Fade',
  'slide-left': 'Slide ke kiri',
  'slide-right': 'Slide ke kanan',
  'slide-up': 'Slide ke atas',
  'slide-down': 'Slide ke bawah',
  pop: 'Pop / scale',
  spin: 'Spin-out',
};

export function defaultLogoPreset() {
  return {
    position: 'bottom-right',
    margin: 48,
    sizePct: 14,
    animIn: 'pop',
    animOut: 'fade',
    animDuration: 0.6,
    watermark: false,
    watermarkOpacity: 0.6,
  };
}

/** Hitung posisi (x,y) anchor tengah untuk preset 9 titik. */
export function presetXY(position, margin, sw, sh, W, H) {
  const [row, col] = (() => {
    const map = {
      'top-left': [0, 0], 'top-center': [0, 1], 'top-right': [0, 2],
      'middle-left': [1, 0], center: [1, 1], 'middle-right': [1, 2],
      'bottom-left': [2, 0], 'bottom-center': [2, 1], 'bottom-right': [2, 2],
    };
    return map[position] || [1, 1];
  })();
  const x = col === 0 ? margin + sw / 2 : col === 1 ? W / 2 : W - margin - sw / 2;
  const y = row === 0 ? margin + sh / 2 : row === 1 ? H / 2 : H - margin - sh / 2;
  return { x, y };
}

function kf(t, v, e = 'easeOut') {
  return { t: round(t, 4), v: round(v, 4), ease: e };
}

/**
 * Terapkan preset ke clip (mutasi). size = ukuran natural {w,h}.
 * settings = project.settings
 */
export function applyLogoPreset(clip, preset, size, settings) {
  const W = settings.width;
  const H = settings.height;
  if (preset.watermark) {
    clip.start = 0;
    clip.duration = settings.duration;
  }
  const s = (preset.sizePct / 100) * W / size.w;
  const sw = size.w * s;
  const sh = size.h * s;
  const { x, y } = presetXY(preset.position, preset.margin, sw, sh, W, H);
  const targetOpacity = preset.watermark ? preset.watermarkOpacity : 1;

  clip.transform = { ...clip.transform, x, y, scaleX: s, scaleY: s, rotation: 0, opacity: targetOpacity, anchorX: 0.5, anchorY: 0.5 };
  clip.keyframes = {};
  clip.preset = { ...preset };

  const D = clip.duration;
  const d = Math.min(preset.animDuration, D / 2 - 0.01);
  if (d <= 0) return clip;
  const dx = W * 0.18;
  const dy = H * 0.18;
  const tracks = {};
  const add = (prop, k) => (tracks[prop] = tracks[prop] || []).push(k);

  // Animasi masuk: dari "keadaan awal" ke nilai akhir dalam [0, d]
  switch (preset.animIn) {
    case 'fade':
      add('opacity', kf(0, 0)); add('opacity', kf(d, targetOpacity));
      break;
    case 'slide-left':
    case 'slide-right':
      add('x', kf(0, x + (preset.animIn === 'slide-left' ? -dx : dx), 'easeOut')); add('x', kf(d, x));
      add('opacity', kf(0, 0)); add('opacity', kf(d, targetOpacity));
      break;
    case 'slide-up':
    case 'slide-down':
      add('y', kf(0, y + (preset.animIn === 'slide-up' ? dy : -dy), 'easeOut')); add('y', kf(d, y));
      add('opacity', kf(0, 0)); add('opacity', kf(d, targetOpacity));
      break;
    case 'pop':
      add('scaleX', kf(0, s * 0.3, 'back')); add('scaleX', kf(d, s));
      add('scaleY', kf(0, s * 0.3, 'back')); add('scaleY', kf(d, s));
      add('opacity', kf(0, 0)); add('opacity', kf(d * 0.5, targetOpacity));
      break;
    case 'spin':
      add('rotation', kf(0, -180, 'easeOut')); add('rotation', kf(d, 0));
      add('scaleX', kf(0, 0, 'easeOut')); add('scaleX', kf(d, s));
      add('scaleY', kf(0, 0, 'easeOut')); add('scaleY', kf(d, s));
      break;
    case 'drop':
      add('y', kf(0, y - H * 0.35, 'bounce')); add('y', kf(d * 1.4 > D / 2 ? d : d * 1.4, y));
      add('opacity', kf(0, 0)); add('opacity', kf(d * 0.3, targetOpacity));
      break;
    default:
      break;
  }

  // Animasi keluar: dari nilai akhir ke keadaan akhir dalam [D-d, D]
  const a = D - d;
  const hold = (prop, v) => {
    const arr = tracks[prop] || [];
    const lastT = arr.length ? arr[arr.length - 1].t : -1;
    if (lastT < a - 0.001) add(prop, kf(a, v, 'easeIn'));
    else arr[arr.length - 1].ease = 'easeIn';
  };
  switch (preset.animOut) {
    case 'fade':
      hold('opacity', targetOpacity); add('opacity', kf(D, 0));
      break;
    case 'slide-left':
    case 'slide-right':
      hold('x', x); add('x', kf(D, x + (preset.animOut === 'slide-left' ? -dx : dx)));
      hold('opacity', targetOpacity); add('opacity', kf(D, 0));
      break;
    case 'slide-up':
    case 'slide-down':
      hold('y', y); add('y', kf(D, y + (preset.animOut === 'slide-up' ? -dy : dy)));
      hold('opacity', targetOpacity); add('opacity', kf(D, 0));
      break;
    case 'pop':
      hold('scaleX', s); add('scaleX', kf(D, 0));
      hold('scaleY', s); add('scaleY', kf(D, 0));
      break;
    case 'spin':
      hold('rotation', 0); add('rotation', kf(D, 180));
      hold('scaleX', s); add('scaleX', kf(D, 0));
      hold('scaleY', s); add('scaleY', kf(D, 0));
      break;
    default:
      break;
  }
  for (const p of Object.keys(tracks)) {
    const arr = tracks[p].sort((m, n) => m.t - n.t);
    // Ease pada keyframe terakhir animasi masuk = 'linear' (hold), supaya tengah klip diam
    clip.keyframes[p] = arr;
  }
  return clip;
}
