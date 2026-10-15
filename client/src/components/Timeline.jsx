import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { PROP_LABELS } from '../engine/project.js';
import { shiftKeyframes, KF_EPS } from '../engine/evaluate.js';
import { fmtTime } from '../util.js';
import { addAssetToTimeline, addLogo } from './MediaLibrary.jsx';

const HEADER_W = 184;
const TRACK_H = 44;
const PROP_H = 24;
const SNAP_PX = 8;

const TYPE_ICON = { video: '▶', image: '▣', logo: '◆', text: 'T', audio: '♪', shape: '■', fx: '✦' };

function tickStep(zoom) {
  const steps = [1 / 30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  return steps.find((s) => s * zoom >= 64) || 60;
}

export default function Timeline() {
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const zoom = useEditor((s) => s.zoom);
  const playing = useEditor((s) => s.playing);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const scrollRef = useRef(null);
  const { duration, fps } = project.settings;
  const laneW = Math.max(duration * zoom + 240, 600);
  const tracks = [...project.tracks].map((t, i) => ({ t, i })).reverse(); // track teratas = paling depan

  // Ikuti playhead saat play
  useEffect(() => {
    if (!playing) return;
    const el = scrollRef.current;
    const x = HEADER_W + time * zoom;
    if (x > el.scrollLeft + el.clientWidth - 40 || x < el.scrollLeft + HEADER_W) el.scrollLeft = x - HEADER_W - 40;
  }, [time, playing, zoom]);

  const timeFromEvent = (e) => {
    const el = scrollRef.current;
    const r = el.getBoundingClientRect();
    return (e.clientX - r.left + el.scrollLeft - HEADER_W) / zoom;
  };

  const startScrub = (e) => {
    e.preventDefault();
    useEditor.setState({ playing: false });
    const st = useEditor.getState();
    const snapT = (t) => Math.round(t * fps) / fps;
    st.setTime(snapT(timeFromEvent(e)));
    const move = (ev) => useEditor.getState().setTime(snapT(timeFromEvent(ev)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const z = useEditor.getState().zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
      useEditor.setState({ zoom: Math.min(600, Math.max(10, z)) });
    }
  };

  const onDrop = (e) => {
    const raw = e.dataTransfer.getData('application/x-webm-asset');
    if (!raw) return;
    e.preventDefault();
    const { id, as } = JSON.parse(raw);
    const asset = useEditor.getState().assets.find((a) => a.id === id);
    if (!asset) return;
    const t = Math.max(0, Math.round(timeFromEvent(e) * fps) / fps);
    if (as === 'logo') {
      useEditor.getState().setTime(t);
      addLogo(asset);
    } else addAssetToTimeline(asset, Math.min(t, duration - 0.1));
  };

  const ticks = [];
  const step = tickStep(zoom);
  for (let t = 0; t <= duration + 1e-6; t += step) ticks.push(t);

  return (
    <section className="panel timeline">
      <ResizeHandle />
      <div className="tl-toolbar">
        <span className="tl-title">Timeline</span>
        <span className="muted small">{project.tracks.length} layer</span>
        <div className="spacer" />
        <button className="btn sm ghost" onClick={() => useEditor.getState().splitSelected()} disabled={!selectedClipId}>✂ Split</button>
        <button className="btn sm ghost" onClick={() => useEditor.getState().keyframeAll()} disabled={!selectedClipId}>◆ Keyframe</button>
        <button
          className="btn sm ghost cut-btn"
          title="Jadikan posisi playhead sebagai titik potong (Transition Point OBS)"
          onClick={() => useEditor.getState().commit((p) => { p.settings.cutPoint = +useEditor.getState().time.toFixed(3); })}
        >
          ⌖ Titik potong
        </button>
        {project.settings.cutPoint != null && (
          <button className="btn sm ghost" title="Hapus titik potong" onClick={() => useEditor.getState().commit((p) => { delete p.settings.cutPoint; })}>✕</button>
        )}
        <label className="zoom">
          <span>Zoom</span>
          <input type="range" min={10} max={600} value={zoom} onChange={(e) => useEditor.setState({ zoom: Number(e.target.value) })} />
        </label>
        <button
          className="btn sm ghost"
          onClick={() => {
            const w = scrollRef.current.clientWidth - HEADER_W - 40;
            useEditor.setState({ zoom: Math.max(10, Math.min(600, w / duration)) });
          }}
        >
          Pas
        </button>
      </div>
      <div
        className="tl-scroll"
        ref={scrollRef}
        onWheel={onWheel}
        onDragOver={(e) => e.dataTransfer.types.includes('application/x-webm-asset') && e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="tl-inner" style={{ width: HEADER_W + laneW }}>
          <div className="tl-ruler-row">
            <div className="tl-corner" style={{ width: HEADER_W }}>
              <span className="timecode sm">{fmtTime(time, fps)}</span>
            </div>
            <div className="tl-ruler" style={{ width: laneW }} onPointerDown={startScrub}>
              {ticks.map((t) => (
                <div key={t.toFixed(4)} className="tick" style={{ left: t * zoom }}>
                  <span>{step < 1 ? t.toFixed(step < 0.1 ? 2 : 1) : fmtTime(t, fps).slice(0, 5)}</span>
                </div>
              ))}
              <div className="tl-end" style={{ left: duration * zoom }} title="Akhir proyek" />
              {project.settings.cutPoint != null && <CutMarker cut={project.settings.cutPoint} zoom={zoom} fps={fps} />}
            </div>
          </div>

          {tracks.length === 0 && (
            <div className="tl-empty" style={{ marginLeft: HEADER_W }}>
              Seret media dari library ke sini, atau pilih Teks / Shape / Logo di panel kiri.
            </div>
          )}

          {tracks.map(({ t, i }) => (
            <TrackRows key={t.id} track={t} index={i} zoom={zoom} laneW={laneW} startScrub={startScrub} />
          ))}

          <div className="tl-outside" style={{ left: HEADER_W + duration * zoom, width: Math.max(0, laneW - duration * zoom) }} />
          {project.settings.cutPoint != null && <div className="cut-line" style={{ left: HEADER_W + project.settings.cutPoint * zoom }} />}
          <div className="playhead" style={{ left: HEADER_W + time * zoom }}>
            <div className="playhead-cap" onPointerDown={startScrub} />
          </div>
        </div>
      </div>
    </section>
  );
}

function CutMarker({ cut, zoom, fps }) {
  const onDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const st = useEditor.getState();
    const x0 = e.clientX;
    let moved = false;
    const move = (ev) => {
      if (!moved) {
        moved = true;
        st.checkpoint();
      }
      const t = Math.max(0, Math.min(st.project.settings.duration, Math.round((cut + (ev.clientX - x0) / zoom) * fps) / fps));
      useEditor.getState().mutate((p) => { p.settings.cutPoint = t; });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="cut-marker" style={{ left: cut * zoom }} onPointerDown={onDown} title={`Titik potong (Transition Point): ${Math.round(cut * 1000)} ms — seret untuk mengubah`}>
      CUT {Math.round(cut * 1000)}ms
    </div>
  );
}

function ResizeHandle() {
  const onDown = (e) => {
    e.preventDefault();
    const app = document.querySelector('.app');
    const startY = e.clientY;
    const startH = parseFloat(getComputedStyle(app).getPropertyValue('--tl-h')) || 280;
    const move = (ev) => {
      const h = Math.min(window.innerHeight - 260, Math.max(160, startH - (ev.clientY - startY)));
      app.style.setProperty('--tl-h', `${h}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return <div className="tl-resize" onPointerDown={onDown} title="Seret untuk mengubah tinggi timeline" />;
}

function TrackRows({ track, index, zoom, laneW, startScrub }) {
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const [dropHint, setDropHint] = useState(null);
  const selected = track.clips.find((c) => c.id === selectedClipId);
  const animProps = selected ? Object.keys(selected.keyframes || {}).filter((p) => selected.keyframes[p].length) : [];
  const st = useEditor.getState;

  const toggle = (key) => st().commit((p) => {
    const t = p.tracks.find((x) => x.id === track.id);
    t[key] = !t[key];
  });

  return (
    <>
      <div className={`tl-row ${selected ? 'has-sel' : ''}`} style={{ height: TRACK_H }}>
        <div
          className={`tl-head ${dropHint ? `drop-${dropHint}` : ''}`}
          style={{ width: HEADER_W }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-webm-track', String(index));
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('application/x-webm-track')) return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setDropHint(e.clientY < r.top + r.height / 2 ? 'above' : 'below');
          }}
          onDragLeave={() => setDropHint(null)}
          onDrop={(e) => {
            const from = e.dataTransfer.getData('application/x-webm-track');
            setDropHint(null);
            if (from === '') return;
            e.preventDefault();
            e.stopPropagation();
            const f = Number(from);
            // Baris ditampilkan terbalik: "atas" secara visual = indeks lebih besar
            let to = dropHint === 'above' ? index + 1 : index;
            if (f < to) to -= 1;
            if (f !== to) st().moveTrack(f, Math.max(0, Math.min(st().project.tracks.length - 1, to)));
          }}
        >
          <span className="grip" title="Seret untuk mengubah urutan layer">⋮⋮</span>
          <button className={`tbtn ${track.visible ? '' : 'off'}`} onClick={() => toggle('visible')} title={track.visible ? 'Sembunyikan' : 'Tampilkan'}>
            {track.visible ? '👁' : '◌'}
          </button>
          <button className={`tbtn ${track.locked ? 'on' : ''}`} onClick={() => toggle('locked')} title={track.locked ? 'Buka kunci' : 'Kunci'}>
            {track.locked ? '🔒' : '🔓'}
          </button>
          <span className="tname" title={track.name}>{track.name}</span>
        </div>
        <div
          className="tl-lane"
          style={{ width: laneW }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) {
              st().select(null);
              startScrub(e);
            }
          }}
        >
          {track.clips.map((c) => (
            <ClipBar key={c.id} clip={c} track={track} zoom={zoom} selected={c.id === selectedClipId} />
          ))}
        </div>
      </div>
      {selected &&
        animProps.map((prop) => (
          <div key={prop} className="tl-row prop" style={{ height: PROP_H }}>
            <div className="tl-head prop" style={{ width: HEADER_W }}>
              <span className="prop-name">◆ {PROP_LABELS[prop]}</span>
            </div>
            <div className="tl-lane prop" style={{ width: laneW }}>
              <div className="prop-span" style={{ left: selected.start * zoom, width: selected.duration * zoom }} />
              {selected.keyframes[prop].map((k, i) => (
                <KeyframeDot key={`${prop}-${i}`} clip={selected} prop={prop} kf={k} zoom={zoom} />
              ))}
            </div>
          </div>
        ))}
    </>
  );
}

function snapPoints(project, excludeId) {
  const st = useEditor.getState();
  const pts = [0, st.time, project.settings.duration];
  for (const t of project.tracks) for (const c of t.clips) if (c.id !== excludeId) pts.push(c.start, c.start + c.duration);
  return pts;
}

function snap(v, pts, zoom) {
  let best = v;
  let bestD = SNAP_PX / zoom;
  for (const p of pts) {
    const d = Math.abs(p - v);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function ClipBar({ clip, track, zoom, selected }) {
  const st = useEditor.getState;
  const asset = useEditor((s) => (clip.assetId ? s.assets.find((a) => a.id === clip.assetId) : null));

  const begin = (e, mode) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    st().select(clip.id);
    if (track.locked) return;
    const x0 = e.clientX;
    const c0 = { start: clip.start, duration: clip.duration, inPoint: clip.inPoint || 0 };
    const pts = snapPoints(st().project, clip.id);
    const fps = st().project.settings.fps;
    const maxSrc = asset && asset.duration && (clip.type === 'video' || clip.type === 'audio') ? asset.duration : Infinity;
    let moved = false;
    const move = (ev) => {
      const dt = (ev.clientX - x0) / zoom;
      if (!moved) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        moved = true;
        st().checkpoint();
      }
      const q = (v) => Math.round(v * fps) / fps;
      st().updateClip(
        clip.id,
        (c) => {
          if (mode === 'move') {
            let s = c0.start + dt;
            const sEnd = snap(s + c0.duration, pts, zoom) - c0.duration;
            const sStart = snap(s, pts, zoom);
            s = sStart !== s ? sStart : sEnd;
            c.start = Math.max(0, q(s));
          } else if (mode === 'trim-l') {
            let s = snap(c0.start + dt, pts, zoom);
            s = Math.min(s, c0.start + c0.duration - 1 / fps);
            s = Math.max(s, c0.start - c0.inPoint, 0);
            s = q(s);
            const delta = s - c.start;
            c.start = s;
            c.duration = c0.start + c0.duration - s;
            c.inPoint = Math.max(0, c0.inPoint + (s - c0.start));
            shiftKeyframes(c, -delta);
          } else if (mode === 'trim-r') {
            let end = snap(c0.start + c0.duration + dt, pts, zoom);
            let d = Math.max(1 / fps, end - c0.start);
            d = Math.min(d, maxSrc - c0.inPoint);
            c.duration = q(d);
          }
        },
        { history: false },
      );
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const allKf = new Set();
  for (const p of Object.keys(clip.keyframes || {})) for (const k of clip.keyframes[p]) allKf.add(+k.t.toFixed(3));

  return (
    <div
      className={`clip type-${clip.type} ${selected ? 'sel' : ''} ${track.locked ? 'locked' : ''} ${track.visible ? '' : 'hidden'}`}
      style={{ left: clip.start * zoom, width: Math.max(4, clip.duration * zoom) }}
      onPointerDown={(e) => begin(e, 'move')}
      title={`${clip.name} · ${clip.start.toFixed(2)}s → ${(clip.start + clip.duration).toFixed(2)}s`}
    >
      {clip.type === 'video' && asset && asset.thumbUrl && <div className="clip-thumb" style={{ backgroundImage: `url(${asset.thumbUrl})` }} />}
      {(clip.type === 'image' || clip.type === 'logo') && asset && <div className="clip-thumb contain" style={{ backgroundImage: `url(${asset.url})` }} />}
      <span className="clip-label">
        <span className="clip-ico">{TYPE_ICON[clip.type]}</span>
        {clip.name}
      </span>
      {[...allKf].map((t) => (
        <span key={t} className="clip-kf" style={{ left: t * zoom }} />
      ))}
      <div className="trim l" onPointerDown={(e) => begin(e, 'trim-l')} />
      <div className="trim r" onPointerDown={(e) => begin(e, 'trim-r')} />
    </div>
  );
}

function KeyframeDot({ clip, prop, kf, zoom }) {
  const sel = useEditor((s) => s.selectedKf && s.selectedKf.clipId === clip.id && s.selectedKf.prop === prop && Math.abs(s.selectedKf.t - kf.t) < KF_EPS);
  const st = useEditor.getState;

  const onDown = (e) => {
    e.stopPropagation();
    const fps = st().project.settings.fps;
    useEditor.setState({ selectedKf: { clipId: clip.id, prop, t: kf.t }, selectedClipId: clip.id, playing: false });
    const x0 = e.clientX;
    const t0 = kf.t;
    let curT = t0;
    let moved = false;
    const move = (ev) => {
      if (!moved) {
        if (Math.abs(ev.clientX - x0) < 3) return;
        moved = true;
        st().checkpoint();
      }
      let nt = Math.round((t0 + (ev.clientX - x0) / zoom) * fps) / fps;
      nt = Math.max(0, Math.min(clip.duration, nt));
      const from = curT;
      st().updateClip(
        clip.id,
        (c) => {
          const arr = c.keyframes[prop];
          const i = arr.findIndex((k) => Math.abs(k.t - from) < KF_EPS);
          if (i < 0) return;
          if (arr.some((k, j) => j !== i && Math.abs(k.t - nt) < KF_EPS)) return; // jangan tumpuk
          arr[i].t = nt;
          arr.sort((a, b) => a.t - b.t);
          curT = nt;
        },
        { history: false },
      );
      useEditor.setState({ selectedKf: { clipId: clip.id, prop, t: curT } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) st().setTime(clip.start + t0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <span
      className={`kf-dot ${sel ? 'sel' : ''} ease-${kf.ease || 'linear'}`}
      style={{ left: (clip.start + kf.t) * zoom }}
      onPointerDown={onDown}
      title={`${PROP_LABELS[prop]} @ ${kf.t.toFixed(2)}s · ${kf.ease || 'linear'}`}
    />
  );
}
