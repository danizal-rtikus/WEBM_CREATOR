import React from 'react';
import { useEditor } from '../store/editor.js';
import { FX, fxDefaults, fxCut } from '../engine/fx/index.js';
import { FONTS } from '../engine/project.js';
import NumberField from './NumberField.jsx';

function Section({ title, children, right }) {
  return (
    <section className="section">
      <div className="section-head">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

// ---------- Parameter layer FX (form otomatis dari skema) ----------
export function FxParams({ clip }) {
  const def = FX[clip.fx.kind];
  const assets = useEditor((s) => s.assets);
  const project = useEditor((s) => s.project);
  if (!def) return <p className="warn">Efek "{clip.fx.kind}" tidak dikenal.</p>;
  const p = { ...fxDefaults(clip.fx.kind), ...clip.fx.params };
  const st = useEditor.getState;
  const set = (key, v, history = true) => st().updateClip(clip.id, (c) => { c.fx.params = { ...c.fx.params, [key]: v }; }, { history });
  const images = assets.filter((a) => a.kind === 'image');
  const cutLocal = fxCut(clip, project);

  return (
    <>
      <Section title={`Efek · ${def.label}`}>
        <p className="note">{def.desc}</p>
        {!def.card && <div className="fx-cut">
          <span>Titik potong</span>
          <b>{((clip.start + cutLocal) * 1000).toFixed(0)} ms</b>
          <button
            className="btn sm"
            title="Durasi proyek = akhir stinger, titik potong = bawaan template"
            onClick={() =>
              st().commit((pr) => {
                pr.settings.duration = +(clip.start + clip.duration).toFixed(3);
                pr.settings.cutPoint = +(clip.start + (def.cut / def.duration) * clip.duration).toFixed(3);
              })
            }
          >
            Reset ke bawaan
          </button>
        </div>}
        {Object.entries(def.params).map(([key, s]) => {
          const v = p[key];
          if (s.type === 'number')
            return <NumberField key={key} label={s.label} value={v} step={s.step} decimals={s.step < 1 ? 2 : 0} min={s.min} max={s.max} suffix={s.suffix}
              onBegin={() => st().checkpoint()} onLive={(x) => set(key, x, false)} onCommit={(x) => set(key, x)} />;
          if (s.type === 'color')
            return (
              <label key={key} className="field color inline">
                <span>{s.label}</span>
                <input type="color" value={v} onChange={(e) => set(key, e.target.value)} />
              </label>
            );
          if (s.type === 'select')
            return (
              <label key={key} className="field">
                <span>{s.label}</span>
                <select value={v} onChange={(e) => set(key, e.target.value)}>
                  {Object.entries(s.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            );
          if (s.type === 'font')
            return (
              <label key={key} className="field">
                <span>{s.label}</span>
                <select value={v} onChange={(e) => set(key, e.target.value)}>
                  {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
            );
          if (s.type === 'bool')
            return (
              <label key={key} className="check">
                <input type="checkbox" checked={!!v} onChange={(e) => set(key, e.target.checked)} /> {s.label}
              </label>
            );
          if (s.type === 'text')
            return (
              <label key={key} className="field">
                <span>{s.label}</span>
                <input className="text-in" value={v} onChange={(e) => set(key, e.target.value)} />
              </label>
            );
          if (s.type === 'asset')
            return (
              <label key={key} className="field">
                <span>{s.label}</span>
                <select value={v || ''} onChange={(e) => set(key, e.target.value || null)}>
                  <option value="">(Contoh: YOUR LOGO HERE)</option>
                  {images.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            );
          if (s.type === 'seed')
            return (
              <div key={key} className="row2">
                <NumberField label={s.label} value={v} step={1} decimals={0} min={0} max={99999} onCommit={(x) => set(key, Math.round(x))} />
                <button className="btn sm" onClick={() => set(key, Math.floor(Math.random() * 99999))}>🎲 Acak ulang</button>
              </div>
            );
          return null;
        })}
      </Section>
    </>
  );
}

// ---------- Efek generik untuk layer visual ----------
const BLENDS = {
  'source-over': 'Normal',
  lighter: 'Add (terang)',
  screen: 'Screen',
  multiply: 'Multiply',
  overlay: 'Overlay',
  'soft-light': 'Soft Light',
  difference: 'Difference',
};

export function EffectsSection({ clip, track }) {
  const st = useEditor.getState;
  const fx = clip.effects || {};
  const setFx = (key, patch, history = true) =>
    st().updateClip(clip.id, (c) => {
      c.effects = { ...(c.effects || {}), [key]: typeof patch === 'object' && patch !== null ? { ...((c.effects || {})[key] || {}), ...patch } : patch };
    }, { history });
  const isImage = clip.type === 'image' || clip.type === 'logo';
  const tracks = useEditor((s) => s.project.tracks);
  const idx = tracks.findIndex((t) => t.id === track.id);
  const above = tracks[idx + 1];

  const glowFx = { on: false, color: '#3ddc97', blur: 30, strength: 1, ...(fx.glow || {}) };
  const outline = { on: false, width: 8, color: '#ffffff', ...(fx.outline || {}) };
  const tint = { on: false, color: '#ffffff', ...(fx.tint || {}) };
  const depth = { on: false, size: 16, color: '#0b1a3a', angle: 45, ...(fx.depth || {}) };
  const mb = { on: false, samples: 8, shutter: 180, ...(fx.motionBlur || {}) };

  return (
    <Section title="Efek">
      <label className="field">
        <span>Blend mode</span>
        <select value={fx.blend || 'source-over'} onChange={(e) => setFx('blend', e.target.value === 'source-over' ? undefined : e.target.value)}>
          {Object.entries(BLENDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>

      <div className="fx-block">
        <label className="check"><input type="checkbox" checked={glowFx.on} onChange={(e) => setFx('glow', { ...glowFx, on: e.target.checked })} /> Glow / cahaya</label>
        {glowFx.on && (
          <div className="row3">
            <label className="field color"><input type="color" value={glowFx.color} onChange={(e) => setFx('glow', { color: e.target.value })} /></label>
            <NumberField label="Blur" value={glowFx.blur} step={1} decimals={0} min={0} max={200} onCommit={(v) => setFx('glow', { blur: v })} />
            <NumberField label="Kuat" value={glowFx.strength} step={1} decimals={0} min={1} max={4} onCommit={(v) => setFx('glow', { strength: v })} />
          </div>
        )}
      </div>

      {isImage && (
        <div className="fx-block">
          <label className="check"><input type="checkbox" checked={outline.on} onChange={(e) => setFx('outline', { ...outline, on: e.target.checked })} /> Outline stiker</label>
          {outline.on && (
            <div className="row2">
              <NumberField label="Tebal" value={outline.width} step={1} decimals={0} min={1} max={60} suffix="px" onCommit={(v) => setFx('outline', { width: v })} />
              <label className="field color"><input type="color" value={outline.color} onChange={(e) => setFx('outline', { color: e.target.value })} /></label>
            </div>
          )}
        </div>
      )}

      {isImage && (
        <div className="fx-block">
          <label className="check"><input type="checkbox" checked={tint.on} onChange={(e) => setFx('tint', { ...tint, on: e.target.checked })} /> Warnai ulang (monokrom)</label>
          {tint.on && (
            <label className="field color"><input type="color" value={tint.color} onChange={(e) => setFx('tint', { color: e.target.value })} /></label>
          )}
        </div>
      )}

      <div className="fx-block">
        <label className="check"><input type="checkbox" checked={depth.on} onChange={(e) => setFx('depth', { ...depth, on: e.target.checked })} /> Ketebalan 3D (extrude)</label>
        {depth.on && (
          <>
            <div className="row2">
              <NumberField label="Tebal" value={depth.size} step={1} decimals={0} min={1} max={120} suffix="px" onCommit={(v) => setFx('depth', { size: v })} />
              <label className="field color"><input type="color" value={depth.color} onChange={(e) => setFx('depth', { color: e.target.value })} /></label>
            </div>
            <NumberField label="Arah" value={depth.angle} step={5} decimals={0} min={-180} max={180} suffix="°" title="Diabaikan saat Rotasi 3D (Y) aktif" onCommit={(v) => setFx('depth', { angle: v })} />
          </>
        )}
      </div>

      <div className="fx-block">
        <label className="check"><input type="checkbox" checked={mb.on} onChange={(e) => setFx('motionBlur', { ...mb, on: e.target.checked })} /> Motion blur</label>
        {mb.on && (
          <div className="row2">
            <NumberField label="Sampel" value={mb.samples} step={1} decimals={0} min={2} max={16} onCommit={(v) => setFx('motionBlur', { samples: v })} />
            <NumberField label="Shutter" value={mb.shutter} step={15} decimals={0} min={15} max={720} suffix="°" onCommit={(v) => setFx('motionBlur', { shutter: v })} />
          </div>
        )}
      </div>

      <label className="field">
        <span>Track matte (mask dari layer di atasnya)</span>
        <select
          value={track.matte || ''}
          disabled={!above}
          onChange={(e) => st().commit((p) => { const t = p.tracks.find((x) => x.id === track.id); t.matte = e.target.value || undefined; })}
        >
          <option value="">Tidak ada</option>
          <option value="alpha">Alpha — tampil hanya di dalam layer atas</option>
          <option value="invert">Alpha terbalik — tampil di luar layer atas</option>
        </select>
      </label>
      {track.matte && above && <p className="note">Layer "{above.name}" dipakai sebagai mask dan tidak tampil sendiri.</p>}
    </Section>
  );
}
