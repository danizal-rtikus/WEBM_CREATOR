// D. Partikel alami — terinspirasi Sakura Petals.
// Partikel terbang di "ruang aliran" (sepanjang arah angin) lalu diputar sesuai arah.
// Tirai bergelombang di tengah kedalaman memastikan layar tertutup penuh di titik potong.
import { rnd, rndSigned, prog, lerp, ease, sprite, drawSprite, petalPath, leafPath, hexToRgba, shade, scallopPath } from './util.js';
import { num, color, sel, bool, logo, seed, DIRS } from './schema.js';

function flowTransform(ctx, dir, W, H) {
  // Mengembalikan panjang aliran (L) dan lebar silang (S)
  if (dir === 'rtl') {
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    return [W, H];
  }
  if (dir === 'ttb') {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
    return [H, W];
  }
  if (dir === 'btt') {
    ctx.translate(0, H);
    ctx.rotate(-Math.PI / 2);
    return [H, W];
  }
  return [W, H];
}

/**
 * Mesin partikel aliran.
 * drawP(ctx, i, size, flip, rot, p) menggambar satu partikel di (0,0).
 */
function flowField(ctx, env, p, drawP, curtainFill) {
  const { t, c, D, W, H } = env;
  ctx.save();
  const [L, S] = flowTransform(ctx, p.dir, W, H);
  const N = Math.round(p.count);
  const near = [];
  const drawOne = (i) => {
    const z = rnd(p.seed, i, 1);
    const size = lerp(p.minSize, p.maxSize, z * z);
    const speed = lerp(0.55, 1.35, rnd(p.seed, i, 2)) * (L / (D * 0.45)) * (p.speed / 100) * lerp(0.7, 1.3, z);
    const life = (L + size * 2) / speed;
    const birth = lerp(-life * 0.6, D - life * 0.25, rnd(p.seed, i, 3));
    const age = t - birth;
    if (age < 0 || age > life) return;
    const x = -size + speed * age;
    const y0 = rnd(p.seed, i, 4) * S;
    const sway = Math.sin(age * lerp(1.5, 3.5, rnd(p.seed, i, 5)) + i) * lerp(10, 60, rnd(p.seed, i, 6));
    const y = y0 + sway + (p.drift || 0) * age * 60;
    const rot = rndSigned(p.seed, i, 7) * 180 + age * rndSigned(p.seed, i, 8) * 200;
    const flip = p.flip === false ? 1 : Math.cos(age * lerp(2, 6, rnd(p.seed, i, 9)) + i * 1.3);
    ctx.save();
    ctx.translate(x, y);
    drawP(ctx, i, size, flip, rot, z);
    ctx.restore();
  };
  // Lapisan jauh
  for (let i = 0; i < N; i++) {
    if (rnd(p.seed, i, 1) < 0.55) drawOne(i);
    else near.push(i);
  }
  // Tirai penutup di tengah kedalaman
  if (p.curtain) {
    const inEdge = lerp(-L * 0.3, L * 1.3, ease('smooth', prog(t, 0.35 * c, 0.97 * c)));
    const outEdge = lerp(-L * 0.3, L * 1.3, ease('smooth', prog(t, c + 0.04 * (D - c), c + 0.7 * (D - c))));
    if (inEdge > outEdge) {
      const r = Math.max(60, p.maxSize * 0.8);
      ctx.beginPath();
      scallopPath(ctx, inEdge, S, r, 1, t * 2);
      if (outEdge > -L * 0.29) scallopPath(ctx, outEdge, S, r, 1, t * 2 + 1);
      ctx.fillStyle = curtainFill(ctx, L, S);
      ctx.fill('evenodd');
    }
  }
  // Lapisan dekat (lebih besar, di depan tirai)
  near.forEach(drawOne);
  ctx.restore();
}

const flowParams = (over = {}) => ({
  dir: sel('Arah angin', 'ltr', DIRS),
  count: num('Jumlah partikel', 220, 20, 600, 10),
  minSize: num('Ukuran min', 30, 4, 300, 2, 'px'),
  maxSize: num('Ukuran maks', 180, 10, 700, 5, 'px'),
  speed: num('Kecepatan', 100, 30, 250, 5, '%'),
  curtain: bool('Tirai penutup', true),
  seed: seed(12),
  ...over,
});

// ---------- Sakura Gust ----------
const sakura = {
  id: 'sakuraGust', category: 'Partikel alami', label: 'Sakura Gust', duration: 4.0, cut: 1.9,
  desc: 'Kelopak sakura berhamburan tertiup angin, menutup layar lalu terbawa habis.',
  sfx: { in: 'wind', out: 'chime' },
  params: flowParams({ c1: color('Kelopak terang', '#ffd6e4'), c2: color('Kelopak gelap', '#f48fb1'), blossom: num('Bunga utuh', 15, 0, 60, 1, '%') }),
  draw(ctx, env, p) {
    flowField(ctx, env, p, (g, i, s, flip, rot) => {
      g.rotate((rot * Math.PI) / 180);
      g.scale(flip, 1);
      const grad = g.createLinearGradient(0, -s / 2, 0, s / 2);
      grad.addColorStop(0, p.c1);
      grad.addColorStop(1, p.c2);
      g.fillStyle = grad;
      if (rnd(p.seed, i, 20) * 100 < p.blossom) {
        for (let k = 0; k < 5; k++) {
          g.save();
          g.rotate((k / 5) * Math.PI * 2);
          g.translate(0, -s * 0.28);
          petalPath(g, s * 0.5);
          g.fill();
          g.restore();
        }
        g.fillStyle = shade(p.c2, -0.3);
        g.beginPath();
        g.arc(0, 0, s * 0.07, 0, Math.PI * 2);
        g.fill();
      } else {
        petalPath(g, s);
        g.fill();
        g.strokeStyle = hexToRgba('#ffffff', 0.35);
        g.lineWidth = Math.max(1, s * 0.02);
        g.beginPath();
        g.moveTo(0, s * 0.4);
        g.lineTo(0, -s * 0.2);
        g.stroke();
      }
    }, (g, L, S) => {
      const gr = g.createLinearGradient(0, 0, L, S);
      gr.addColorStop(0, p.c2);
      gr.addColorStop(0.5, p.c1);
      gr.addColorStop(1, p.c2);
      return gr;
    });
  },
};

// ---------- Autumn Leaves ----------
const leaves = {
  id: 'autumnLeaves', category: 'Partikel alami', label: 'Autumn Leaves', duration: 3.5, cut: 1.6,
  desc: 'Daun musim gugur berguguran tertiup angin.',
  sfx: { in: 'wind', out: 'wind' },
  params: flowParams({ c1: color('Daun 1', '#f97316'), c2: color('Daun 2', '#dc2626'), c3: color('Daun 3', '#facc15'), curtainColor: color('Warna tirai', '#9a3412'), seed: seed(31) }),
  draw(ctx, env, p) {
    const cols = [p.c1, p.c2, p.c3];
    flowField(ctx, env, p, (g, i, s, flip, rot) => {
      g.rotate((rot * Math.PI) / 180);
      g.scale(flip, 1);
      g.fillStyle = cols[i % 3];
      leafPath(g, s);
      g.fill();
      g.strokeStyle = shade(cols[i % 3], -0.35);
      g.lineWidth = Math.max(1, s * 0.03);
      g.beginPath();
      g.moveTo(0, -s * 0.5);
      g.lineTo(0, s * 0.6);
      for (let k = -1; k <= 1; k += 2) {
        g.moveTo(0, -s * 0.05);
        g.lineTo(k * s * 0.25, -s * 0.25);
        g.moveTo(0, s * 0.18);
        g.lineTo(k * s * 0.25, 0);
      }
      g.stroke();
    }, () => p.curtainColor);
  },
};

// ---------- Snow Burst ----------
const snow = {
  id: 'snowBurst', category: 'Partikel alami', label: 'Snow Burst', duration: 3.0, cut: 1.4,
  desc: 'Salju lebat turun menutup layar, lalu mereda.',
  sfx: { in: 'wind', out: 'chime' },
  params: flowParams({ dir: sel('Arah angin', 'ttb', DIRS), count: num('Jumlah partikel', 320, 20, 800, 10), minSize: num('Ukuran min', 8, 2, 100, 1, 'px'), maxSize: num('Ukuran maks', 90, 10, 400, 5, 'px'), flake: color('Warna salju', '#ffffff'), curtainColor: color('Warna tirai', '#e0f2fe'), seed: seed(17) }),
  draw(ctx, env, p) {
    flowField(ctx, env, { ...p, flip: false }, (g, i, s) => {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
      gr.addColorStop(0, hexToRgba(p.flake, 1));
      gr.addColorStop(0.5, hexToRgba(p.flake, 0.8));
      gr.addColorStop(1, hexToRgba(p.flake, 0));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, s / 2, 0, Math.PI * 2);
      g.fill();
    }, () => p.curtainColor);
  },
};

// ---------- Bubbles ----------
const bubbles = {
  id: 'bubbles', category: 'Partikel alami', label: 'Bubbles', duration: 2.5, cut: 1.2,
  desc: 'Gelembung transparan naik dari bawah memenuhi layar.',
  sfx: { in: 'riser', out: 'pop' },
  params: flowParams({ dir: sel('Arah', 'btt', DIRS), count: num('Jumlah partikel', 200, 20, 600, 10), minSize: num('Ukuran min', 20, 4, 200, 2, 'px'), maxSize: num('Ukuran maks', 220, 20, 600, 5, 'px'), tint: color('Warna gelembung', '#38bdf8'), curtainColor: color('Warna tirai', '#0c4a6e'), seed: seed(23) }),
  draw(ctx, env, p) {
    flowField(ctx, env, { ...p, flip: false }, (g, i, s) => {
      const r = s / 2;
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      gr.addColorStop(0, hexToRgba('#ffffff', 0.05));
      gr.addColorStop(0.8, hexToRgba(p.tint, 0.25));
      gr.addColorStop(1, hexToRgba(p.tint, 0.6));
      g.fillStyle = gr;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = hexToRgba('#ffffff', 0.7);
      g.lineWidth = Math.max(1, r * 0.06);
      g.beginPath();
      g.arc(0, 0, r * 0.95, Math.PI * 1.1, Math.PI * 1.45);
      g.stroke();
    }, (g, L, S) => {
      const gr = g.createLinearGradient(0, 0, 0, S);
      gr.addColorStop(0, shade(p.curtainColor, 0.15));
      gr.addColorStop(1, p.curtainColor);
      return gr;
    });
  },
};

// ---------- Logo Petals ----------
const logoPetals = {
  id: 'logoPetals', category: 'Partikel alami', label: 'Logo Petals', duration: 3.5, cut: 1.6,
  desc: 'Seperti Sakura Gust, tetapi "kelopaknya" adalah logo Anda.',
  sfx: { in: 'wind', out: 'whoosh' },
  params: flowParams({ logo: logo(), count: num('Jumlah partikel', 160, 20, 500, 10), minSize: num('Ukuran min', 50, 10, 300, 5, 'px'), maxSize: num('Ukuran maks', 260, 20, 700, 5, 'px'), outline: num('Outline', 6, 0, 30, 1, 'px'), outlineColor: color('Warna outline', '#ffffff'), curtainColor: color('Warna tirai', '#111827'), seed: seed(41) }),
  draw(ctx, env, p) {
    const img = env.image(p.logo);
    const big = sprite(img, p.maxSize, { outline: p.outline, outlineColor: p.outlineColor });
    flowField(ctx, env, p, (g, i, s, flip, rot) => {
      drawSprite(g, big, 0, 0, { rot: rot * 0.3, scale: s / p.maxSize, flip: Math.abs(flip) < 0.08 ? 0.08 : flip });
    }, () => p.curtainColor);
  },
};

export default [sakura, leaves, snow, bubbles, logoPetals];
