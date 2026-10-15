// E. Tipografi — teks raksasa & kata kinetik.
import { prog, lerp, ease, bigText, heroLogo, glow } from './util.js';
import { num, color, text, font, logo } from './schema.js';

const hero = {
  logo: logo(),
  logoSize: num('Ukuran logo', 24, 5, 80, 1, '%'),
  logoOutline: num('Outline logo', 8, 0, 30, 1, 'px'),
  logoOutlineColor: color('Warna outline logo', '#000000'),
};

// ---------- Big Type Wipe ----------
const bigType = {
  id: 'bigTypeWipe', category: 'Tipografi', label: 'Big Type Wipe', duration: 1.8, cut: 0.85,
  desc: 'Pita-pita teks raksasa berjalan bergantian arah, menutup layar.',
  sfx: { in: 'whoosh', out: 'whoosh' },
  params: {
    ...hero, text: text('Teks', 'WEBM EDITOR'), font: font('Font', 'Bebas Neue'), rows: num('Jumlah pita', 4, 2, 8, 1),
    bg1: color('Pita 1', '#111111'), bg2: color('Pita 2', '#ffd23f'), fg1: color('Teks pita 1', '#ffd23f'), fg2: color('Teks pita 2', '#111111'),
  },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const n = Math.round(p.rows);
    const bh = H / n;
    for (let k = 0; k < n; k++) {
      const dir = k % 2 ? -1 : 1;
      const a = k * 0.08 * c;
      const pin = ease('smoothOut', prog(t, a, a + 0.55 * c));
      const b = c + 0.08 * (D - c) + k * 0.06 * (D - c);
      const pout = ease('smoothIn', prog(t, b, b + 0.6 * (D - c)));
      if (pin <= 0 || pout >= 1) continue;
      const off = dir * ((1 - pin) * -W * 1.05 + pout * W * 1.05);
      const y = k * bh;
      const bg = k % 2 ? p.bg2 : p.bg1;
      const fg = k % 2 ? p.fg2 : p.fg1;
      ctx.save();
      ctx.translate(off, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(-4, y - 1, W + 8, bh + 2);
      ctx.beginPath();
      ctx.rect(-4, y, W + 8, bh);
      ctx.clip();
      const size = bh * 0.92;
      ctx.font = `400 ${size}px "${p.font}", Impact, sans-serif`;
      const word = `${p.text}  •  `;
      const ww = Math.max(50, ctx.measureText(word).width);
      const scroll = (t * 500 * dir) % ww;
      for (let x = -ww * 2 + scroll; x < W + ww; x += ww) bigText(ctx, word, x, y + bh / 2 + size * 0.04, { size, font: p.font, weight: 400, color: fg, align: 'left' });
      ctx.restore();
    }
    heroLogo(ctx, env, p, { tIn: 0.62 * c, tOut: c + 0.1 * (D - c) });
  },
};

// ---------- Kinetic Stack ----------
const kinetic = {
  id: 'kineticStack', category: 'Tipografi', label: 'Kinetic Stack', duration: 2.0, cut: 1.1,
  desc: 'Kata-kata berganti cepat dengan warna latar bergantian, ditutup logo.',
  sfx: { in: 'riser', out: 'impact' },
  params: {
    ...hero, words: text('Kata (pisahkan koma)', 'SIAP,SET,GO'), font: font('Font', 'Montserrat'),
    c1: color('Warna 1', '#111111'), c2: color('Warna 2', '#ff3d7f'), c3: color('Warna 3', '#3ddc97'), fg: color('Warna teks', '#ffffff'),
  },
  draw(ctx, env, p) {
    const { t, c, D, W, H } = env;
    const words = String(p.words || '').split(',').map((w) => w.trim()).filter(Boolean);
    const cols = [p.c1, p.c2, p.c3];
    const inP = ease('smoothOut', prog(t, 0, 0.22 * c));
    const outP = ease('smoothIn', prog(t, c + 0.3 * (D - c), D - 0.03));
    if (inP <= 0 || outP >= 1) return;
    const top = H * (1 - inP);
    const bottom = H * (1 - outP);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10, top, W + 20, bottom - top);
    ctx.clip();
    // Pilih slot kata
    const ws = 0.22 * c;
    const we = c;
    const n = Math.max(1, words.length);
    const slot = (we - ws) / n;
    const idx = Math.max(0, Math.min(n - 1, Math.floor((t - ws) / slot)));
    const inWords = t >= ws && t < we && words.length;
    const bg = t < we ? cols[idx % cols.length] : cols[n % cols.length];
    ctx.fillStyle = bg;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    if (inWords) {
      const local = prog(t, ws + idx * slot, ws + (idx + 1) * slot);
      const s = lerp(0.6, 1, ease('overshoot', prog(local, 0, 0.45)));
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      bigText(ctx, words[idx], 0, 0, { size: H * 0.34, font: p.font, weight: 900, color: p.fg });
      ctx.restore();
    } else if (t >= we) {
      ctx.save();
      glow(ctx, '#000000', 30);
      heroLogo(ctx, env, p, { tIn: we - 0.05, tOut: c + 0.22 * (D - c) });
      ctx.restore();
    }
    ctx.restore();
  },
};

export default [bigType, kinetic];
