import React, { useEffect, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { MOTIONS, MOTION_GROUPS, applyMotion, clearMotion } from '../engine/motions.js';
import { clipSize } from '../engine/compositor.js';
import NumberField from './NumberField.jsx';
import EaseSelect from './EaseSelect.jsx';
import CurveEditor from './CurveEditor.jsx';

const STORE_KEY = 'webm-editor:motion-opts';

function loadOpts() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY));
    if (v && typeof v === 'object') return v;
  } catch {
    /* noop */
  }
  return null;
}

export default function MotionPanel({ clip, pool }) {
  const [opts, setOpts] = useState(
    () => loadOpts() || { group: 'in', useDefault: true, duration: 0.8, intensity: 100, ease: 'smooth', bez: null, autoPlay: true },
  );
  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(opts));
    } catch {
      /* noop */
    }
  }, [opts]);
  const set = (patch) => setOpts((o) => ({ ...o, ...patch }));
  const list = MOTIONS.filter((m) => m.group === opts.group);
  const group = MOTION_GROUPS.find((g) => g.id === opts.group);
  const hasAnim = Object.keys(clip.keyframes || {}).length > 0;

  const apply = (m) => {
    const st = useEditor.getState();
    const local = st.time - clip.start;
    let result = null;
    st.updateClip(clip.id, (c) => {
      result = applyMotion(
        c,
        m,
        {
          duration: opts.useDefault ? m.d : opts.duration,
          intensity: opts.intensity / 100,
          ease: opts.ease,
          bez: opts.bez,
          at: local,
        },
        clipSize(c, pool),
        st.project.settings,
      );
    });
    if (!result) return;
    const [w0, w1] = result.window;
    st.notify(`"${m.label}" diterapkan · ${(clip.start + w0).toFixed(2)}–${(clip.start + w1).toFixed(2)} s`);
    if (opts.autoPlay) {
      // Putar pratinjau dari awal jendela animasi
      useEditor.setState({ time: clip.start + Math.max(0, w0 - 0.1), playing: false, selectedKf: null });
      setTimeout(() => useEditor.setState({ playing: true }), 30);
    }
  };

  return (
    <>
      <section className="section">
        <div className="seg">
          {MOTION_GROUPS.map((g) => (
            <button key={g.id} className={opts.group === g.id ? 'on' : ''} onClick={() => set({ group: g.id })}>
              {g.label}
            </button>
          ))}
        </div>
        <p className="note">{group.hint}.</p>
        <div className="motion-grid">
          {list.map((m) => (
            <button key={m.id} className="motion-btn" onClick={() => apply(m)} title={`Terapkan ${m.label}`}>
              <span className={`mi mi-${m.icon}`}>
                <i />
              </span>
              <span className="motion-name">{m.label}</span>
              <span className="motion-dur">{(opts.useDefault ? m.d : opts.duration).toFixed(1)}s</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span>Pengaturan template</span>
        </div>
        <div className="row2">
          <label className="check">
            <input type="checkbox" checked={opts.useDefault} onChange={(e) => set({ useDefault: e.target.checked })} />
            Durasi bawaan
          </label>
          {!opts.useDefault && (
            <NumberField label="Durasi" value={opts.duration} step={0.05} decimals={2} min={0.1} max={60} suffix="s" onCommit={(v) => set({ duration: v })} />
          )}
        </div>
        <NumberField label="Intensitas" value={opts.intensity} step={1} decimals={0} min={10} max={400} suffix="%" title="Jarak geser, besar skala, sudut goyang" onCommit={(v) => set({ intensity: v })} />
        <label className="field">
          <span>Kurva easing</span>
          <EaseSelect value={opts.ease} onChange={(v) => set({ ease: v, bez: null })} />
        </label>
        <CurveEditor value={{ ease: opts.ease, bez: opts.bez }} onChange={(v) => set(v)} />
        <label className="check">
          <input type="checkbox" checked={opts.autoPlay} onChange={(e) => set({ autoPlay: e.target.checked })} />
          Putar pratinjau setelah diterapkan
        </label>
      </section>

      <section className="section">
        <div className="section-head">
          <span>Animasi layer ini</span>
        </div>
        <p className="note">
          Template menimpa keyframe di rentang waktunya saja, jadi Masuk + Penekanan + Keluar bisa digabung.
          Loop menimpa properti yang sama di seluruh klip.
        </p>
        <button
          className="btn sm danger"
          disabled={!hasAnim}
          onClick={() => {
            const st = useEditor.getState();
            st.updateClip(clip.id, (c) => clearMotion(c, Math.min(Math.max(st.time - c.start, 0), c.duration)));
            st.notify('Semua keyframe layer ini dihapus.');
          }}
        >
          Hapus semua animasi
        </button>
      </section>
    </>
  );
}
