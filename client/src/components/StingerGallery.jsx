import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { FX_LIST, FX_CATEGORIES, drawFx, fxDefaults } from '../engine/fx/index.js';

const PW = 224;
const PH = 126;

/** Kartu template dengan pratinjau animasi (bergerak saat kursor di atasnya). */
function StingerCard({ def, logoImg, onApply }) {
  const ref = useRef(null);
  const [hover, setHover] = useState(false);
  const clip = useMemo(
    () => ({ type: 'fx', start: 0, duration: def.duration, fx: { kind: def.id, params: { ...fxDefaults(def.id), logo: logoImg ? 'L' : null } } }),
    [def, logoImg],
  );
  const project = useMemo(() => ({ settings: { width: 1920, height: 1080, fps: 60, cutPoint: def.cut } }), [def]);
  const media = useMemo(() => ({ image: () => logoImg, asset: () => null, video: () => null }), [logoImg]);

  useEffect(() => {
    const c = ref.current;
    const dpr = window.devicePixelRatio || 1;
    c.width = PW * dpr;
    c.height = PH * dpr;
    const ctx = c.getContext('2d');
    const draw = (t) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform((PW * dpr) / 1920, 0, 0, (PH * dpr) / 1080, 0, 0);
      drawFx(ctx, clip, project, t, media);
    };
    if (!hover) {
      draw(def.cut * 0.92);
      return undefined;
    }
    let raf;
    const start = performance.now();
    const loop = (now) => {
      const t = ((now - start) / 1000) % (def.duration + 0.4);
      draw(Math.min(t, def.duration - 0.001));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hover, clip, project, media, def]);

  return (
    <button className="stinger-card" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onClick={onApply} title={def.desc}>
      <canvas ref={ref} />
      <span className="stinger-name">{def.label}</span>
      <span className="stinger-meta">{def.card ? `${def.duration.toFixed(1)} s · kartu` : `${def.duration.toFixed(1)} s · cut ${Math.round(def.cut * 1000)} ms`}</span>
    </button>
  );
}

export default function StingerGallery() {
  const assets = useEditor((s) => s.assets);
  const images = assets.filter((a) => a.kind === 'image');
  const sfxAssets = useMemo(() => Object.fromEntries(assets.filter((a) => a.sfx).map((a) => [a.sfx, a])), [assets]);
  const [logoId, setLogoId] = useState(() => {
    try {
      return localStorage.getItem('webm-editor:stinger-logo') || '';
    } catch {
      return '';
    }
  });
  const [withSfx, setWithSfx] = useState(true);
  const [fit, setFit] = useState(true);
  const [logoImg, setLogoImg] = useState(null);
  const logoAsset = images.find((a) => a.id === logoId) || null;

  useEffect(() => {
    try {
      localStorage.setItem('webm-editor:stinger-logo', logoId);
    } catch {
      /* noop */
    }
    if (!logoAsset) {
      setLogoImg(null);
      return;
    }
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.src = logoAsset.url;
  }, [logoAsset, logoId]);

  const apply = (def) => {
    const st = useEditor.getState();
    if (fit && st.project.tracks.length > 0 && !confirm(`Atur proyek untuk "${def.label}"?\nDurasi proyek → ${def.duration} s${def.card ? '' : `, titik potong → ${Math.round(def.cut * 1000)} ms`}, latar transparan.\nLayer yang ada tetap disimpan.`)) return;
    st.addStinger(def.id, { logoId: logoAsset ? logoAsset.id : null, sfx: withSfx, sfxAssets, fitProject: fit });
    st.notify(`Template "${def.label}" ditambahkan. Ganti foto, logo, teks & warna di panel kanan.`);
  };

  return (
    <div className="stinger-panel">
      <p className="note">
        <b>Kartu info</b> (mis. Kartu Wisuda): ganti foto, logo, dan teks di panel kanan. <b>Stinger</b>: transisi yang menutup layar penuh di titik potong. Arahkan kursor ke kartu untuk melihat animasinya.
      </p>
      <label className="field">
        <span>Logo untuk template (logo kiri pada kartu)</span>
        <select value={logoId} onChange={(e) => setLogoId(e.target.value)}>
          <option value="">(Contoh: YOUR LOGO HERE)</option>
          {images.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={withSfx} onChange={(e) => setWithSfx(e.target.checked)} /> Tambahkan SFX (whoosh, pop, dll.)
      </label>
      <label className="check">
        <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} /> Atur durasi & titik potong proyek
      </label>
      {FX_CATEGORIES.map((cat) => (
        <div key={cat} className="stinger-group">
          <div className="section-head"><span>{cat}</span></div>
          <div className="stinger-grid">
            {FX_LIST.filter((f) => f.category === cat).map((def) => (
              <StingerCard key={def.id} def={def} logoImg={logoImg} onApply={() => apply(def)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
