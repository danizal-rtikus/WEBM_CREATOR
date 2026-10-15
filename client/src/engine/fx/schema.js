// Pembuat skema parameter FX (dipakai panel Inspector untuk membuat form otomatis).
export const num = (label, def, min, max, step = 1, suffix = '') => ({ type: 'number', label, default: def, min, max, step, suffix });
export const color = (label, def) => ({ type: 'color', label, default: def });
export const sel = (label, def, options) => ({ type: 'select', label, default: def, options });
export const bool = (label, def) => ({ type: 'bool', label, default: def });
export const text = (label, def) => ({ type: 'text', label, default: def });
export const logo = (label = 'Logo') => ({ type: 'asset', label, default: null });
export const seed = (def = 7) => ({ type: 'seed', label: 'Variasi acak', default: def });
export const font = (label, def) => ({ type: 'font', label, default: def });

export const DIRS = { ltr: 'Kiri → kanan', rtl: 'Kanan → kiri', ttb: 'Atas → bawah', btt: 'Bawah → atas' };

export function defaultsOf(schema) {
  return Object.fromEntries(Object.entries(schema).map(([k, v]) => [k, v.default]));
}
