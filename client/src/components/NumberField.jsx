import React, { useEffect, useRef, useState } from 'react';

/**
 * Input angka yang bisa di-scrub: seret label ke kiri/kanan untuk mengubah nilai.
 * onBegin() dipanggil sekali di awal scrub (untuk checkpoint undo),
 * onLive(v) selama scrub, onCommit(v) saat mengetik lalu Enter/blur.
 */
export default function NumberField({ label, value, step = 1, min = -Infinity, max = Infinity, decimals = 1, suffix, onBegin, onLive, onCommit, title }) {
  const [text, setText] = useState(fmt(value, decimals));
  const [focused, setFocused] = useState(false);
  const scrub = useRef(null);

  useEffect(() => {
    if (!focused) setText(fmt(value, decimals));
  }, [value, decimals, focused]);

  const clamp = (v) => Math.min(max, Math.max(min, v));

  const onPointerDown = (e) => {
    e.preventDefault();
    scrub.current = { x: e.clientX, v0: Number(value) || 0, began: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const s = scrub.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.began) {
      if (Math.abs(dx) < 2) return;
      s.began = true;
      onBegin && onBegin();
    }
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const v = clamp(round(s.v0 + dx * step * mult, decimals));
    (onLive || onCommit)(v);
  };
  const onPointerUp = () => {
    scrub.current = null;
  };

  const commit = () => {
    const v = parseFloat(String(text).replace(',', '.'));
    if (Number.isFinite(v)) onCommit(clamp(v));
    else setText(fmt(value, decimals));
  };

  return (
    <label className="numfield" title={title}>
      {label && (
        <span className="scrub" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          {label}
        </span>
      )}
      <input
        value={text}
        inputMode="decimal"
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.target.blur();
          if (e.key === 'Escape') {
            setText(fmt(value, decimals));
            e.target.blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onCommit(clamp(round((Number(value) || 0) + d, decimals)));
          }
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </label>
  );
}

function round(v, d) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

function fmt(v, d) {
  if (v === undefined || v === null || Number.isNaN(v)) return '';
  return String(round(Number(v), d));
}
