// Easing: fungsi klasik + kurva cubic-bezier (seperti CSS / After Effects).
// Dipakai bersama oleh pratinjau editor dan halaman render agar hasil identik.

const c1 = 1.70158;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;

function bounceOut(x) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

// ---------- Cubic bezier ----------
// Implementasi standar (Newton-Raphson + bisection), sama seperti cubic-bezier() di CSS.
const bezCache = new Map();

export function cubicBezier(x1, y1, x2, y2) {
  const key = `${x1},${y1},${x2},${y2}`;
  if (bezCache.has(key)) return bezCache.get(key);
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solveT = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  const fn = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solveT(x)));
  bezCache.set(key, fn);
  return fn;
}

/** Kurva bezier siap pakai — urutan = urutan di menu. */
export const BEZIER_PRESETS = {
  smooth: { label: 'Smooth (rekomendasi)', bez: [0.4, 0, 0.2, 1] },
  easyEase: { label: 'Easy Ease (ala After Effects)', bez: [0.33, 0, 0.67, 1] },
  silk: { label: 'Silk — sangat halus', bez: [0.83, 0, 0.17, 1] },
  sineInOut: { label: 'Sine In-Out — lembut', bez: [0.37, 0, 0.63, 1] },
  smoothOut: { label: 'Expo Out — cepat lalu melambat', bez: [0.16, 1, 0.3, 1] },
  smoothIn: { label: 'Expo In — pelan lalu cepat', bez: [0.7, 0, 0.84, 0] },
  decelerate: { label: 'Decelerate (masuk layar)', bez: [0, 0, 0.2, 1] },
  accelerate: { label: 'Accelerate (keluar layar)', bez: [0.4, 0, 1, 1] },
  overshoot: { label: 'Overshoot — lewat sedikit', bez: [0.34, 1.56, 0.64, 1] },
  anticipate: { label: 'Anticipate — ancang-ancang', bez: [0.36, 0, 0.66, -0.56] },
  backInOut: { label: 'Back In-Out', bez: [0.68, -0.6, 0.32, 1.6] },
};

export const EASINGS = {
  linear: (x) => x,
  easeIn: (x) => x * x * x,
  easeOut: (x) => 1 - Math.pow(1 - x, 3),
  easeInOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: (x) => 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2),
  elastic: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1,
  bounce: bounceOut,
  hold: () => 0,
};

export const CLASSIC_LABELS = {
  linear: 'Linear',
  easeIn: 'Ease In (cubic)',
  easeOut: 'Ease Out (cubic)',
  easeInOut: 'Ease In-Out (cubic)',
  back: 'Back (overshoot)',
  elastic: 'Elastic',
  bounce: 'Bounce',
  hold: 'Hold (lompat)',
};

// Kompatibilitas: semua label dalam satu objek
export const EASING_LABELS = {
  ...Object.fromEntries(Object.entries(BEZIER_PRESETS).map(([k, v]) => [k, v.label])),
  ...CLASSIC_LABELS,
  bezier: 'Kurva kustom',
};

export const DEFAULT_EASE = 'smooth';

/** Kurva bezier untuk sebuah easing (null jika bukan kurva bezier). */
export function bezierOf(name, bez) {
  if (name === 'bezier' && Array.isArray(bez)) return bez;
  if (BEZIER_PRESETS[name]) return BEZIER_PRESETS[name].bez;
  return null;
}

/** Nilai easing 0..1 (bisa sedikit di luar 0..1 untuk overshoot). */
export function ease(name, x, bez) {
  const t = Math.min(1, Math.max(0, x));
  const b = bezierOf(name, bez);
  if (b) return cubicBezier(b[0], b[1], b[2], b[3])(t);
  const fn = EASINGS[name] || EASINGS.linear;
  return fn(t);
}
