// B. Wipe panel + hero logo — terinspirasi Logo Rotation & 3D Logo.
import { rnd, rndSigned, prog, lerp, ease, panelFill, jaggedEdge, glow, noGlow, heroLogo, hexToRgba } from './util.js';
import { num, color, sel, logo, seed } from './schema.js';

const hero = {
  logo: logo(),
  logoSize: num('Ukuran logo', 26, 5, 80, 1, '%'),
  logoOutline: num('Outline logo', 6, 0, 30, 1, 'px'),
  logoOutlineColor: color('Warna outline logo', '#000000'),
};

function neonStroke(ctx, pts, ox, colorHex, width = 10) {
  const path = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(ox + x, y) : ctx.moveTo(ox + x, y)));
  };
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  glow(ctx, colorHex, 40);
  ctx.strokeStyle = hexToRgba(colorHex, 0.9);
  ctx.lineWidth = width * 2.2;
  path();
  ctx.stroke();
  glow(ctx, colorHex, 16);
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = width;
  path();
  ctx.stroke();
  noGlow(ctx);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = width * 0.35;
  path();
  ctx.stroke();
  ctx.restore();
}

/** Region panel wipe dengan tepi bergerigi: masuk (tepi depan) lalu keluar (tepi belakang). */
function wipeRegion(env, pts, xIn, xOut) {
  const { W, H } = env;
  const path = new Path2D();
  const leftEdge = xOut == null ? null : xOut;
  const rightEdge = xIn;
  if (leftEdge == null) path.moveTo(-60, -60);
  else {
    path.moveTo(leftEdge + pts[0][0], -60);
    pts.forEach(([x, y]) => path.lineTo(leftEdge + x, y));
    path.lineTo(leftEdge + pts[pts.length - 1][0], H + 60);
  }
  if (leftEdge == null) path.lineTo(-60, H + 60);
  if (rightEdge == null) {
    path.lineTo(W + 60, H + 60);
    path.lineTo(W + 60, -60);
  } else {
    path.lineTo(rightEdge + pts[pts.length - 1][0], H + 60);
    for (let i = pts.length - 1; i >= 0; i--) path.lineTo(rightEdge + pts[i][0], pts[i][1]);
    path.lineTo(rightEdge + pts[0][0], -60);
  }
  path.closePath();
  return path;
}

function wipeEdges(env, inDur, outStart) {
  const { t, c, D, W } = env;
  const pin = ease('smooth', prog(t, 0, inDur));
  const xIn = pin >= 1 ? null : lerp(-W * 0.12, W * 1.12, pin);
  let xOut = null;
  if (t > outStart) xOut = lerp(-W * 0.12, W * 1.12, ease('smooth', prog(t, outStart, D - 0.03)));
  return { xIn, xOut, active: t < D - 0.03 && (pin > 0) && !(xOut != null && xOut >= W * 1.1), c };
}

function mirror(ctx, env, on) {
  if (on) {
    ctx.translate(env.W, 0);
    ctx.scale(-1, 1);
  }
}

// ---------- Neon Wipe ----------
const neonWipe = {
  id: 'neonWipe', category: 'Panel & logo', label: 'Neon Wipe', duration: 1.6, cut: 0.75,
  desc: 'Panel bergradasi menyapu dengan tepi neon bergerigi, logo flip 3D di tengah.',
  sfx: { in: 'whoosh', out: 'whoosh' },
  params: {
    ...hero, c1: color('Panel gelap', '#0a2a9e'), c2: color('Panel terang', '#2f6bff'), neon: color('Warna neon', '#7fb2ff'),
    dir: sel('Arah', 'ltr', { ltr: 'Kiri → kanan', rtl: 'Kanan → kiri' }), spins: num('Putaran logo', 1, 0, 4, 0.5),
    depth: num('Ketebalan logo', 14, 0, 60, 1, 'px'), seed: seed(4),
  },
  draw(ctx, env, p) {
    const { c, D, W, H } = env;
    const pts = jaggedEdge(p.seed, H, W * 0.03);
    const e = wipeEdges(env, 0.5 * c, c + 0.3 * (D - c));
    if (!e.active) return;
    ctx.save();
    mirror(ctx, env, p.dir === 'rtl');
    const region = wipeRegion(env, pts, e.xIn, e.xOut);
    ctx.save();
    ctx.clip(region);
    panelFill(ctx, -60, -60, W + 120, H + 120, p.c1, p.c2, W, H);
    ctx.restore();
    if (e.xIn != null) neonStroke(ctx, pts, e.xIn, p.neon);
    if (e.xOut != null) neonStroke(ctx, pts, e.xOut, p.neon);
    ctx.restore();
    ctx.save();
    ctx.clip(region);
    heroLogo(ctx, env, p, { tIn: 0.42 * c, tOut: c + 0.22 * (D - c), spin: p.spins, depth: p.depth, depthColor: p.c1, glowColor: p.neon, glowBlur: 25 });
    ctx.restore();
  },
};

// ---------- Card Flip ----------
const cardFlip = {
  id: 'cardFlip', category: 'Panel & logo', label: 'Card Flip', duration: 1.8, cut: 0.85,
  desc: 'Layar berbalik seperti kartu 3D, logo tebal berputar di atasnya.',
  sfx: { in: 'swoosh', out: 'swoosh' },
  params: { ...hero, c1: color('Kartu gelap', '#1b1035'), c2: color('Kartu terang', '#6d3df5'), edge: color('Warna tepi', '#c4b5fd'), spins: num('Putaran logo', 2, 0, 5, 0.5), depth: num('Ketebalan logo', 18, 0, 60, 1, 'px') },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const aIn = (1 - ease('smoothOut', prog(t, 0, 0.5 * c))) * 90;
    const aOut = ease('smoothIn', prog(t, c + 0.3 * (D - c), D - 0.03)) * -90;
    const ang = t < c ? aIn : aOut;
    const cs = Math.cos((ang * Math.PI) / 180);
    const sn = Math.sin((ang * Math.PI) / 180);
    if (cs < 0.01) return;
    const hw = (W / 2) * cs * 1.02;
    const near = H * (0.5 + 0.12 * Math.abs(sn));
    const far = H * (0.5 - 0.12 * Math.abs(sn));
    const lh = sn > 0 ? far : near;
    const rh = sn > 0 ? near : far;
    const cx = W / 2;
    const cy = H / 2;
    const quad = new Path2D();
    quad.moveTo(cx - hw, cy - lh);
    quad.lineTo(cx + hw, cy - rh);
    quad.lineTo(cx + hw, cy + rh);
    quad.lineTo(cx - hw, cy + lh);
    quad.closePath();
    ctx.save();
    ctx.clip(quad);
    panelFill(ctx, 0, 0, W, H, p.c1, p.c2, W, H);
    // Kilau saat berputar
    ctx.fillStyle = `rgba(255,255,255,${0.25 * Math.abs(sn)})`;
    ctx.fillRect(0, 0, W, H);
    heroLogo(ctx, env, p, { tIn: 0.35 * c, tOut: c + 0.2 * (D - c), spin: p.spins, depth: p.depth, depthColor: p.c1, glowColor: p.edge, glowBlur: 18 });
    ctx.restore();
    ctx.save();
    glow(ctx, p.edge, 20);
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = 6;
    ctx.stroke(quad);
    ctx.restore();
  },
};

// ---------- Diagonal Slash ----------
const diagonalSlash = {
  id: 'diagonalSlash', category: 'Panel & logo', label: 'Diagonal Slash', duration: 1.4, cut: 0.65,
  desc: 'Tiga panel miring menyapu bergantian, logo meluncur masuk.',
  sfx: { in: 'whoosh', out: 'swoosh' },
  params: { ...hero, c1: color('Panel 1', '#ff3d7f'), c2: color('Panel 2', '#ffd23f'), c3: color('Panel 3', '#111827'), angle: num('Sudut', -18, -60, 60, 1, '°') },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const L = Math.hypot(W, H) + 200;
    const cols = [p.c1, p.c2, p.c3];
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((p.angle * Math.PI) / 180);
    cols.forEach((col, k) => {
      const a = k * 0.13 * c;
      const lead = lerp(-L / 2, L / 2 + 60, ease('smooth', prog(t, a, a + 0.5 * c)));
      const b = c + (cols.length - 1 - k) * 0.1 * (D - c) + 0.08 * (D - c);
      const trail = lerp(-L / 2 - 60, L / 2 + 60, ease('smoothIn', prog(t, b, b + 0.5 * (D - c))));
      if (lead <= trail) return;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(trail - 80, -L / 2);
      ctx.lineTo(lead, -L / 2);
      ctx.lineTo(lead - 80, L / 2);
      ctx.lineTo(trail - 160, L / 2);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
    // Logo meluncur di sepanjang sudut
    const k1 = ease('smoothOut', prog(t, 0.45 * c, 0.85 * c));
    const k2 = ease('smoothIn', prog(t, c + 0.05 * (D - c), c + 0.35 * (D - c)));
    if (k1 > 0 && k2 < 1) {
      const off = (1 - k1) * -W * 0.4 + k2 * W * 0.5;
      ctx.save();
      ctx.translate(off * Math.cos((p.angle * Math.PI) / 180), off * Math.sin((p.angle * Math.PI) / 180));
      ctx.globalAlpha *= k1 * (1 - k2);
      heroLogo(ctx, { ...env, t: 10 }, p, { tIn: 0, tOut: 99 });
      ctx.restore();
    }
  },
};

// ---------- Split Doors ----------
const splitDoors = {
  id: 'splitDoors', category: 'Panel & logo', label: 'Split Doors', duration: 1.6, cut: 0.75,
  desc: 'Dua panel menutup dari kiri-kanan seperti pintu, logo di sambungan.',
  sfx: { in: 'impact', out: 'whoosh' },
  params: { ...hero, c1: color('Pintu gelap', '#111111'), c2: color('Pintu terang', '#2b2b2b'), seam: color('Cahaya sambungan', '#ffd23f') },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const close = ease('overshoot', prog(t, 0.05 * c, 0.6 * c));
    const open = ease('smoothIn', prog(t, c + 0.22 * (D - c), D - 0.03));
    const half = (W / 2) * close * (1 - open) + 4;
    if (half <= 4) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, -10, half + 10, H + 20);
    ctx.rect(W - half, -10, half + 10, H + 20);
    ctx.clip();
    panelFill(ctx, -10, -10, W + 20, H + 20, p.c1, p.c2, W, H);
    // Garis panel dekoratif
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(half - i * 60, 0);
      ctx.lineTo(half - i * 60, H);
      ctx.moveTo(W - half + i * 60, 0);
      ctx.lineTo(W - half + i * 60, H);
      ctx.stroke();
    }
    ctx.restore();
    const seamA = prog(t, 0.5 * c, 0.65 * c) * (1 - prog(t, c + 0.15 * (D - c), c + 0.3 * (D - c)));
    if (seamA > 0) {
      ctx.save();
      ctx.globalAlpha *= seamA;
      glow(ctx, p.seam, 30);
      ctx.fillStyle = p.seam;
      ctx.fillRect(W / 2 - 3, 0, 6, H);
      ctx.restore();
    }
    heroLogo(ctx, env, p, { tIn: 0.55 * c, tOut: c + 0.12 * (D - c), glowColor: p.seam, glowBlur: 20 });
  },
};

// ---------- Dark Stage ----------
const darkStage = {
  id: 'darkStage', category: 'Panel & logo', label: 'Dark Stage', duration: 2.2, cut: 1.0,
  desc: 'Panggung gelap dengan objek bercahaya melayang, logo 3D tebal berayun.',
  sfx: { in: 'riser', out: 'whoosh' },
  params: {
    ...hero, c1: color('Latar gelap', '#04060c'), c2: color('Latar terang', '#141c33'), neon: color('Warna aksen', '#3b82f6'),
    props: num('Objek dekorasi', 12, 0, 40, 1), depth: num('Ketebalan logo', 22, 0, 60, 1, 'px'), seed: seed(8),
  },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const pts = jaggedEdge(p.seed + 3, H, W * 0.025);
    const e = wipeEdges(env, 0.32 * c, c + 0.45 * (D - c));
    if (!e.active) return;
    const region = wipeRegion(env, pts, e.xIn, e.xOut);
    ctx.save();
    ctx.clip(region);
    panelFill(ctx, -60, -60, W + 120, H + 120, p.c1, p.c2, W, H);
    // Objek dekorasi melayang (pelat bercahaya)
    for (let i = 0; i < p.props; i++) {
      const x = rnd(p.seed, i, 1) * W;
      const y = rnd(p.seed, i, 2) * H;
      if (Math.hypot(x - W / 2, y - H / 2) < W * 0.18) continue;
      const w = lerp(80, 220, rnd(p.seed, i, 3));
      const rot = rndSigned(p.seed, i, 4) * 50 + t * rndSigned(p.seed, i, 5) * 20;
      ctx.save();
      ctx.translate(x + Math.sin(t * 1.3 + i) * 12, y + Math.cos(t + i) * 10);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.fillStyle = '#1b2236';
      ctx.fillRect(-w / 2, -w * 0.18, w, w * 0.36);
      glow(ctx, p.neon, 18);
      ctx.fillStyle = p.neon;
      ctx.fillRect(-w * 0.35, -w * 0.08, w * 0.7, w * 0.16);
      ctx.restore();
    }
    // Vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    // Logo berayun 3D: setengah putaran bolak-balik lewat spin kecil
    heroLogo(ctx, env, p, { tIn: 0.3 * c, tOut: c + 0.35 * (D - c), spin: 0.12, depth: p.depth, depthColor: '#0b1a3a', glowColor: p.neon, glowBlur: 30 });
    ctx.restore();
    if (e.xIn != null) neonStroke(ctx, pts, e.xIn, p.neon, 8);
    if (e.xOut != null) neonStroke(ctx, pts, e.xOut, p.neon, 8);
  },
};

export default [neonWipe, cardFlip, diagonalSlash, splitDoors, darkStage];
