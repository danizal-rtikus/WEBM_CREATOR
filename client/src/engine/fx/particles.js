// A. Partikel logo — terinspirasi Clean Fall, Clean Popup, Falling Logo Balls.
import { rnd, rndSigned, prog, lerp, ease, sprite, drawSprite, heroLogo, shade } from './util.js';
import { num, color, sel, bool, logo, seed } from './schema.js';

const sticker = {
  logo: logo(),
  size: num('Ukuran stiker', 220, 60, 600, 5, 'px'),
  outline: num('Tebal outline', 8, 0, 30, 1, 'px'),
  outlineColor: color('Warna outline', '#000000'),
  tilt: num('Kemiringan acak', 22, 0, 90, 1, '°'),
};

/** Tirai penutup di belakang partikel agar layar 100% tertutup di titik potong. */
function backing(ctx, env, p, mode) {
  if (!p.backing) return;
  const { t, c, D, W, H } = env;
  ctx.save();
  ctx.fillStyle = p.backingColor;
  if (mode === 'rise') {
    const top = H * (1 - ease('smooth', prog(t, 0.4 * c, 0.95 * c)));
    const drop = H * ease('smoothIn', prog(t, c + 0.1 * (D - c), c + 0.65 * (D - c)));
    const y = Math.max(top, drop);
    if (y < H) ctx.fillRect(-20, y, W + 40, H - y + 20);
  } else if (mode && mode.hole) {
    // Naik seperti 'rise', lalu berlubang mengikuti bola yang tumpah dari titik lubang
    const top = H * (1 - ease('smooth', prog(t, 0.4 * c, 0.95 * c)));
    const hr = mode.maxD * 0.85 * prog(t, c, c + mode.span * (D - c));
    if (top < H && hr < Math.hypot(W, H)) {
      ctx.beginPath();
      ctx.rect(-20, top, W + 40, H - top + 20);
      if (hr > 0) ctx.arc(mode.x, mode.y, hr, 0, Math.PI * 2);
      ctx.fill('evenodd');
    }
  } else {
    const a = prog(t, 0.8 * c, 0.97 * c) * (1 - prog(t, c + 0.04 * (D - c), c + 0.16 * (D - c)));
    if (a > 0) {
      ctx.globalAlpha *= a;
      ctx.fillRect(-20, -20, W + 40, H + 40);
    }
  }
  ctx.restore();
}

// ---------- Logo Rain ----------
const logoRain = {
  id: 'logoRain', category: 'Partikel logo', label: 'Logo Rain', duration: 1.4, cut: 0.68,
  desc: 'Stiker logo jatuh deras, menumpuk menutup layar, lalu runtuh.',
  sfx: { in: 'whoosh', out: 'swoosh' },
  params: { ...sticker, density: num('Kepadatan', 100, 50, 200, 5, '%'), blur: bool('Motion blur', true), backing: bool('Tirai penutup', true), backingColor: color('Warna tirai', '#111111'), seed: seed(11) },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const spr = sprite(env.image(p.logo), p.size, { outline: p.outline, outlineColor: p.outlineColor });
    const k = 100 / p.density;
    const colW = p.size * 0.62 * k;
    const rowH = p.size * 0.42 * k;
    const cols = Math.ceil(W / colW) + 1;
    const rows = Math.ceil(H / rowH) + 2;
    backing(ctx, env, p, 'rise');
    const g = (H + p.size * 2) / Math.pow(0.55 * (D - c), 2);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const x = (col + (row % 2) * 0.5) * colW + rndSigned(p.seed, i, 1) * colW * 0.3;
        const rest = H - row * rowH - rowH * 0.2 + rndSigned(p.seed, i, 2) * rowH * 0.3;
        const land = 0.2 * c + (row / (rows - 1)) * 0.68 * c + rnd(p.seed, i, 3) * 0.06 * c;
        const fd = 0.3 * c;
        const start = land - fd;
        if (t < start) continue;
        const y0 = -p.size - rnd(p.seed, i, 4) * H * 0.25;
        const pin = prog(t, start, land);
        let y = y0 + (rest - y0) * pin * pin;
        let vy = pin < 1 ? (2 * (rest - y0) * pin) / fd : 0;
        const leave = c + (row / rows) * 0.3 * (D - c) + rnd(p.seed, i, 5) * 0.06 * (D - c);
        let rot = rndSigned(p.seed, i, 6) * p.tilt + rndSigned(p.seed, i, 7) * 20 * (1 - pin);
        if (t > leave) {
          const dt = t - leave;
          y = rest + g * dt * dt;
          vy = 2 * g * dt;
          rot += rndSigned(p.seed, i, 8) * 30 * Math.min(1, dt * 2);
          if (y - p.size > H) continue;
        }
        const scale = 1 - rnd(p.seed, i, 9) * 0.25;
        if (p.blur && vy > 900) {
          const n = 3;
          for (let s = n; s >= 1; s--) drawSprite(ctx, spr, x, y - (vy / 60) * (s / n) * 1.2, { rot, scale, alpha: 0.18 });
        }
        drawSprite(ctx, spr, x, y, { rot, scale });
      }
    }
  },
};

// ---------- Logo Pop Storm ----------
const ORDERS = { random: 'Acak', center: 'Dari tengah', sweep: 'Menyapu kiri → kanan', spiral: 'Spiral' };
const logoPop = {
  id: 'logoPop', category: 'Partikel logo', label: 'Logo Pop Storm', duration: 1.8, cut: 0.9,
  desc: 'Stiker logo muncul pop di posisi acak sampai penuh, lalu hilang terbalik.',
  sfx: { in: 'pop', out: 'swoosh' },
  params: { ...sticker, size: num('Ukuran stiker', 240, 60, 600, 5, 'px'), order: sel('Urutan muncul', 'random', ORDERS), density: num('Kepadatan', 100, 50, 200, 5, '%'), backing: bool('Tirai penutup', true), backingColor: color('Warna tirai', '#111111'), seed: seed(5) },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const spr = sprite(env.image(p.logo), p.size, { outline: p.outline, outlineColor: p.outlineColor });
    const sp = p.size * 0.5 * (100 / p.density);
    const cols = Math.ceil(W / sp) + 1;
    const rows = Math.ceil(H / (sp * 0.75)) + 1;
    const items = [];
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < cols; q++) {
        const i = r * cols + q;
        const x = q * sp + rndSigned(p.seed, i, 1) * sp * 0.4;
        const y = r * sp * 0.75 + rndSigned(p.seed, i, 2) * sp * 0.35;
        const dx = (x - W / 2) / W;
        const dy = (y - H / 2) / H;
        let key;
        if (p.order === 'center') key = Math.hypot(dx, dy) + rnd(p.seed, i, 3) * 0.12;
        else if (p.order === 'sweep') key = x / W + rnd(p.seed, i, 3) * 0.12;
        else if (p.order === 'spiral') key = ((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) + Math.hypot(dx, dy) * 1.5) % 1.6;
        else key = rnd(p.seed, i, 3);
        items.push({ i, x, y, key });
      }
    items.sort((a, b) => a.key - b.key);
    backing(ctx, env, p, 'fade');
    const N = items.length;
    items.forEach((it, rank) => {
      const r = rank / N;
      const a = r * 0.8 * c;
      const sIn = ease('overshoot', prog(t, a, a + 0.22));
      const e = c + 0.05 * (D - c) + (1 - r) * 0.72 * (D - c);
      const sOut = 1 - ease('smoothIn', prog(t, e, e + 0.16));
      const s = sIn * sOut * (1 - rnd(p.seed, it.i, 4) * 0.25);
      if (s > 0.01) drawSprite(ctx, spr, it.x, it.y, { rot: rndSigned(p.seed, it.i, 5) * p.tilt, scale: s });
    });
  },
};

// ---------- Logo Balls ----------
function ball(ctx, x, y, r, base, spr, spin) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, shade(base, 0.35));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.6));
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  if (!spr) {
    ctx.restore();
  } else {
  ctx.clip();
  // Logo "tercetak" di bola: dipipihkan sesuai putaran agar terasa melengkung
  const f = Math.cos((spin * Math.PI) / 180);
  ctx.globalAlpha = 0.95;
  ctx.rotate((spin * 0.5 * Math.PI) / 180);
  ctx.scale(Math.max(0.25, Math.abs(f)), 1);
  ctx.drawImage(spr.canvas, -spr.w / 2 - spr.pad, -spr.h / 2 - spr.pad);
  ctx.restore();
  }
  // Highlight specular
  ctx.save();
  ctx.translate(x, y);
  const h = ctx.createRadialGradient(-r * 0.4, -r * 0.45, 0, -r * 0.4, -r * 0.45, r * 0.6);
  h.addColorStop(0, 'rgba(255,255,255,0.45)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = h;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const logoBalls = {
  id: 'logoBalls', category: 'Partikel logo', label: 'Logo Balls', duration: 2.6, cut: 1.2,
  desc: 'Bola bertekstur logo membanjiri layar lalu tumpah membentuk lubang.',
  sfx: { in: 'whoosh', out: 'impact' },
  params: {
    logo: logo(), size: num('Diameter bola', 150, 60, 400, 5, 'px'), ballColor: color('Warna bola', '#1a1a1a'),
    logoTint: color('Warna logo di bola', '#ffffff'), plain: num('Bola polos', 30, 0, 90, 5, '%'),
    backing: bool('Tirai penutup', true), backingColor: color('Warna tirai', '#050505'), seed: seed(3),
  },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const r = p.size / 2;
    const spr = sprite(env.image(p.logo), p.size * 0.72, { tint: p.logoTint });
    const dx = 2 * r * 0.9;
    const dy = 2 * r * 0.8;
    const cols = Math.ceil(W / dx) + 1;
    const rows = Math.ceil(H / dy) + 2;
    const hx = W * 0.55;
    const hy = H * 0.62;
    const maxD = Math.hypot(W, H) * 0.6;
    backing(ctx, env, p, { hole: true, x: hx, y: hy, maxD, span: 0.45 });
    const g = (H + p.size * 2) / Math.pow(0.5 * (D - c), 2);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const rx = col * dx + (row % 2) * dx * 0.5 + rndSigned(p.seed, i, 1) * r * 0.2;
        const ry = H - row * dy - r * 0.7 + rndSigned(p.seed, i, 2) * r * 0.2;
        const land = 0.08 * c + (row / rows) * 0.78 * c + rnd(p.seed, i, 3) * 0.08 * c;
        const start = land - 0.32 * c;
        if (t < start) continue;
        const y0 = -r - rnd(p.seed, i, 4) * H * 0.4;
        const pin = prog(t, start, land);
        let y = lerp(y0, ry, ease('bounce', pin));
        let x = rx;
        const leave = c + (Math.hypot(rx - hx, ry - hy) / maxD) * 0.45 * (D - c);
        let spin = rndSigned(p.seed, i, 5) * 180 + pin * 220;
        if (t > leave) {
          const dt = t - leave;
          y = ry + g * dt * dt;
          x = rx + Math.sign(rx - hx) * dt * 160;
          spin += dt * 400;
          if (y - r > H) continue;
        }
        const plain = rnd(p.seed, i, 6) * 100 < p.plain;
        const rr = r * (1 - rnd(p.seed, i, 7) * 0.15);
        ball(ctx, x, y, rr, p.ballColor, plain ? null : spr, spin);
      }
    }
  },
};

// ---------- Logo Confetti ----------
const logoConfetti = {
  id: 'logoConfetti', category: 'Partikel logo', label: 'Logo Confetti', duration: 2.0, cut: 0.9,
  desc: 'Ledakan logo + kertas warna-warni dari tengah, dengan lingkaran penutup.',
  sfx: { in: 'impact', out: 'chime' },
  params: {
    logo: logo(), count: num('Jumlah partikel', 160, 40, 400, 10), power: num('Kekuatan ledakan', 100, 40, 200, 5, '%'),
    c1: color('Warna 1', '#ff3d7f'), c2: color('Warna 2', '#ffd23f'), c3: color('Warna 3', '#3ddc97'), c4: color('Warna 4', '#3b82f6'),
    bg: color('Warna penutup', '#151826'), logoSize: num('Ukuran logo tengah', 28, 5, 80, 1, '%'), logoOutline: num('Outline logo', 0, 0, 30, 1, 'px'), logoOutlineColor: color('Warna outline', '#000000'), seed: seed(9),
  },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const R = Math.hypot(W, H) / 2 + 20;
    const rIn = R * ease('smoothOut', prog(t, 0.12 * c, 0.85 * c));
    const hole = R * ease('smoothIn', prog(t, c + 0.15 * (D - c), D - 0.04));
    if (rIn > 1 && hole < R) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, rIn, 0, Math.PI * 2);
      if (hole > 0) ctx.arc(W / 2, H / 2, hole, 0, Math.PI * 2, true);
      ctx.fillStyle = p.bg;
      ctx.fill('evenodd');
      ctx.restore();
    }
    const colors = [p.c1, p.c2, p.c3, p.c4];
    const logoSpr = sprite(env.image(p.logo), 110, {});
    for (let i = 0; i < p.count; i++) {
      const s0 = rnd(p.seed, i, 1) * 0.45 * c;
      const tau = t - s0;
      if (tau < 0) continue;
      const a = rnd(p.seed, i, 2) * Math.PI * 2;
      const v = lerp(700, 2600, rnd(p.seed, i, 3)) * (p.power / 100);
      const kd = 2.2;
      const dist = (v * (1 - Math.exp(-kd * tau))) / kd;
      const x = W / 2 + Math.cos(a) * dist;
      const y = H / 2 + Math.sin(a) * dist + 380 * tau * tau;
      if (x < -200 || x > W + 200 || y > H + 200) continue;
      const fade = 1 - prog(t, D - 0.3, D);
      const spin = rndSigned(p.seed, i, 4) * 720 * tau;
      const flip = Math.cos(tau * lerp(4, 12, rnd(p.seed, i, 5)) + i);
      if (rnd(p.seed, i, 6) < 0.3) {
        drawSprite(ctx, logoSpr, x, y, { rot: spin * 0.3, scale: lerp(0.4, 1.1, rnd(p.seed, i, 7)), alpha: fade, flip });
      } else {
        ctx.save();
        ctx.globalAlpha *= fade;
        ctx.translate(x, y);
        ctx.rotate((spin * Math.PI) / 180);
        ctx.scale(flip, 1);
        ctx.fillStyle = colors[i % 4];
        const w = lerp(14, 34, rnd(p.seed, i, 8));
        ctx.fillRect(-w / 2, -w * 0.3, w, w * 0.6);
        ctx.restore();
      }
    }
    heroLogo(ctx, env, p, { tIn: 0.45 * c, tOut: c + 0.12 * (D - c) });
  },
};

// ---------- Sticker Wall ----------
const stickerWall = {
  id: 'stickerWall', category: 'Partikel logo', label: 'Sticker Wall', duration: 1.8, cut: 0.9,
  desc: 'Stiker logo menempel baris demi baris seperti tembok, lalu mengelupas jatuh.',
  sfx: { in: 'pop', out: 'swoosh' },
  params: { ...sticker, size: num('Ukuran stiker', 260, 60, 600, 5, 'px'), tilt: num('Kemiringan acak', 12, 0, 60, 1, '°'), dir: sel('Arah tempel', 'ltr', { ltr: 'Kiri → kanan', rtl: 'Kanan → kiri' }), backing: bool('Tirai penutup', true), backingColor: color('Warna tirai', '#111111'), seed: seed(21) },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const spr = sprite(env.image(p.logo), p.size, { outline: p.outline, outlineColor: p.outlineColor });
    const sx = p.size * 0.66;
    const sy = p.size * 0.5;
    const cols = Math.ceil(W / sx) + 1;
    const rows = Math.ceil(H / sy) + 1;
    backing(ctx, env, p, 'fade');
    const dir = p.dir === 'rtl' ? -1 : 1;
    const g = (H + p.size * 2) / Math.pow(0.5 * (D - c), 2);
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < cols; q++) {
        const i = r * cols + q;
        const qq = dir > 0 ? q : cols - 1 - q;
        const x = qq * sx + (r % 2) * sx * 0.5 + rndSigned(p.seed, i, 1) * sx * 0.15;
        const y = r * sy + rndSigned(p.seed, i, 2) * sy * 0.15;
        const a = 0.03 * c + (r / rows) * 0.45 * c + (q / cols) * 0.35 * c;
        const pin = prog(t, a, a + 0.22);
        if (pin <= 0) continue;
        let px = x - dir * (1 - ease('smoothOut', pin)) * W * 0.25;
        let py = y;
        let rot = rndSigned(p.seed, i, 3) * p.tilt;
        let alpha = Math.min(1, pin * 3);
        const scale = lerp(0.6, 1, ease('overshoot', pin));
        const leave = c + 0.05 * (D - c) + rnd(p.seed, i, 4) * 0.4 * (D - c);
        if (t > leave) {
          const dt = t - leave;
          py = y + g * dt * dt;
          px += rndSigned(p.seed, i, 5) * 300 * dt;
          rot += rndSigned(p.seed, i, 6) * 200 * dt;
          if (py - p.size > H) continue;
        }
        drawSprite(ctx, spr, px, py, { rot, scale, alpha });
      }
  },
};

export default [logoRain, logoPop, logoBalls, logoConfetti, stickerWall];
