// Template motion yang bisa diterapkan ke objek apa pun (gambar, logo, teks, shape, video).
// Template menghasilkan keyframe biasa, relatif terhadap posisi/skala/rotasi/opacity objek
// saat ini, jadi setelah diterapkan semuanya tetap bisa diedit manual.
import { evaluateProp, KF_EPS } from './evaluate.js';
import { bezierOf } from './easing.js';

export const MOTION_GROUPS = [
  { id: 'in', label: 'Masuk', hint: 'Di awal klip — objek muncul menuju posisinya sekarang' },
  { id: 'out', label: 'Keluar', hint: 'Di akhir klip — objek pergi dari posisinya sekarang' },
  { id: 'emph', label: 'Penekanan', hint: 'Di posisi playhead — objek kembali ke keadaan semula' },
  { id: 'loop', label: 'Loop', hint: 'Berulang sepanjang klip — durasi = satu siklus' },
];

const P = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'rotateY', 'opacity'];

// Helper: keyframe [t, v, easeOverride?]
const scaleBoth = (keys) => ({ scaleX: keys.map((k) => [...k]), scaleY: keys.map((k) => [...k]) });

export const MOTIONS = [
  // ---------- MASUK ----------
  { id: 'fadeIn', group: 'in', label: 'Fade In', icon: 'fade', d: 0.6,
    build: ({ d, b }) => ({ opacity: [[0, 0], [d, b.opacity]] }) },
  { id: 'slideInLeft', group: 'in', label: 'Slide dari kiri', icon: 'slide-r', d: 0.8,
    build: ({ d, b, dist }) => ({ x: [[0, b.x - dist], [d, b.x]], opacity: [[0, 0], [d * 0.6, b.opacity]] }) },
  { id: 'slideInRight', group: 'in', label: 'Slide dari kanan', icon: 'slide-l', d: 0.8,
    build: ({ d, b, dist }) => ({ x: [[0, b.x + dist], [d, b.x]], opacity: [[0, 0], [d * 0.6, b.opacity]] }) },
  { id: 'slideInUp', group: 'in', label: 'Slide dari bawah', icon: 'slide-u', d: 0.8,
    build: ({ d, b, dist }) => ({ y: [[0, b.y + dist], [d, b.y]], opacity: [[0, 0], [d * 0.6, b.opacity]] }) },
  { id: 'slideInDown', group: 'in', label: 'Slide dari atas', icon: 'slide-d', d: 0.8,
    build: ({ d, b, dist }) => ({ y: [[0, b.y - dist], [d, b.y]], opacity: [[0, 0], [d * 0.6, b.opacity]] }) },
  { id: 'riseFade', group: 'in', label: 'Rise & Fade', icon: 'slide-u', d: 0.7,
    build: ({ d, b, dist }) => ({ y: [[0, b.y + dist * 0.35], [d, b.y]], opacity: [[0, 0], [d, b.opacity]] }) },
  { id: 'flyInLeft', group: 'in', label: 'Masuk dari luar kiri', icon: 'slide-r', d: 1,
    build: ({ d, b, w }) => ({ x: [[0, -w / 2 - 20], [d, b.x]] }) },
  { id: 'flyInRight', group: 'in', label: 'Masuk dari luar kanan', icon: 'slide-l', d: 1,
    build: ({ d, b, w, W }) => ({ x: [[0, W + w / 2 + 20], [d, b.x]] }) },
  { id: 'zoomIn', group: 'in', label: 'Zoom In', icon: 'zoom', d: 0.7,
    build: ({ d, b }) => ({ ...scaleBoth([[0, b.scaleX * 0.5], [d, b.scaleX]]), opacity: [[0, 0], [d * 0.6, b.opacity]] }) },
  { id: 'zoomDown', group: 'in', label: 'Zoom dari besar', icon: 'zoom', d: 0.7,
    build: ({ d, b }) => ({ ...scaleBoth([[0, b.scaleX * 1.6], [d, b.scaleX]]), opacity: [[0, 0], [d * 0.6, b.opacity]] }) },
  { id: 'popIn', group: 'in', label: 'Pop (overshoot)', icon: 'pop', d: 0.55,
    build: ({ d, b }) => ({ ...scaleBoth([[0, 0, 'overshoot'], [d, b.scaleX]]), opacity: [[0, 0, 'smooth'], [d * 0.3, b.opacity]] }) },
  { id: 'elasticIn', group: 'in', label: 'Elastic', icon: 'pop', d: 1,
    build: ({ d, b }) => ({ ...scaleBoth([[0, 0, 'elastic'], [d, b.scaleX]]), opacity: [[0, 0, 'smooth'], [d * 0.2, b.opacity]] }) },
  { id: 'spinIn', group: 'in', label: 'Spin In', icon: 'spin', d: 0.8,
    build: ({ d, b }) => ({ rotation: [[0, b.rotation - 180], [d, b.rotation]], ...scaleBoth([[0, 0], [d, b.scaleX]]) }) },
  { id: 'dropIn', group: 'in', label: 'Drop (bounce)', icon: 'drop', d: 1,
    build: ({ d, b, H }) => ({ y: [[0, b.y - H * 0.4, 'bounce'], [d, b.y]], opacity: [[0, 0, 'smooth'], [d * 0.2, b.opacity]] }) },
  { id: 'flipIn', group: 'in', label: 'Flip 3D', icon: 'spin', d: 0.8,
    build: ({ d, b }) => ({ rotateY: [[0, b.rotateY - 90], [d, b.rotateY]], opacity: [[0, 0, 'smooth'], [d * 0.3, b.opacity]] }) },
  { id: 'swingIn', group: 'in', label: 'Swing', icon: 'swing', d: 1,
    build: ({ d, b }) => ({
      rotation: [[0, b.rotation + 25], [d * 0.4, b.rotation - 12], [d * 0.7, b.rotation + 5], [d, b.rotation]],
      opacity: [[0, 0], [d * 0.3, b.opacity]],
    }) },

  // ---------- KELUAR ----------
  { id: 'fadeOut', group: 'out', label: 'Fade Out', icon: 'fade', d: 0.6,
    build: ({ d, b }) => ({ opacity: [[0, b.opacity], [d, 0]] }) },
  { id: 'slideOutLeft', group: 'out', label: 'Slide ke kiri', icon: 'slide-l', d: 0.8,
    build: ({ d, b, dist }) => ({ x: [[0, b.x], [d, b.x - dist]], opacity: [[d * 0.4, b.opacity], [d, 0]] }) },
  { id: 'slideOutRight', group: 'out', label: 'Slide ke kanan', icon: 'slide-r', d: 0.8,
    build: ({ d, b, dist }) => ({ x: [[0, b.x], [d, b.x + dist]], opacity: [[d * 0.4, b.opacity], [d, 0]] }) },
  { id: 'slideOutUp', group: 'out', label: 'Slide ke atas', icon: 'slide-u', d: 0.8,
    build: ({ d, b, dist }) => ({ y: [[0, b.y], [d, b.y - dist]], opacity: [[d * 0.4, b.opacity], [d, 0]] }) },
  { id: 'slideOutDown', group: 'out', label: 'Slide ke bawah', icon: 'slide-d', d: 0.8,
    build: ({ d, b, dist }) => ({ y: [[0, b.y], [d, b.y + dist]], opacity: [[d * 0.4, b.opacity], [d, 0]] }) },
  { id: 'sinkFade', group: 'out', label: 'Sink & Fade', icon: 'slide-d', d: 0.7,
    build: ({ d, b, dist }) => ({ y: [[0, b.y], [d, b.y + dist * 0.35]], opacity: [[0, b.opacity], [d, 0]] }) },
  { id: 'flyOutLeft', group: 'out', label: 'Keluar layar kiri', icon: 'slide-l', d: 1,
    build: ({ d, b, w }) => ({ x: [[0, b.x], [d, -w / 2 - 20]] }) },
  { id: 'flyOutRight', group: 'out', label: 'Keluar layar kanan', icon: 'slide-r', d: 1,
    build: ({ d, b, w, W }) => ({ x: [[0, b.x], [d, W + w / 2 + 20]] }) },
  { id: 'zoomOut', group: 'out', label: 'Zoom Out', icon: 'zoom', d: 0.7,
    build: ({ d, b }) => ({ ...scaleBoth([[0, b.scaleX], [d, b.scaleX * 0.5]]), opacity: [[d * 0.3, b.opacity], [d, 0]] }) },
  { id: 'popOut', group: 'out', label: 'Pop Out', icon: 'pop', d: 0.5,
    build: ({ d, b }) => ({ ...scaleBoth([[0, b.scaleX, 'smooth'], [d * 0.35, b.scaleX * 1.12, 'smoothIn'], [d, 0]]), opacity: [[d * 0.6, b.opacity], [d, 0]] }) },
  { id: 'flipOut', group: 'out', label: 'Flip 3D', icon: 'spin', d: 0.8,
    build: ({ d, b }) => ({ rotateY: [[0, b.rotateY], [d, b.rotateY + 90]], opacity: [[d * 0.7, b.opacity], [d, 0]] }) },
  { id: 'spinOut', group: 'out', label: 'Spin Out', icon: 'spin', d: 0.8,
    build: ({ d, b }) => ({ rotation: [[0, b.rotation], [d, b.rotation + 180]], ...scaleBoth([[0, b.scaleX], [d, 0]]) }) },

  // ---------- PENEKANAN ----------
  { id: 'pulse', group: 'emph', label: 'Pulse', icon: 'pop', d: 0.6,
    build: ({ d, b, k }) => scaleBoth([[0, b.scaleX], [d / 2, b.scaleX * (1 + 0.15 * k)], [d, b.scaleX]]) },
  { id: 'heartbeat', group: 'emph', label: 'Heartbeat', icon: 'pop', d: 1,
    build: ({ d, b, k }) => scaleBoth([[0, b.scaleX], [d * 0.15, b.scaleX * (1 + 0.2 * k)], [d * 0.3, b.scaleX], [d * 0.45, b.scaleX * (1 + 0.12 * k)], [d * 0.65, b.scaleX]]) },
  { id: 'shake', group: 'emph', label: 'Shake', icon: 'shake', d: 0.6,
    build: ({ d, b, k }) => ({ x: [0, -12, 12, -10, 8, -5, 3, 0].map((o, i, a) => [(d * i) / (a.length - 1), b.x + o * k, 'sineInOut']) }) },
  { id: 'wobble', group: 'emph', label: 'Wobble', icon: 'swing', d: 0.9,
    build: ({ d, b, k }) => ({ rotation: [0, -12, 10, -7, 5, -2, 0].map((o, i, a) => [(d * i) / (a.length - 1), b.rotation + o * k, 'sineInOut']) }) },
  { id: 'jump', group: 'emph', label: 'Jump', icon: 'drop', d: 0.8,
    build: ({ d, b, dist, k }) => ({ y: [[0, b.y, 'smoothOut'], [d * 0.4, b.y - dist * 0.4 * k, 'bounce'], [d, b.y]] }) },
  { id: 'rubberBand', group: 'emph', label: 'Rubber Band', icon: 'zoom', d: 0.9,
    build: ({ d, b, k }) => {
      const f = (m) => 1 + (m - 1) * k;
      const sx = [1, 1.25, 0.75, 1.15, 0.95, 1.05, 1];
      const sy = [1, 0.75, 1.25, 0.85, 1.05, 0.95, 1];
      const ts = [0, 0.3, 0.4, 0.5, 0.65, 0.75, 1];
      return {
        scaleX: ts.map((t, i) => [d * t, b.scaleX * f(sx[i]), 'sineInOut']),
        scaleY: ts.map((t, i) => [d * t, b.scaleY * f(sy[i]), 'sineInOut']),
      };
    } },
  { id: 'flip360', group: 'emph', label: 'Flip 360°', icon: 'spin', d: 1,
    build: ({ d, b }) => ({ rotateY: [[0, b.rotateY], [d, b.rotateY + 360]] }) },
  { id: 'flash', group: 'emph', label: 'Flash', icon: 'fade', d: 0.8,
    build: ({ d, b }) => ({ opacity: [b.opacity, 0, b.opacity, 0, b.opacity].map((v, i) => [(d * i) / 4, v, 'sineInOut']) }) },
  { id: 'tada', group: 'emph', label: 'Tada', icon: 'swing', d: 1,
    build: ({ d, b, k }) => ({
      ...scaleBoth([[0, b.scaleX], [d * 0.1, b.scaleX * (1 - 0.1 * k)], [d * 0.3, b.scaleX * (1 + 0.1 * k)], [d * 0.9, b.scaleX * (1 + 0.1 * k)], [d, b.scaleX]]),
      rotation: [0, -3, 3, -3, 3, -3, 3, 0].map((o, i, a) => [(d * i) / (a.length - 1), b.rotation + o * k, 'sineInOut']),
    }) },

  // ---------- LOOP ----------
  { id: 'float', group: 'loop', label: 'Float (melayang)', icon: 'float', d: 2,
    loop: ({ d, b, k }, n) => ({ y: [b.y, b.y - 14 * k].map((v, i) => [(d / 2) * i, v]) }), half: true },
  { id: 'breathe', group: 'loop', label: 'Breathe', icon: 'pop', d: 2,
    loop: ({ d, b, k }) => scaleBoth([b.scaleX, b.scaleX * (1 + 0.06 * k)].map((v, i) => [(d / 2) * i, v])), half: true },
  { id: 'pendulum', group: 'loop', label: 'Pendulum', icon: 'swing', d: 2,
    loop: ({ d, b, k }) => ({ rotation: [b.rotation - 10 * k, b.rotation + 10 * k].map((v, i) => [(d / 2) * i, v]) }), half: true },
  { id: 'blink', group: 'loop', label: 'Blink lembut', icon: 'fade', d: 1.6,
    loop: ({ d, b }) => ({ opacity: [b.opacity, b.opacity * 0.35].map((v, i) => [(d / 2) * i, v]) }), half: true },
  { id: 'spinLoop', group: 'loop', label: 'Putar terus', icon: 'spin', d: 3, linear: true },
  { id: 'coinLoop', group: 'loop', label: 'Koin berputar (3D)', icon: 'spin', d: 2, linear: true },
];

/**
 * Terapkan template ke clip (mutasi draft).
 * opts: { duration, ease, bez, intensity, at (waktu lokal untuk Penekanan) }
 * size: ukuran natural objek {w,h}; settings: project.settings
 */
export function applyMotion(clip, motion, opts, size, settings) {
  const D = clip.duration;
  const d = Math.max(0.05, Math.min(opts.duration ?? motion.d, D));
  const k = opts.intensity ?? 1;
  const W = settings.width;
  const H = settings.height;
  let w0;
  let w1;
  if (motion.group === 'in') [w0, w1] = [0, d];
  else if (motion.group === 'out') [w0, w1] = [D - d, D];
  else if (motion.group === 'emph') {
    w0 = Math.max(0, Math.min(opts.at ?? 0, D - d));
    w1 = w0 + d;
  } else [w0, w1] = [0, D];

  // Nilai "istirahat" objek: akhir jendela (masuk) atau awal jendela (lainnya)
  const sampleT = motion.group === 'in' ? w1 : w0;
  const b = Object.fromEntries(P.map((p) => [p, evaluateProp(clip, p, sampleT)]));
  const ctx = {
    d, D, b, k, W, H,
    w: size.w * Math.abs(b.scaleX),
    h: size.h * Math.abs(b.scaleY),
    dist: Math.max(W, H) * 0.12 * k,
  };

  let tracks;
  if (motion.id === 'spinLoop' || motion.id === 'coinLoop') {
    const prop = motion.id === 'spinLoop' ? 'rotation' : 'rotateY';
    const keys = [];
    for (let i = 0; i * d <= D + 1e-6; i++) keys.push([i * d, b[prop] + 360 * i, 'linear']);
    if (keys[keys.length - 1][0] < D) keys.push([D, b[prop] + (360 * D) / d, 'linear']);
    tracks = { [prop]: keys };
  } else if (motion.group === 'loop') {
    // Ulangi pola dua titik (A, B) setiap setengah siklus sampai akhir klip
    const pattern = motion.loop(ctx);
    tracks = {};
    for (const [prop, pts] of Object.entries(pattern)) {
      const keys = [];
      const half = d / 2;
      for (let i = 0; i * half <= D + 1e-6; i++) keys.push([i * half, pts[i % 2][1]]);
      tracks[prop] = keys;
    }
  } else {
    tracks = motion.build(ctx);
  }

  const curveBez = opts.ease === 'bezier' ? opts.bez : null;
  if (!clip.keyframes) clip.keyframes = {};
  for (const [prop, keys] of Object.entries(tracks)) {
    // Simpan nilai di luar jendela agar animasi lain tetap utuh
    const existing = (clip.keyframes[prop] || []).filter((kf) => kf.t < w0 - KF_EPS || kf.t > w1 + KF_EPS);
    if (!clip.keyframes[prop] || clip.keyframes[prop].length === 0) clip.transform[prop] = b[prop];
    const added = keys.map(([t, v, e]) => {
      const kf = { t: +(w0 + t).toFixed(4), v: +v.toFixed(4), ease: e || opts.ease || 'smooth' };
      if (!e && curveBez) kf.bez = curveBez;
      return kf;
    });
    clip.keyframes[prop] = [...existing, ...added].sort((a, c) => a.t - c.t);
  }
  return { window: [w0, w1], props: Object.keys(tracks) };
}

/** Hapus semua keyframe; nilai pada playhead jadi nilai statis. */
export function clearMotion(clip, atLocal) {
  for (const p of Object.keys(clip.keyframes || {})) clip.transform[p] = evaluateProp(clip, p, atLocal);
  clip.keyframes = {};
  delete clip.preset;
}

export function curvePreviewOf(name, bez) {
  return bezierOf(name, bez);
}
