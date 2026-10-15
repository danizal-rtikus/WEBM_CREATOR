// F. Kartu info — template "Kartu Wisuda" (dari referensi 1_Yullia_Argi_Wilujeng.webm).
// Wipe chevron biru masuk dari kanan, teks muncul per kata dengan blur,
// lalu wipe chevron keluar ke kiri. Semua foto, logo, teks, dan warna bisa diganti.
import { rnd, prog, lerp, ease, pixelScale, hexToRgba, shade } from './util.js';
import { num, color, text, font, logo, seed } from './schema.js';

// ---------- Geometri chevron ----------
const SLOPE = 1.0; // kemiringan lengan chevron
const ROUND = 170; // kelengkungan ujung chevron

/** Offset tepi chevron pada baris y (0 di tengah, membesar ke atas/bawah). */
function arm(y, H) {
  const d = y - H / 2;
  return SLOPE * (Math.sqrt(d * d + ROUND * ROUND) - ROUND);
}

/** Path wilayah di kanan tepi "<" (masuk) atau kiri tepi ">" (keluar), dengan offset. */
function chevronPath(ctx, X, W, H, dir, offset = 0, right = true) {
  const steps = 36;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const y = -20 + ((H + 40) * i) / steps;
    const x = X + dir * arm(y, H) + offset;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  const far = right ? W + 4000 : -4000;
  ctx.lineTo(far, H + 20);
  ctx.lineTo(far, -20);
  ctx.closePath();
}

// ---------- Gambar ----------
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function drawContain(ctx, img, cx, cy, maxW, maxH) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const s = Math.min(maxW / iw, maxH / ih);
  ctx.drawImage(img, cx - (iw * s) / 2, cy - (ih * s) / 2, iw * s, ih * s);
}

function photoPlaceholder(ctx, x, y, w, h, bg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(20,20,30,0.85)';
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h * 0.4, w * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 1.02, w * 0.48, h * 0.38, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `600 ${Math.round(w * 0.08)}px Poppins, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('FOTO', x + w / 2, y + h * 0.12);
}

function logoPlaceholder(ctx, cx, cy, r, label) {
  ctx.fillStyle = '#e8eefc';
  ctx.strokeStyle = '#9fb6e8';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#6b84b8';
  ctx.font = `700 ${Math.round(r * 0.36)}px Poppins, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

// ---------- Teks ----------
function fontStr(weight, size, fam) {
  return `${weight} ${size}px "${fam}", Arial, sans-serif`;
}

/** Perkecil ukuran font sampai teks muat di maxW. */
function fitSize(ctx, str, weight, size, fam, maxW) {
  let s = size;
  ctx.font = fontStr(weight, s, fam);
  while (s > 12 && ctx.measureText(str).width > maxW) {
    s -= 2;
    ctx.font = fontStr(weight, s, fam);
  }
  return s;
}

/**
 * Teks muncul per kata: blur → tajam, geser dari kanan, fade.
 * align: 'left' | 'center' | 'right' relatif ke x.
 */
function wordReveal(ctx, env, str, x, y, { size, weight, fam, color: col, t0, step = 0.07, dur = 0.42, align = 'left', maxW = 4000 }) {
  const { t } = env;
  if (!str || t < t0) return;
  const s = fitSize(ctx, str, weight, size, fam, maxW);
  ctx.font = fontStr(weight, s, fam);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const words = String(str).split(' ');
  const space = ctx.measureText(' ').width;
  const total = ctx.measureText(str).width;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const ps = pixelScale(ctx);
  words.forEach((w, i) => {
    const p = ease('smoothOut', prog(t, t0 + i * step, t0 + i * step + dur));
    const ww = ctx.measureText(w).width;
    if (p > 0) {
      ctx.save();
      ctx.globalAlpha *= p;
      const blur = (1 - p) * 16;
      if (blur > 0.3) ctx.filter = `blur(${(blur * ps).toFixed(2)}px)`;
      ctx.fillStyle = col;
      ctx.fillText(w, cx + (1 - p) * 60, y);
      ctx.restore();
    }
    cx += ww + space;
  });
}

/** Teks muncul per huruf dengan urutan acak (seperti footer referensi). */
function charReveal(ctx, env, str, x, y, { size, weight, fam, color: col, t0, dur = 0.6, align = 'left', seed: sd }) {
  const { t } = env;
  if (!str || t < t0) return;
  ctx.font = fontStr(weight, size, fam);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const total = ctx.measureText(str).width;
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  ctx.fillStyle = col;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const w = ctx.measureText(ch).width;
    const a = prog(t, t0 + rnd(sd, i, 1) * dur, t0 + rnd(sd, i, 1) * dur + 0.12);
    if (a > 0 && ch !== ' ') {
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.fillText(ch, cx, y);
      ctx.restore();
    }
    cx += w;
  }
}

// ---------- Template ----------
const graduationCard = {
  id: 'graduationCard',
  category: 'Kartu info',
  label: 'Kartu Wisuda',
  duration: 4.3,
  cut: 2.0,
  card: true, // bukan stinger: tidak memakai titik potong
  desc: 'Kartu profil wisudawan: wipe chevron biru, foto, logo, NIM, nama, gelar, IPK, predikat.',
  sfxAt: [['whoosh', 0.35], ['pop', 1.05], ['whoosh', 2.8]],
  params: {
    photo: logo('Foto wisudawan'),
    logoLeft: logo('Logo kiri (kampus)'),
    logoRight: logo('Logo kanan (mis. Kampus Merdeka)'),
    title: text('Judul acara', 'Santika Cendekia Widya Dharma Wisuda'),
    programLabel: text('Label program', 'Program Studi'),
    program: text('Program studi', 'KOMPUTERISASI AKUNTANSI'),
    nim: text('NIM', '201702008'),
    name: text('Nama', 'Nama Lengkap Wisudawan'),
    degree: text('Gelar', 'Ahli Madya Komputer (Amd. Kom.)'),
    ipkLabel: text('Label IPK (teks depan)', 'IPK'),
    ipk: text('Nilai IPK', '3.75'),
    predicate: text('Predikat', 'Dengan Pujian'),
    footerLeft: text('Footer kiri', '- Santika Cendekia Widya Dharma Wisuda'),
    footerRight: text('Footer kanan', 'Hotel Grand Karlita 2023'),
    font: font('Font', 'Poppins'),
    primary: color('Biru utama', '#1366ff'),
    secondary: color('Biru muda (aksen)', '#17b6f2'),
    textDark: color('Warna teks gelap', '#16213e'),
    textSoft: color('Warna nama', '#3a4763'),
    bg: color('Latar kartu', '#f4f6fb'),
    photoBg: color('Latar foto (placeholder)', '#ff2a10'),
    inStart: num('Mulai masuk', 0.5, 0, 2, 0.05, 's'),
    outLead: num('Keluar sebelum akhir', 1.4, 0.4, 3, 0.05, 's'),
    seed: seed(5),
  },
  draw(ctx, env, p) {
    const { t, D, W, H } = env;
    const fam = p.font;
    const B = 250; // tebal pita biru
    const tipMax = arm(0, H);

    // Posisi wipe masuk (tepi "<" bergerak ke kiri) & keluar (tepi ">" bergerak ke kiri)
    const inP = ease('smooth', prog(t, p.inStart, p.inStart + 0.7));
    const xIn = lerp(W + B + 40, -tipMax - B - 60, inP);
    const outStart = D - p.outLead;
    const outP = ease('easeInOut', prog(t, outStart, outStart + 0.95));
    const xOut = lerp(W + tipMax + B + 60, -B - 80, outP);
    if (inP <= 0 || xOut < -B - 60) return;

    // ---------- Pita biru wipe masuk ----------
    ctx.save();
    if (outP > 0) {
      // Saat keluar, semua yang ada di kanan tepi ">" disembunyikan
      chevronPath(ctx, xOut, W, H, -1, 0, false);
      ctx.clip();
    }
    if (inP < 1) {
      ctx.save();
      chevronPath(ctx, xIn, W, H, 1, -B, true);
      ctx.fillStyle = p.primary;
      ctx.fill();
      ctx.restore();
    }

    // ---------- Isi kartu (terpotong tepi chevron masuk) ----------
    ctx.save();
    chevronPath(ctx, xIn, W, H, 1, 0, true);
    ctx.clip();

    // Latar kartu: putih kebiruan + bentuk diagonal samar
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, shade(p.bg, 0.4));
    g.addColorStop(1, p.bg);
    ctx.fillStyle = g;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(W * 0.55, -10);
    ctx.lineTo(W + 10, -10);
    ctx.lineTo(W + 10, H * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexToRgba(p.primary, 0.035);
    ctx.beginPath();
    ctx.moveTo(W * 0.62, H + 10);
    ctx.lineTo(W + 10, H * 0.25);
    ctx.lineTo(W + 10, H + 10);
    ctx.closePath();
    ctx.fill();

    // Dekorasi diagonal kiri bawah & pojok kiri atas
    ctx.fillStyle = p.secondary;
    ctx.beginPath();
    ctx.moveTo(150, 640);
    ctx.lineTo(560, 640);
    ctx.lineTo(1000, H + 10);
    ctx.lineTo(590, H + 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = p.primary;
    ctx.beginPath();
    ctx.moveTo(-10, 480);
    ctx.lineTo(610, H + 10);
    ctx.lineTo(-10, H + 10);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(120, -10);
    ctx.lineTo(-10, 120);
    ctx.closePath();
    ctx.fill();
    // Grid titik samar di kiri foto
    ctx.fillStyle = hexToRgba(p.textDark, 0.12);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 7; j++) ctx.fillRect(196 + i * 26, 420 + j * 26, 4, 4);

    const tc = p.inStart + 0.38; // awal animasi isi

    // Header
    const imgL = env.image(p.logoLeft);
    const imgR = env.image(p.logoRight);
    const lp = ease('overshoot', prog(t, tc + 0.15, tc + 0.55));
    if (lp > 0) {
      ctx.save();
      ctx.translate(262, 156);
      ctx.scale(lp, lp);
      if (imgL && imgL.naturalWidth) drawContain(ctx, imgL, 0, 0, 190, 190);
      else logoPlaceholder(ctx, 0, 0, 88, 'LOGO');
      ctx.restore();
    }
    const rp = prog(t, tc + 0.1, tc + 0.5);
    if (rp > 0) {
      ctx.save();
      ctx.globalAlpha *= rp;
      if (imgR && imgR.naturalWidth) drawContain(ctx, imgR, 1722 + (1 - rp) * 40, 128, 270, 140);
      else logoPlaceholder(ctx, 1722 + (1 - rp) * 40, 128, 70, 'LOGO 2');
      ctx.restore();
    }
    wordReveal(ctx, env, p.title, 990, 98, { size: 52, weight: 500, fam, color: p.textDark, t0: tc, align: 'center', maxW: 1220 });
    wordReveal(ctx, env, p.programLabel, 990, 188, { size: 48, weight: 700, fam, color: p.textDark, t0: tc + 0.1, align: 'center', maxW: 1200 });
    wordReveal(ctx, env, p.program, 990, 252, { size: 48, weight: 700, fam, color: p.primary, t0: tc + 0.18, align: 'center', maxW: 1200 });

    // Foto
    const px = 370;
    const py = 352;
    const pw = 402;
    const ph = 534;
    const photo = env.image(p.photo);
    if (photo && photo.naturalWidth) drawCover(ctx, photo, px, py, pw, ph);
    else photoPlaceholder(ctx, px, py, pw, ph, p.photoBg);

    // Data wisudawan
    const x0 = 862;
    const maxW = W - x0 - 70;
    wordReveal(ctx, env, p.nim, x0, 402, { size: 128, weight: 700, fam, color: p.textDark, t0: tc + 0.05, maxW });
    wordReveal(ctx, env, p.name, x0, 536, { size: 76, weight: 300, fam, color: p.textSoft, t0: tc + 0.15, maxW });
    wordReveal(ctx, env, p.degree, x0 + 18, 612, { size: 58, weight: 500, fam, color: p.textDark, t0: tc + 0.3, maxW: maxW - 18 });
    const ipkStr = `${p.ipkLabel} - ${p.ipk}`;
    wordReveal(ctx, env, ipkStr, x0, 735, { size: 110, weight: 700, fam, color: p.primary, t0: tc + 0.35, step: 0.1, maxW });
    wordReveal(ctx, env, p.predicate, x0 + 90, 858, { size: 64, weight: 500, fam, color: p.textDark, t0: tc + 0.6, maxW: maxW - 90 });

    // Footer
    charReveal(ctx, env, p.footerLeft, 36, 1012, { size: 30, weight: 700, fam, color: '#ffffff', t0: tc + 0.1, seed: p.seed });
    charReveal(ctx, env, p.footerRight, W - 120, 1012, { size: 30, weight: 700, fam, color: p.textDark, t0: tc + 0.1, align: 'right', seed: p.seed + 1 });
    ctx.restore();

    // ---------- Pita biru wipe keluar ----------
    if (outP > 0) {
      ctx.restore();
      ctx.save();
      // Pita di sepanjang tepi ">" sisi kanan
      ctx.beginPath();
      const steps = 36;
      for (let i = 0; i <= steps; i++) {
        const y = -20 + ((H + 40) * i) / steps;
        const x = xOut - arm(y, H);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const y = -20 + ((H + 40) * i) / steps;
        ctx.lineTo(xOut - arm(y, H) + B, y);
      }
      ctx.closePath();
      ctx.fillStyle = p.primary;
      ctx.fill();
      ctx.restore();
    } else {
      ctx.restore();
    }
  },
};

export default [graduationCard];
