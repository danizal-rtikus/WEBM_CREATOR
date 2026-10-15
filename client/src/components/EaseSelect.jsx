import React from 'react';
import { BEZIER_PRESETS, CLASSIC_LABELS } from '../engine/easing.js';

/** Dropdown easing dengan grup: kurva halus (bezier) dan klasik. */
export default function EaseSelect({ value, onChange, className = '', title }) {
  return (
    <select className={className} value={value || 'linear'} title={title} onChange={(e) => onChange(e.target.value)}>
      <optgroup label="Kurva halus (bezier)">
        {Object.entries(BEZIER_PRESETS).map(([k, v]) => (
          <option key={k} value={k}>{v.label}</option>
        ))}
        {value === 'bezier' && <option value="bezier">Kurva kustom</option>}
      </optgroup>
      <optgroup label="Klasik">
        {Object.entries(CLASSIC_LABELS).map(([k, l]) => (
          <option key={k} value={k}>{l}</option>
        ))}
      </optgroup>
    </select>
  );
}
