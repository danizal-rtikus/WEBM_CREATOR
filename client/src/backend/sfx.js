// SFX bawaan untuk mode browser: disintesis dengan Web Audio (OfflineAudioContext)
// lalu disimpan sebagai WAV. Padanan dari server/src/sfx.js (FFmpeg).

const SR = 48000;

function noiseBuffer(ctx, dur, color = 'white', seed = 1) {
  const n = Math.ceil(dur * SR);
  const buf = ctx.createBuffer(1, n, SR);
  const d = buf.getChannelData(0);
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296 * 2 - 1;
  };
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = rand();
    if (color === 'pink') {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else if (color === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return buf;
}

function env(gain, t0, points) {
  gain.gain.setValueAtTime(points[0][1], t0 + points[0][0]);
  for (let i = 1; i < points.length; i++) {
    const [t, v, kind] = points[i];
    if (kind === 'exp') gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t0 + t);
    else gain.gain.linearRampToValueAtTime(v, t0 + t);
  }
}

const DEFS = {
  whoosh: { name: 'SFX · Whoosh', duration: 0.9, build(ctx) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.9, 'pink', 7);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(300, 0);
    bp.frequency.exponentialRampToValueAtTime(2600, 0.5);
    bp.frequency.exponentialRampToValueAtTime(500, 0.9);
    const g = ctx.createGain();
    env(g, 0, [[0, 0.0001], [0.5, 1.6, 'exp'], [0.9, 0.0001, 'exp']]);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(0);
  } },
  swoosh: { name: 'SFX · Swoosh cepat', duration: 0.45, build(ctx) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.45, 'white', 11);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 7000;
    const g = ctx.createGain();
    env(g, 0, [[0, 0.0001], [0.18, 0.7, 'exp'], [0.45, 0.0001, 'exp']]);
    src.connect(hp).connect(lp).connect(g).connect(ctx.destination);
    src.start(0);
  } },
  pop: { name: 'SFX · Pop', duration: 0.22, build(ctx) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(260, 0);
    o.frequency.exponentialRampToValueAtTime(1300, 0.22);
    const g = ctx.createGain();
    env(g, 0, [[0, 0.8], [0.22, 0.004, 'exp']]);
    o.connect(g).connect(ctx.destination);
    o.start(0);
    o.stop(0.22);
  } },
  impact: { name: 'SFX · Impact', duration: 1.1, build(ctx) {
    [[46, 0.9, 3.2], [92, 0.45, 6]].forEach(([f, a, k]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g, 0, [[0, a], [1.1, a * Math.exp(-k * 1.1), 'exp']]);
      o.connect(g).connect(ctx.destination);
      o.start(0);
      o.stop(1.1);
    });
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 0.4, 'brown', 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = ctx.createGain();
    env(g, 0, [[0, 0.9], [0.35, 0.0001, 'exp']]);
    n.connect(lp).connect(g).connect(ctx.destination);
    n.start(0);
  } },
  chime: { name: 'SFX · Chime', duration: 1.3, build(ctx) {
    [[1318.5, 0.22, 2.4], [1760, 0.22, 3.4], [2637, 0.22, 4.4]].forEach(([f, a, k]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g, 0, [[0, a], [1.3, a * Math.exp(-k * 1.3), 'exp']]);
      o.connect(g).connect(ctx.destination);
      o.start(0);
      o.stop(1.3);
    });
  } },
  riser: { name: 'SFX · Riser', duration: 1.3, build(ctx) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, 0);
    o.frequency.linearRampToValueAtTime(1130, 1.3);
    const g = ctx.createGain();
    env(g, 0, [[0, 0.001], [1.2, 0.35], [1.3, 0.0001, 'exp']]);
    o.connect(g).connect(ctx.destination);
    o.start(0);
    o.stop(1.3);
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 1.3, 'white', 5);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2000;
    const g2 = ctx.createGain();
    env(g2, 0, [[0, 0.0001], [1.25, 0.25, 'exp'], [1.3, 0.0001, 'exp']]);
    n.connect(hp).connect(g2).connect(ctx.destination);
    n.start(0);
  } },
  wind: { name: 'SFX · Angin', duration: 2.2, build(ctx) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 2.2, 'pink', 9);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 150;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const trem = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.3;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(trem.gain);
    trem.gain.value = 0.6;
    const g = ctx.createGain();
    env(g, 0, [[0, 0.0001], [0.8, 2, 'exp'], [1.3, 2], [2.2, 0.0001, 'exp']]);
    n.connect(hp).connect(lp).connect(trem).connect(g).connect(ctx.destination);
    n.start(0);
    lfo.start(0);
  } },
};

export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  out.setUint32(4, 36 + n * ch * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, 'data');
  out.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buffer.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([out.buffer], { type: 'audio/wav' });
}

/** Sintesis semua SFX → [{ id, name, duration, blob }]. */
export async function synthSfx() {
  const out = [];
  for (const [id, def] of Object.entries(DEFS)) {
    const ctx = new OfflineAudioContext(2, Math.ceil(def.duration * SR), SR);
    def.build(ctx);
    const buf = await ctx.startRendering();
    out.push({ id, name: def.name, duration: def.duration, blob: encodeWav(buf) });
  }
  return out;
}
