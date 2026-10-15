// C. Bentuk flat — terinspirasi Flat Logo Transition (circle reveal).
import { prog, lerp, ease, glow, heroLogo, linearGrad } from './util.js';
import { num, color, sel, logo } from './schema.js';

const hero = {
  logo: logo(),
  logoSize: num('Ukuran logo', 26, 5, 80, 1, '%'),
  logoOutline: num('Outline logo', 0, 0, 30, 1, 'px'),
  logoOutlineColor: color('Warna outline logo', '#ffffff'),
};

const ORIGINS = { center: 'Tengah', left: 'Kiri', right: 'Kanan', bottom: 'Bawah', top: 'Atas' };
function originPt(o, W, H) {
  return { center: [W / 2, H / 2], left: [0, H / 2], right: [W, H / 2], bottom: [W / 2, H], top: [W / 2, 0] }[o] || [W / 2, H / 2];
}
function farthest(x, y, W, H) {
  return Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) + 20;
}

// ---------- Circle Reveal ----------
const circleReveal = {
  id: 'circleReveal', category: 'Bentuk flat', label: 'Circle Reveal', duration: 2.0, cut: 0.9,
  desc: 'Lingkaran mengembang menutup layar dengan cincin, lalu berlubang membuka scene baru.',
  sfx: { in: 'whoosh', out: 'pop' },
  params: { ...hero, c1: color('Lingkaran utama', '#ff4fd8'), c2: color('Lingkaran dalam', '#ff2fb0'), ring: color('Cincin', '#ffffff'), origin: sel('Titik asal', 'center', ORIGINS) },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const [ox, oy] = originPt(p.origin, W, H);
    const R = farthest(ox, oy, W, H);
    const r1 = R * ease('smoothOut', prog(t, 0.04 * c, 0.7 * c));
    const r2 = R * 0.62 * ease('smoothOut', prog(t, 0.18 * c, 0.85 * c));
    const hole = R * ease('smoothIn', prog(t, c + 0.3 * (D - c), D - 0.03));
    if (r1 <= 0 || hole >= R) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, hole + 0.01, 0, Math.PI * 2);
    ctx.rect(-50, -50, W + 100, H + 100);
    ctx.clip('evenodd');
    ctx.fillStyle = p.c1;
    ctx.beginPath();
    ctx.arc(ox, oy, r1, 0, Math.PI * 2);
    ctx.fill();
    if (r2 > 0) {
      ctx.fillStyle = p.c2;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Cincin mengembang
    [0.2, 0.42].forEach((d0, k) => {
      const q = prog(t, d0 * c + 0.1, d0 * c + 0.1 + 0.75 * c);
      if (q <= 0 || q >= 1) return;
      ctx.strokeStyle = p.ring;
      ctx.globalAlpha = 1 - q;
      ctx.lineWidth = lerp(22, 6, q) - k * 4;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, R * 0.15 + R * 0.75 * ease('smoothOut', q), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    heroLogo(ctx, env, p, { tIn: 0.3 * c, tOut: c + 0.15 * (D - c) });
    ctx.restore();
    if (hole > 0) {
      ctx.save();
      ctx.strokeStyle = p.ring;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, hole, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },
};

// ---------- Shape Burst ----------
const SHAPES = { circle: 'Lingkaran', square: 'Persegi', diamond: 'Belah ketupat', triangle: 'Segitiga', hexagon: 'Heksagon' };
function shapePath(ctx, kind, x, y, r, rot) {
  ctx.moveTo(x + r, y);
  if (kind === 'circle') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
    return;
  }
  const n = { square: 4, diamond: 4, triangle: 3, hexagon: 6 }[kind] || 4;
  const off = (kind === 'square' ? Math.PI / 4 : kind === 'triangle' ? -Math.PI / 2 : 0) + rot;
  const k = kind === 'triangle' ? 2 : kind === 'square' ? 1.42 : 1.16;
  for (let i = 0; i <= n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

const shapeBurst = {
  id: 'shapeBurst', category: 'Bentuk flat', label: 'Shape Burst', duration: 1.6, cut: 0.75,
  desc: 'Bentuk berwarna berlapis mengembang bergantian, lalu berlubang bergantian.',
  sfx: { in: 'whoosh', out: 'pop' },
  params: { ...hero, shape: sel('Bentuk', 'diamond', SHAPES), c1: color('Warna 1', '#ffd23f'), c2: color('Warna 2', '#ff3d7f'), c3: color('Warna 3', '#7c3aed'), c4: color('Warna 4', '#0f172a'), spin: num('Putaran bentuk', 45, -180, 180, 5, '°') },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const R = Math.hypot(W, H) / 2 + 40;
    const cols = [p.c1, p.c2, p.c3, p.c4];
    const n = cols.length;
    cols.forEach((col, k) => {
      const a = k * 0.13 * c;
      const r = R * ease('smoothOut', prog(t, a, a + 0.5 * c));
      const b = c + 0.08 * (D - c) + (n - 1 - k) * 0.1 * (D - c);
      const h = R * 1.05 * ease('smoothIn', prog(t, b, b + 0.5 * (D - c)));
      if (r <= h) return;
      const rot = ((p.spin * Math.PI) / 180) * (prog(t, 0, D) - 0.5);
      ctx.beginPath();
      shapePath(ctx, p.shape, W / 2, H / 2, r, rot);
      if (h > 0) shapePath(ctx, p.shape, W / 2, H / 2, h, rot);
      ctx.fillStyle = col;
      ctx.fill('evenodd');
    });
    heroLogo(ctx, env, p, { tIn: 0.55 * c, tOut: c + 0.1 * (D - c) });
  },
};

// ---------- Stripe Wipe ----------
const stripeWipe = {
  id: 'stripeWipe', category: 'Bentuk flat', label: 'Stripe Wipe', duration: 1.4, cut: 0.65,
  desc: 'Garis-garis warna menyapu berurutan seperti tirai.',
  sfx: { in: 'swoosh', out: 'swoosh' },
  params: { ...hero, count: num('Jumlah garis', 7, 2, 20, 1), angle: num('Sudut', 20, -80, 80, 1, '°'), c1: color('Warna 1', '#0ea5e9'), c2: color('Warna 2', '#22d3ee'), c3: color('Warna 3', '#0f172a') },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const L = Math.hypot(W, H) + 100;
    const n = p.count;
    const bw = L / n;
    const cols = [p.c1, p.c2, p.c3];
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((p.angle * Math.PI) / 180);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 0.4 * c;
      const lead = lerp(-L / 2, L / 2, ease('smooth', prog(t, a, a + 0.55 * c)));
      const b = c + 0.05 * (D - c) + (k / n) * 0.35 * (D - c);
      const trail = lerp(-L / 2, L / 2, ease('smooth', prog(t, b, b + 0.55 * (D - c))));
      if (lead <= trail) continue;
      ctx.fillStyle = cols[k % cols.length];
      ctx.fillRect(-L / 2 + k * bw - 1, trail - 2, bw + 2, lead - trail + 4);
    }
    ctx.restore();
    heroLogo(ctx, env, p, { tIn: 0.55 * c, tOut: c + 0.08 * (D - c) });
  },
};

// ---------- Liquid Blob ----------
function blobPath(ctx, x, y, r, t, phase) {
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const k = 1 + 0.07 * Math.sin(3 * a + t * 4 + phase) + 0.05 * Math.sin(5 * a - t * 6 + phase * 2) + 0.03 * Math.sin(8 * a + t * 9);
    const px = x + Math.cos(a) * r * k;
    const py = y + Math.sin(a) * r * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

const liquidBlob = {
  id: 'liquidBlob', category: 'Bentuk flat', label: 'Liquid Blob', duration: 1.8, cut: 0.85,
  desc: 'Gumpalan cair membesar menutupi layar, lalu berlubang cair.',
  sfx: { in: 'whoosh', out: 'pop' },
  params: { ...hero, c1: color('Warna utama', '#22c55e'), c2: color('Warna kedua', '#a3e635'), origin: sel('Titik asal', 'bottom', ORIGINS) },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const [ox, oy] = originPt(p.origin, W, H);
    const R = farthest(ox, oy, W, H) * 1.18;
    const back = R * ease('smoothOut', prog(t, 0, 0.62 * c));
    const front = R * ease('smoothOut', prog(t, 0.12 * c, 0.8 * c));
    const hole = R * 0.95 * ease('smoothIn', prog(t, c + 0.2 * (D - c), D - 0.03));
    ctx.save();
    if (back > 0) {
      ctx.beginPath();
      blobPath(ctx, ox, oy, back, t, 1);
      if (hole > 0) blobPath(ctx, W / 2, H / 2, hole * 1.06, t, 2);
      ctx.fillStyle = p.c2;
      ctx.fill('evenodd');
    }
    if (front > 0) {
      ctx.beginPath();
      blobPath(ctx, ox, oy, front, t, 0);
      if (hole > 0) blobPath(ctx, W / 2, H / 2, hole, t, 3);
      ctx.fillStyle = linearGrad(ctx, W, H, 60, [p.c1, p.c2]);
      ctx.fill('evenodd');
    }
    ctx.restore();
    heroLogo(ctx, env, p, { tIn: 0.5 * c, tOut: c + 0.1 * (D - c) });
  },
};

export default [circleReveal, shapeBurst, stripeWipe, liquidBlob];
