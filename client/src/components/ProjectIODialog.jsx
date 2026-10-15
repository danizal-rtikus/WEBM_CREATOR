import React, { useMemo, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { api } from '../api.js';
import { exportProject, estimateMediaBytes, downloadBlob, EMBED_WARN_BYTES } from '../backend/portable.js';
import { fmtBytes } from '../util.js';

const FORMATS = [
  { v: 'embedded', title: 'JSON + media tertanam', desc: 'Satu file .json berisi proyek dan semua media yang dipakai. Paling mudah dipindah.' },
  { v: 'zip', title: 'ZIP (proyek + folder media)', desc: 'Lebih hemat ukuran untuk video besar. Media bisa dibuka terpisah.' },
  { v: 'json', title: 'JSON saja (tanpa media)', desc: 'Kecil, hanya struktur proyek. Media perlu sudah ada / di-upload ulang di perangkat tujuan.' },
];

export default function ProjectIODialog() {
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const mediaBytes = useMemo(() => estimateMediaBytes(project, assets), [project, assets]);
  const [format, setFormat] = useState('embedded');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const close = () => !busy && useEditor.setState({ projectIOOpen: false });

  const run = async () => {
    setError(null);
    setBusy(0);
    try {
      const st = useEditor.getState();
      if (st.saveState !== 'saved') await st.save();
      const { blob, fileName } = await exportProject(api, useEditor.getState().project, assets, format, (p) => setBusy(p));
      downloadBlob(blob, fileName);
      st.notify(`Proyek diekspor: ${fileName} (${fmtBytes(blob.size)})`);
      useEditor.setState({ projectIOOpen: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const big = format === 'embedded' && mediaBytes > EMBED_WARN_BYTES;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" role="dialog" aria-label="Export proyek">
        <div className="modal-head">
          <h2>Export proyek</h2>
          <button className="btn icon ghost" onClick={close} disabled={busy != null} aria-label="Tutup">✕</button>
        </div>
        <p className="muted small">
          Simpan “{project.name}” ke file agar bisa dicadangkan atau dibuka di perangkat / browser lain lewat Proyek ▸ Import proyek.
          Media yang dipakai: {fmtBytes(mediaBytes)}.
        </p>
        <div className="io-formats">
          {FORMATS.map((f) => (
            <label key={f.v} className={`io-format ${format === f.v ? 'on' : ''}`}>
              <input type="radio" name="fmt" value={f.v} checked={format === f.v} onChange={() => setFormat(f.v)} />
              <span>
                <b>{f.title}</b>
                <small>{f.desc}</small>
              </span>
            </label>
          ))}
        </div>
        {big && (
          <p className="warn small">
            Media cukup besar ({fmtBytes(mediaBytes)}). File JSON tertanam akan ±{fmtBytes(mediaBytes * 1.34)} dan lambat dibuka — pertimbangkan format ZIP.
          </p>
        )}
        {error && <p className="error">Export gagal: {error}</p>}
        {busy != null && (
          <div className="bar"><div style={{ width: `${Math.round(busy * 100)}%` }} /></div>
        )}
        <div className="modal-actions">
          <button className="btn ghost" onClick={close} disabled={busy != null}>Batal</button>
          <button className="btn primary" onClick={run} disabled={busy != null || !project.id}>
            {busy != null ? 'Menyiapkan…' : 'Unduh file proyek'}
          </button>
        </div>
      </div>
    </div>
  );
}
