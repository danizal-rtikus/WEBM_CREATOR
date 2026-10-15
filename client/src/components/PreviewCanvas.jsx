import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { drawFrame, clipCorners, hitTest, activeClips } from '../engine/compositor.js';
import { evaluate, evaluateProp, isAnimated, setPropValue } from '../engine/evaluate.js';
import { findClip } from '../engine/project.js';
import { fmtTime } from '../util.js';
import { addAssetToTimeline, addLogo } from './MediaLibrary.jsx';

export default function PreviewCanvas({ pool }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [box, setBox] = useState({ w: 640, h: 360 });
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const playing = useEditor((s) => s.playing);
  const [mediaTick, setMediaTick] = useState(0);
  const { width: W, height: H, fps, duration } = project.settings;

  // Ukuran tampilan yang pas di dalam panel
  useLayoutEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pad = 24;
  const scale = Math.max(0.05, Math.min((box.w - pad * 2) / W, (box.h - pad * 2) / H));
  const dispW = Math.round(W * scale);
  const dispH = Math.round(H * scale);

  useEffect(() => {
    const on = () => setMediaTick((n) => n + 1);
    window.addEventListener('media-change', on);
    return () => window.removeEventListener('media-change', on);
  }, []);

  // Gambar frame
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.round(dispW * dpr);
    const ch = Math.round(dispH * dpr);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    drawFrame(ctx, project, time, pool);
  }, [project, time, pool, dispW, dispH, scale, mediaTick]);

  // Drop aset dari library langsung ke canvas
  const onDrop = (e) => {
    const raw = e.dataTransfer.getData('application/x-webm-asset');
    if (!raw) return;
    e.preventDefault();
    const { id, as } = JSON.parse(raw);
    const asset = useEditor.getState().assets.find((a) => a.id === id);
    if (!asset) return;
    if (as === 'logo') addLogo(asset);
    else addAssetToTimeline(asset);
  };

  return (
    <section className="panel preview">
      <div
        className="stage"
        ref={wrapRef}
        onDragOver={(e) => e.dataTransfer.types.includes('application/x-webm-asset') && e.preventDefault()}
        onDrop={onDrop}
      >
        <div
          className={`frame ${project.settings.transparent ? 'checker' : ''}`}
          style={{ width: dispW, height: dispH }}
        >
          <canvas ref={canvasRef} style={{ width: dispW, height: dispH }} />
          <Overlay pool={pool} scale={scale} dispW={dispW} dispH={dispH} selectedClipId={selectedClipId} playing={playing} />
        </div>
      </div>
      <div className="transport">
        <button className="btn icon" onClick={() => useEditor.getState().setTime(0)} title="Ke awal (Home)">⏮</button>
        <button className="btn icon" onClick={() => useEditor.getState().setTime(time - 1 / fps)} title="Frame sebelumnya (←)">◀︎</button>
        <button className="btn play" onClick={() => useEditor.getState().togglePlay()} title="Play / pause (Spasi)">
          {playing ? '❚❚' : '▶'}
        </button>
        <button className="btn icon" onClick={() => useEditor.getState().setTime(time + 1 / fps)} title="Frame berikutnya (→)">▶︎</button>
        <span className="timecode">
          {fmtTime(time, fps)} <span className="muted">/ {fmtTime(duration, fps)}</span>
        </span>
        <div className="spacer" />
        <span className="muted small linkish" title="Buka Pengaturan proyek" onClick={() => useEditor.setState({ inspectorTab: 'project' })}>
          ⚙ {W}×{H} · {fps} fps · {Math.round(scale * 100)}%
          {project.settings.transparent ? ' · latar transparan' : ''}
        </span>
      </div>
    </section>
  );
}

function Overlay({ pool, scale, dispW, dispH, selectedClipId, playing }) {
  const project = useEditor((s) => s.project);
  const time = useEditor((s) => s.time);
  const svgRef = useRef(null);
  const drag = useRef(null);
  const { width: W, height: H } = project.settings;

  const toProject = useCallback(
    (e) => {
      const r = svgRef.current.getBoundingClientRect();
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    },
    [scale],
  );

  const hit = findClip(project, selectedClipId);
  const sel = hit && hit.clip.type !== 'audio' && hit.clip.type !== 'fx' ? hit.clip : null;
  const active = sel && time >= sel.start && time < sel.start + sel.duration;
  const geo = sel && sel.type !== 'fx' ? clipCorners(sel, Math.min(Math.max(time, sel.start), sel.start + sel.duration - 1e-4), pool, project) : null;
  const hs = 9 / scale; // ukuran handle dalam koordinat proyek

  const onPointerDown = (e) => {
    if (playing) useEditor.setState({ playing: false });
    const st = useEditor.getState();
    const pt = toProject(e);
    const handle = e.target.getAttribute('data-handle');
    let clip = sel;
    if (!handle) {
      // Pilih klip paling atas yang terkena klik
      const list = activeClips(st.project, st.time).filter(({ track }) => !track.locked).reverse();
      const found = list.find(({ clip: c }) => hitTest(c, st.time, pool, pt.x, pt.y, st.project));
      clip = found ? found.clip : null;
      st.select(clip ? clip.id : null);
      if (!clip) return;
    }
    const trackLocked = findClip(st.project, clip.id).track.locked;
    if (trackLocked) return;
    const local = st.time - clip.start;
    if (local < 0 || local > clip.duration) {
      st.notify('Playhead di luar klip — pindahkan playhead ke dalam klip untuk mengedit di canvas.');
      return;
    }
    const p = evaluate(clip, local);
    drag.current = {
      moved: false,
      mode: handle || 'move',
      clipId: clip.id,
      local,
      start: pt,
      p0: p,
      dist0: Math.hypot(pt.x - p.x, pt.y - p.y) || 1,
      ang0: Math.atan2(pt.y - p.y, pt.x - p.x),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const pt = toProject(e);
    const st = useEditor.getState();
    if (!d.moved) {
      if (Math.hypot(pt.x - d.start.x, pt.y - d.start.y) * scale < 2) return;
      d.moved = true;
      st.checkpoint();
    }
    st.updateClip(
      d.clipId,
      (c) => {
        if (d.mode === 'move') {
          let dx = pt.x - d.start.x;
          let dy = pt.y - d.start.y;
          if (e.shiftKey) {
            if (Math.abs(dx) > Math.abs(dy)) dy = 0;
            else dx = 0;
          }
          let nx = d.p0.x + dx;
          let ny = d.p0.y + dy;
          const snap = 8 / scale;
          if (Math.abs(nx - W / 2) < snap) nx = W / 2;
          if (Math.abs(ny - H / 2) < snap) ny = H / 2;
          setPropValue(c, 'x', d.local, Math.round(nx * 10) / 10);
          setPropValue(c, 'y', d.local, Math.round(ny * 10) / 10);
        } else if (d.mode === 'scale') {
          const ratio = Math.hypot(pt.x - d.p0.x, pt.y - d.p0.y) / d.dist0;
          setPropValue(c, 'scaleX', d.local, Math.max(0.01, +(d.p0.scaleX * ratio).toFixed(4)));
          setPropValue(c, 'scaleY', d.local, Math.max(0.01, +(d.p0.scaleY * ratio).toFixed(4)));
        } else if (d.mode === 'rotate') {
          const ang = Math.atan2(pt.y - d.p0.y, pt.x - d.p0.x);
          let deg = d.p0.rotation + ((ang - d.ang0) * 180) / Math.PI;
          if (e.shiftKey) deg = Math.round(deg / 15) * 15;
          setPropValue(c, 'rotation', d.local, Math.round(deg * 10) / 10);
        }
      },
      { history: false },
    );
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  // Jalur motion (posisi beranimasi)
  let path = null;
  if (sel && (isAnimated(sel, 'x') || isAnimated(sel, 'y'))) {
    const steps = Math.max(2, Math.ceil(sel.duration * 30));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * sel.duration;
      pts.push(`${evaluateProp(sel, 'x', t).toFixed(1)},${evaluateProp(sel, 'y', t).toFixed(1)}`);
    }
    const kts = new Set([...(sel.keyframes.x || []), ...(sel.keyframes.y || [])].map((k) => k.t));
    path = (
      <g className="motion-path">
        <polyline points={pts.join(' ')} fill="none" strokeWidth={1.5 / scale} strokeDasharray={`${6 / scale} ${5 / scale}`} />
        {[...kts].map((t) => (
          <circle key={t} cx={evaluateProp(sel, 'x', t)} cy={evaluateProp(sel, 'y', t)} r={4 / scale} />
        ))}
      </g>
    );
  }

  return (
    <svg
      ref={svgRef}
      className="overlay"
      width={dispW}
      height={dispH}
      viewBox={`0 0 ${W} ${H}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {path}
      {geo && (
        <g className={`selection ${active ? '' : 'inactive'}`}>
          <polygon points={geo.pts.map((p) => p.join(',')).join(' ')} fill="none" strokeWidth={1.5 / scale} />
          {active && (
            <>
              {(() => {
                const [a, b] = geo.pts;
                const mx = (a[0] + b[0]) / 2;
                const my = (a[1] + b[1]) / 2;
                const rad = (geo.props.rotation * Math.PI) / 180;
                const flip = geo.props.scaleY < 0 ? -1 : 1;
                const rx = mx + Math.sin(rad) * (28 / scale) * flip;
                const ry = my - Math.cos(rad) * (28 / scale) * flip;
                return (
                  <>
                    <line x1={mx} y1={my} x2={rx} y2={ry} strokeWidth={1.5 / scale} />
                    <circle data-handle="rotate" className="handle rot" cx={rx} cy={ry} r={hs * 0.7} strokeWidth={1.5 / scale} />
                  </>
                );
              })()}
              {geo.pts.map(([x, y], i) => (
                <rect key={i} data-handle="scale" className="handle" x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} strokeWidth={1.5 / scale} />
              ))}
              <circle className="anchor" cx={geo.props.x} cy={geo.props.y} r={3.5 / scale} />
            </>
          )}
        </g>
      )}
    </svg>
  );
}
