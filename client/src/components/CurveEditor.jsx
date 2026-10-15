import React, { useEffect, useRef } from 'react';
import { ease, bezierOf, BEZIER_PRESETS, CLASSIC_LABELS } from '../engine/easing.js';

// Editor kurva easing (cubic-bezier) dengan dua handle yang bisa diseret
// dan bola pratinjau yang bergerak mengikuti kurva.
const W = 240;
const H = 200;
const X0 = 24;
const X1 = W - 16;
const Y0 = 150; // nilai 0
const Y1 = 50; // nilai 1
const sx = (x) => X0 + x * (X1 - X0);
const sy = (v) => Y0 - v * (Y0 - Y1);
const ix = (px) => (px - X0) / (X1 - X0);
const iy = (py) => (Y0 - py) / (Y0 - Y1);

export default function CurveEditor({ value, onChange, compact = false }) {
  const svgRef = useRef(null);
  const ballRef = useRef(null);
  const dotRef = useRef(null);
  const { ease: name = 'smooth', bez } = value || {};
  const b = bezierOf(name, bez);

  // Bola pratinjau
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const cycle = 1600;
      const raw = ((now - start) % (cycle + 500)) / cycle;
      const x = Math.min(1, raw);
      const v = ease(name, x, bez);
      if (ballRef.current) ballRef.current.setAttribute('cx', String(sx(v)));
      if (dotRef.current) {
        dotRef.current.setAttribute('cx', String(sx(x)));
        dotRef.current.setAttribute('cy', String(sy(v)));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [name, bez]);

  // Path kurva (sampling, berlaku juga untuk easing non-bezier)
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const x = i / 60;
    pts.push(`${sx(x).toFixed(1)},${sy(ease(name, x, bez)).toFixed(1)}`);
  }

  const startDrag = (handle) => (e) => {
    e.preventDefault();
    const cur = b ? [...b] : [0.33, 0, 0.67, 1];
    const move = (ev) => {
      const r = svgRef.current.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const py = ((ev.clientY - r.top) / r.height) * H;
      const x = Math.min(1, Math.max(0, ix(px)));
      const y = Math.min(2, Math.max(-1, iy(py)));
      if (handle === 1) {
        cur[0] = +x.toFixed(3);
        cur[1] = +y.toFixed(3);
      } else {
        cur[2] = +x.toFixed(3);
        cur[3] = +y.toFixed(3);
      }
      onChange({ ease: 'bezier', bez: [...cur] });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const label = name === 'bezier' ? 'Kurva kustom' : BEZIER_PRESETS[name]?.label || CLASSIC_LABELS[name] || name;

  return (
    <div className={`curve-editor ${compact ? 'compact' : ''}`}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="curve-svg">
        <rect x={X0} y={Y1} width={X1 - X0} height={Y0 - Y1} className="curve-box" />
        <line x1={X0} y1={sy(0.5)} x2={X1} y2={sy(0.5)} className="curve-grid" />
        <line x1={sx(0.5)} y1={Y1} x2={sx(0.5)} y2={Y0} className="curve-grid" />
        <line x1={X0} y1={Y0} x2={X1} y2={Y1} className="curve-diag" />
        {b && (
          <>
            <line x1={sx(0)} y1={sy(0)} x2={sx(b[0])} y2={sy(b[1])} className="curve-arm" />
            <line x1={sx(1)} y1={sy(1)} x2={sx(b[2])} y2={sy(b[3])} className="curve-arm" />
          </>
        )}
        <polyline points={pts.join(' ')} className="curve-path" />
        <circle ref={dotRef} r="3.5" className="curve-dot" cx={sx(0)} cy={sy(0)} />
        {b && (
          <>
            <circle cx={sx(b[0])} cy={sy(b[1])} r="7" className="curve-handle" onPointerDown={startDrag(1)} />
            <circle cx={sx(b[2])} cy={sy(b[3])} r="7" className="curve-handle" onPointerDown={startDrag(2)} />
          </>
        )}
        <line x1={X0} y1={182} x2={X1} y2={182} className="curve-track" />
        <circle ref={ballRef} cx={sx(0)} cy={182} r="6" className="curve-ball" />
        <text x={X0} y={18} className="curve-label">{label}</text>
        <text x={X0} y={36} className="curve-code">
          {b ? `cubic-bezier(${b.map((n) => +n.toFixed(2)).join(', ')})` : ''}
        </text>
      </svg>
      {!b && <p className="muted small">Easing ini bukan kurva bezier. Pilih kurva di menu agar bisa diedit dengan handle.</p>}
      {b && !compact && <p className="muted small">Seret dua titik putih untuk membentuk kurva sendiri.</p>}
    </div>
  );
}
