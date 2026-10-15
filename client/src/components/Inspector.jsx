import React, { useEffect, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { findClip, ANIMATABLE, PROP_LABELS, CANVAS_PRESETS, FONTS, projectEnd } from '../engine/project.js';
import { evaluateProp, isAnimated, keyframeIndexAt, setPropValue, toggleAnimation, upsertKeyframe, removeKeyframe, KF_EPS } from '../engine/evaluate.js';
import EaseSelect from './EaseSelect.jsx';
import CurveEditor from './CurveEditor.jsx';
import MotionPanel from './MotionPanel.jsx';
import { FxParams, EffectsSection } from './EffectsPanels.jsx';
import { POSITIONS, ANIM_IN, ANIM_OUT, applyLogoPreset, defaultLogoPreset } from '../engine/presets.js';
import { clipSize } from '../engine/compositor.js';
import NumberField from './NumberField.jsx';

// Konversi tampilan: skala & opacity dalam persen
const VIEW = {
  x: { k: 1, step: 1, dec: 1, suffix: 'px' },
  y: { k: 1, step: 1, dec: 1, suffix: 'px' },
  scaleX: { k: 100, step: 0.5, dec: 1, suffix: '%' },
  scaleY: { k: 100, step: 0.5, dec: 1, suffix: '%' },
  rotation: { k: 1, step: 0.5, dec: 1, suffix: '°' },
  rotateY: { k: 1, step: 1, dec: 1, suffix: '°' },
  opacity: { k: 100, step: 0.5, dec: 0, suffix: '%', min: 0, max: 100 },
};

export default function Inspector({ pool }) {
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const project = useEditor((s) => s.project);
  const wanted = useEditor((s) => s.inspectorTab);
  const hit = findClip(project, selectedClipId);
  const canMotion = hit && hit.clip.type !== 'audio' && hit.clip.type !== 'fx';
  const tab = !hit ? 'project' : wanted === 'motion' && !canMotion ? 'layer' : wanted;
  const go = (t) => useEditor.setState({ inspectorTab: t });
  return (
    <aside className="panel inspector">
      <div className="tabs" role="tablist">
        <button role="tab" className={`tab ${tab === 'layer' ? 'on' : ''}`} disabled={!hit} onClick={() => go('layer')} title={hit ? '' : 'Pilih layer di timeline atau canvas'}>
          Layer
        </button>
        <button role="tab" className={`tab ${tab === 'motion' ? 'on' : ''}`} disabled={!canMotion} onClick={() => go('motion')} title={canMotion ? 'Template motion & kurva easing' : 'Pilih layer visual terlebih dahulu'}>
          Motion
        </button>
        <button role="tab" className={`tab ${tab === 'project' ? 'on' : ''}`} onClick={() => go('project')}>
          Proyek
        </button>
      </div>
      {hit && tab !== 'project' && (
        <div className="insp-target">
          <span className={`dot type-${hit.clip.type}`} />
          <span className="insp-target-name">{hit.clip.name}</span>
        </div>
      )}
      <div className="panel-body">
        {tab === 'project' && <ProjectSettings />}
        {tab === 'layer' && <ClipInspector clip={hit.clip} track={hit.track} pool={pool} />}
        {tab === 'motion' && <MotionPanel clip={hit.clip} pool={pool} />}
      </div>
    </aside>
  );
}

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

function ClipInspector({ clip, track, pool }) {
  const time = useEditor((s) => s.time);
  const fps = useEditor((s) => s.project.settings.fps);
  const local = Math.min(Math.max(time - clip.start, 0), clip.duration);
  const st = useEditor.getState;
  const upd = (fn, history = true) => st().updateClip(clip.id, fn, { history });
  const outside = time < clip.start || time > clip.start + clip.duration;

  return (
    <>
      <Section title="Layer">
        <input className="text-in" value={clip.name} onChange={(e) => upd((c, t) => { c.name = e.target.value; t.name = e.target.value; })} />
        <div className="row2">
          <NumberField label="Mulai" value={clip.start} step={1 / fps} decimals={2} suffix="s" min={0}
            onBegin={() => st().checkpoint()} onLive={(v) => upd((c) => { c.start = v; }, false)} onCommit={(v) => upd((c) => { c.start = v; })} />
          <NumberField label="Durasi" value={clip.duration} step={1 / fps} decimals={2} suffix="s" min={0.05}
            onBegin={() => st().checkpoint()} onLive={(v) => upd((c) => { c.duration = v; }, false)} onCommit={(v) => upd((c) => { c.duration = v; })} />
        </div>
        {(clip.type === 'video' || clip.type === 'audio') && (
          <div className="row2">
            <NumberField label="Volume" value={Math.round((clip.volume ?? 1) * 100)} step={1} decimals={0} suffix="%" min={0} max={100}
              onCommit={(v) => upd((c) => { c.volume = v / 100; })} />
            <label className="check">
              <input type="checkbox" checked={!!clip.muted} onChange={(e) => upd((c) => { c.muted = e.target.checked; })} /> Bisukan
            </label>
          </div>
        )}
        <div className="row-actions">
          <button className="btn sm" onClick={() => st().splitSelected()} title="S">Split di playhead</button>
          <button className="btn sm" onClick={() => st().duplicateSelected()} title="Ctrl+D">Duplikat</button>
          <button className="btn sm danger" onClick={() => st().deleteSelected()} title="Delete">Hapus</button>
        </div>
      </Section>

      {clip.type === 'fx' && <FxParams clip={clip} />}
      {clip.type === 'fx' && (
        <Section title="Opacity layer">
          <PropRow clip={clip} prop="opacity" local={local} />
          <SelectedKeyframe clip={clip} />
        </Section>
      )}

      {clip.type !== 'audio' && clip.type !== 'fx' && (
        <Section
          title="Transform & animasi"
          right={<span className="muted small">t = {local.toFixed(2)}s</span>}
        >
          {outside && <p className="warn">Playhead di luar klip — keyframe akan ditempatkan di tepi klip.</p>}
          {ANIMATABLE.map((prop) => (
            <PropRow key={prop} clip={clip} prop={prop} local={local} />
          ))}
          <div className="row2">
            <NumberField label="Anchor X" value={clip.transform.anchorX * 100} step={1} decimals={0} suffix="%"
              onCommit={(v) => upd((c) => { c.transform.anchorX = v / 100; })} />
            <NumberField label="Anchor Y" value={clip.transform.anchorY * 100} step={1} decimals={0} suffix="%"
              onCommit={(v) => upd((c) => { c.transform.anchorY = v / 100; })} />
          </div>
          <label className="check">
            <input type="checkbox" checked={clip.scaleLinked !== false} onChange={(e) => upd((c) => { c.scaleLinked = e.target.checked; })} />
            Kunci rasio skala (X = Y)
          </label>
          <SelectedKeyframe clip={clip} />
        </Section>
      )}

      {clip.type !== 'audio' && clip.type !== 'fx' && <EffectsSection clip={clip} track={track} />}
      {clip.type === 'text' && <TextSection clip={clip} upd={upd} />}
      {clip.type === 'shape' && <ShapeSection clip={clip} upd={upd} />}
      {(clip.type === 'logo' || clip.type === 'image') && <LogoSection clip={clip} pool={pool} />}
      {track.locked && <p className="warn">Track ini terkunci — buka kunci di timeline untuk mengedit di canvas.</p>}
    </>
  );
}

function PropRow({ clip, prop, local }) {
  const st = useEditor.getState;
  const view = VIEW[prop];
  const animated = isAnimated(clip, prop);
  const kIdx = keyframeIndexAt(clip, prop, local);
  const onKf = kIdx >= 0;
  const value = evaluateProp(clip, prop, local);
  const kfs = (clip.keyframes && clip.keyframes[prop]) || [];
  const prev = [...kfs].reverse().find((k) => k.t < local - KF_EPS);
  const next = kfs.find((k) => k.t > local + KF_EPS);

  const apply = (c, raw) => {
    const v = raw / view.k;
    const linked = c.scaleLinked !== false && (prop === 'scaleX' || prop === 'scaleY');
    if (linked) {
      const other = prop === 'scaleX' ? 'scaleY' : 'scaleX';
      const old = evaluateProp(c, prop, local);
      const o = evaluateProp(c, other, local);
      const nv = Math.abs(old) > 1e-6 ? o * (v / old) : v;
      setPropValue(c, other, local, +nv.toFixed(4));
    }
    setPropValue(c, prop, local, +v.toFixed(4));
  };

  return (
    <div className={`prop-row ${animated ? 'animated' : ''}`}>
      <button
        className={`stopwatch ${animated ? 'on' : ''}`}
        title={animated ? 'Matikan animasi properti ini' : 'Aktifkan animasi (buat keyframe di playhead)'}
        onClick={() => st().updateClip(clip.id, (c) => toggleAnimation(c, prop, local))}
      >
        ⏱
      </button>
      <NumberField
        label={PROP_LABELS[prop]}
        value={value * view.k}
        step={view.step}
        decimals={view.dec}
        suffix={view.suffix}
        min={view.min}
        max={view.max}
        onBegin={() => st().checkpoint()}
        onLive={(v) => st().updateClip(clip.id, (c) => apply(c, v), { history: false })}
        onCommit={(v) => st().updateClip(clip.id, (c) => apply(c, v))}
      />
      <div className="kf-nav">
        <button className="nav" disabled={!prev} onClick={() => prev && st().setTime(clip.start + prev.t)} title="Keyframe sebelumnya">‹</button>
        <button
          className={`diamond ${onKf ? 'on' : ''}`}
          title={onKf ? 'Hapus keyframe di playhead' : 'Tambah keyframe di playhead'}
          onClick={() =>
            st().updateClip(clip.id, (c) => {
              if (!isAnimated(c, prop)) toggleAnimation(c, prop, local);
              else if (keyframeIndexAt(c, prop, local) >= 0) removeKeyframe(c, prop, local);
              else upsertKeyframe(c, prop, local, evaluateProp(c, prop, local));
            })
          }
        >
          ◆
        </button>
        <button className="nav" disabled={!next} onClick={() => next && st().setTime(clip.start + next.t)} title="Keyframe berikutnya">›</button>
      </div>
      {onKf && kIdx < kfs.length - 1 && (
        <EaseSelect
          className="ease-select"
          value={kfs[kIdx].ease || 'linear'}
          title="Easing menuju keyframe berikutnya"
          onChange={(v) => st().updateClip(clip.id, (c) => { c.keyframes[prop][kIdx].ease = v; delete c.keyframes[prop][kIdx].bez; })}
        />
      )}
    </div>
  );
}

function SelectedKeyframe({ clip }) {
  const sk = useEditor((s) => s.selectedKf);
  if (!sk || sk.clipId !== clip.id) return null;
  const kfs = (clip.keyframes && clip.keyframes[sk.prop]) || [];
  const idx = kfs.findIndex((k) => Math.abs(k.t - sk.t) < KF_EPS);
  if (idx < 0) return null;
  const k = kfs[idx];
  const st = useEditor.getState;
  const view = VIEW[sk.prop];
  return (
    <div className="kf-box">
      <div className="kf-title">◆ Keyframe terpilih · {PROP_LABELS[sk.prop]}</div>
      <div className="row2">
        <NumberField label="Waktu" value={k.t} step={0.01} decimals={2} suffix="s" min={0} max={clip.duration}
          onCommit={(v) => {
            st().updateClip(clip.id, (c) => {
              const arr = c.keyframes[sk.prop];
              arr[idx].t = v;
              arr.sort((a, b) => a.t - b.t);
            });
            useEditor.setState({ selectedKf: { ...sk, t: v } });
          }} />
        <NumberField label="Nilai" value={k.v * view.k} step={view.step} decimals={view.dec} suffix={view.suffix}
          onCommit={(v) => st().updateClip(clip.id, (c) => { c.keyframes[sk.prop][idx].v = v / view.k; })} />
      </div>
      {idx < kfs.length - 1 ? (
        <>
          <label className="field">
            <span>Easing ke keyframe berikutnya</span>
            <EaseSelect value={k.ease || 'linear'} onChange={(v) => st().updateClip(clip.id, (c) => { c.keyframes[sk.prop][idx].ease = v; delete c.keyframes[sk.prop][idx].bez; })} />
          </label>
          <CurveEditor
            compact
            value={{ ease: k.ease || 'linear', bez: k.bez }}
            onChange={(v) => st().updateClip(clip.id, (c) => { c.keyframes[sk.prop][idx].ease = v.ease; c.keyframes[sk.prop][idx].bez = v.bez; }, { history: false })}
          />
        </>
      ) : (
        <p className="muted small">Ini keyframe terakhir. Kurva easing diatur pada keyframe sebelumnya (berlaku dari keyframe itu menuju keyframe ini).</p>
      )}
      <button className="btn sm danger" onClick={() => st().deleteSelected()}>Hapus keyframe</button>
    </div>
  );
}

function TextSection({ clip, upd }) {
  const t = clip.text;
  const set = (patch) => upd((c) => Object.assign(c.text, patch));
  return (
    <Section title="Teks">
      <textarea className="text-in" rows={3} value={t.content} onChange={(e) => set({ content: e.target.value })} />
      <div className="row2">
        <label className="field">
          <span>Font</span>
          <select value={t.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            {FONTS.map((f) => (
              <option key={f} value={f} style={{ fontFamily: `"${f}", sans-serif` }}>{f}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tebal</span>
          <select value={t.fontWeight} onChange={(e) => set({ fontWeight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row2">
        <NumberField label="Ukuran" value={t.fontSize} step={1} decimals={0} suffix="px" min={4} onCommit={(v) => set({ fontSize: v })} />
        <label className="field color">
          <span>Warna</span>
          <input type="color" value={t.color} onChange={(e) => set({ color: e.target.value })} />
        </label>
      </div>
      <div className="row2">
        <NumberField label="Spasi huruf" value={t.letterSpacing} step={0.5} decimals={1} suffix="px" onCommit={(v) => set({ letterSpacing: v })} />
        <NumberField label="Tinggi baris" value={t.lineHeight} step={0.05} decimals={2} min={0.5} onCommit={(v) => set({ lineHeight: v })} />
      </div>
      <div className="seg">
        {['left', 'center', 'right'].map((a) => (
          <button key={a} className={t.align === a ? 'on' : ''} onClick={() => set({ align: a })}>
            {a === 'left' ? 'Kiri' : a === 'center' ? 'Tengah' : 'Kanan'}
          </button>
        ))}
      </div>
      <div className="row2">
        <NumberField label="Stroke" value={t.strokeWidth} step={0.5} decimals={1} min={0} suffix="px" onCommit={(v) => set({ strokeWidth: v })} />
        <label className="field color">
          <span>Warna stroke</span>
          <input type="color" value={t.strokeColor} onChange={(e) => set({ strokeColor: e.target.value })} />
        </label>
      </div>
      <div className="row2">
        <label className="check">
          <input type="checkbox" checked={t.shadow} onChange={(e) => set({ shadow: e.target.checked })} /> Bayangan
        </label>
        {t.shadow && <NumberField label="Blur" value={t.shadowBlur} step={1} decimals={0} min={0} onCommit={(v) => set({ shadowBlur: v })} />}
      </div>
      <div className="row2">
        <label className="check">
          <input type="checkbox" checked={t.bgEnabled} onChange={(e) => set({ bgEnabled: e.target.checked })} /> Kotak latar
        </label>
        {t.bgEnabled && (
          <label className="field color">
            <span>Warna</span>
            <input type="color" value={t.bgColor} onChange={(e) => set({ bgColor: e.target.value })} />
          </label>
        )}
      </div>
      {t.bgEnabled && <NumberField label="Padding" value={t.bgPadding} step={1} decimals={0} min={0} suffix="px" onCommit={(v) => set({ bgPadding: v })} />}
    </Section>
  );
}

function ShapeSection({ clip, upd }) {
  const s = clip.shape;
  const set = (patch) => upd((c) => Object.assign(c.shape, patch));
  return (
    <Section title="Shape">
      <label className="field">
        <span>Jenis</span>
        <select value={s.kind} onChange={(e) => set({ kind: e.target.value })}>
          {[['rect', 'Persegi / rounded'], ['ellipse', 'Elips / lingkaran'], ['ring', 'Cincin (ring)'], ['polygon', 'Poligon'], ['star', 'Bintang']].map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </label>
      {s.kind === 'ring' && <NumberField label="Tebal cincin" value={s.thickness ?? 20} step={1} decimals={0} min={1} suffix="px" onCommit={(v) => set({ thickness: v })} />}
      {s.kind === 'polygon' && <NumberField label="Jumlah sisi" value={s.sides ?? 6} step={1} decimals={0} min={3} max={24} onCommit={(v) => set({ sides: v })} />}
      {s.kind === 'star' && (
        <div className="row2">
          <NumberField label="Sudut" value={s.points ?? 5} step={1} decimals={0} min={3} max={24} onCommit={(v) => set({ points: v })} />
          <NumberField label="Dalam" value={(s.inner ?? 0.45) * 100} step={1} decimals={0} min={5} max={95} suffix="%" onCommit={(v) => set({ inner: v / 100 })} />
        </div>
      )}
      <div className="row2">
        <NumberField label="Lebar" value={s.width} step={1} decimals={0} min={1} suffix="px" onCommit={(v) => set({ width: v })} />
        <NumberField label="Tinggi" value={s.height} step={1} decimals={0} min={1} suffix="px" onCommit={(v) => set({ height: v })} />
      </div>
      <div className="row2">
        <label className="field color">
          <span>Isi</span>
          <input type="color" value={s.fill} onChange={(e) => set({ fill: e.target.value })} />
        </label>
        {s.kind === 'rect' && <NumberField label="Radius" value={s.radius} step={1} decimals={0} min={0} suffix="px" onCommit={(v) => set({ radius: v })} />}
      </div>
      <label className="field">
        <span>Isian</span>
        <select value={s.fillType || 'solid'} onChange={(e) => set({ fillType: e.target.value, fill2: s.fill2 || '#0ea5e9' })}>
          <option value="solid">Warna solid</option>
          <option value="linear">Gradasi linear</option>
          <option value="radial">Gradasi radial</option>
        </select>
      </label>
      {s.fillType && s.fillType !== 'solid' && (
        <div className="row2">
          <label className="field color">
            <span>Warna 2</span>
            <input type="color" value={s.fill2 || '#0ea5e9'} onChange={(e) => set({ fill2: e.target.value })} />
          </label>
          {s.fillType === 'linear' && <NumberField label="Sudut" value={s.gradAngle ?? 0} step={5} decimals={0} min={-180} max={180} suffix="°" onCommit={(v) => set({ gradAngle: v })} />}
        </div>
      )}
    </Section>
  );
}

function LogoSection({ clip, pool }) {
  const [preset, setPreset] = useState(clip.preset || defaultLogoPreset());
  useEffect(() => {
    setPreset(clip.preset || defaultLogoPreset());
  }, [clip.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (patch) => {
    const next = { ...preset, ...patch };
    setPreset(next);
    const st = useEditor.getState();
    st.updateClip(clip.id, (c) => {
      c.type = 'logo';
      applyLogoPreset(c, next, clipSize(c, pool), st.project.settings);
    });
  };

  const LABELS = {
    'top-left': '↖', 'top-center': '↑', 'top-right': '↗',
    'middle-left': '←', center: '•', 'middle-right': '→',
    'bottom-left': '↙', 'bottom-center': '↓', 'bottom-right': '↘',
  };

  return (
    <Section title="Logo & watermark">
      <p className="note">Preset menimpa keyframe posisi, skala, rotasi, dan opacity. Setelah diterapkan, semuanya tetap bisa diedit.</p>
      <div className="pos-wrap">
        <div className="pos-grid" role="group" aria-label="Posisi logo">
          {POSITIONS.map((p) => (
            <button key={p} className={preset.position === p && clip.preset ? 'on' : ''} onClick={() => apply({ position: p })} title={p}>
              {LABELS[p]}
            </button>
          ))}
        </div>
        <div className="pos-fields">
          <NumberField label="Margin" value={preset.margin} step={1} decimals={0} min={0} suffix="px" onCommit={(v) => apply({ margin: v })} />
          <NumberField label="Lebar" value={preset.sizePct} step={0.5} decimals={1} min={1} max={100} suffix="%" title="Lebar logo terhadap lebar canvas" onCommit={(v) => apply({ sizePct: v })} />
        </div>
      </div>
      <div className="row2">
        <label className="field">
          <span>Animasi masuk</span>
          <select value={preset.animIn} onChange={(e) => apply({ animIn: e.target.value })}>
            {Object.entries(ANIM_IN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Animasi keluar</span>
          <select value={preset.animOut} onChange={(e) => apply({ animOut: e.target.value })}>
            {Object.entries(ANIM_OUT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <NumberField label="Durasi animasi" value={preset.animDuration} step={0.05} decimals={2} min={0} suffix="s" onCommit={(v) => apply({ animDuration: v })} />
      <div className="row2">
        <label className="check">
          <input type="checkbox" checked={preset.watermark} onChange={(e) => apply({ watermark: e.target.checked })} />
          Watermark (sepanjang video)
        </label>
        {preset.watermark && (
          <NumberField label="Opacity" value={preset.watermarkOpacity * 100} step={1} decimals={0} min={0} max={100} suffix="%" onCommit={(v) => apply({ watermarkOpacity: v / 100 })} />
        )}
      </div>
      <button className="btn sm" onClick={() => apply({})}>Terapkan ulang preset</button>
    </Section>
  );
}

function FitDuration({ duration, commit }) {
  const project = useEditor((st) => st.project);
  const end = Math.round(projectEnd(project) * 100) / 100;
  if (!end || Math.abs(end - duration) < 0.01) return null;
  return (
    <button className="btn sm" onClick={() => commit({ duration: end })} title="Durasi proyek = akhir klip terakhir">
      Samakan durasi dengan konten ({end.toFixed(2)} s)
    </button>
  );
}

function ProjectSettings() {
  const s = useEditor((st) => st.project.settings);
  const commit = (patch) => useEditor.getState().commit((p) => Object.assign(p.settings, patch));
  const presetIdx = CANVAS_PRESETS.findIndex((p) => p.width === s.width && p.height === s.height);
  return (
    <>
      <Section title="Canvas">
        <label className="field">
          <span>Ukuran</span>
          <select
            value={presetIdx}
            onChange={(e) => {
              const p = CANVAS_PRESETS[Number(e.target.value)];
              if (p) commit({ width: p.width, height: p.height });
            }}
          >
            {presetIdx < 0 && <option value={-1}>Custom · {s.width}×{s.height}</option>}
            {CANVAS_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </select>
        </label>
        <div className="row2">
          <NumberField label="Lebar" value={s.width} step={2} decimals={0} min={16} max={7680} suffix="px" onCommit={(v) => commit({ width: Math.round(v / 2) * 2 })} />
          <NumberField label="Tinggi" value={s.height} step={2} decimals={0} min={16} max={7680} suffix="px" onCommit={(v) => commit({ height: Math.round(v / 2) * 2 })} />
        </div>
        <div className="row2">
          <label className="field">
            <span>FPS</span>
            <select value={s.fps} onChange={(e) => commit({ fps: Number(e.target.value) })}>
              {[24, 25, 30, 50, 60].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <NumberField label="Durasi" value={s.duration} step={0.1} decimals={2} min={0.1} max={300} suffix="s" onCommit={(v) => commit({ duration: v })} />
        </div>
        <FitDuration duration={s.duration} commit={commit} />
      </Section>
      <Section title="Latar">
        <label className="check">
          <input type="checkbox" checked={s.transparent} onChange={(e) => commit({ transparent: e.target.checked })} />
          Latar transparan (export WebM dengan alpha)
        </label>
        {!s.transparent && (
          <label className="field color">
            <span>Warna latar</span>
            <input type="color" value={s.background} onChange={(e) => commit({ background: e.target.value })} />
          </label>
        )}
      </Section>
      <Section title="Tips">
        <ul className="tips">
          <li>Seret media dari library ke timeline atau canvas.</li>
          <li>Klik ⏱ pada properti untuk mulai animasi, lalu pindahkan playhead dan ubah nilainya — keyframe dibuat otomatis.</li>
          <li>Tab <b>Logo</b> menambahkan logo dengan preset posisi & animasi.</li>
          <li>Shift saat drag: kunci sumbu / sudut 15°.</li>
        </ul>
      </Section>
    </>
  );
}
