import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { api } from '../api.js';
import { fmtBytes } from '../util.js';
import { projectEnd } from '../engine/project.js';

const SPEEDS = [
  { v: 1, label: 'Kualitas tertinggi (lambat)' },
  { v: 2, label: 'Seimbang' },
  { v: 4, label: 'Cepat' },
];

export default function ExportDialog() {
  const project = useEditor((s) => s.project);
  const { width, height, fps, duration, transparent } = project.settings;
  const contentEnd = Math.min(duration, projectEnd(project));
  const hasShorterContent = contentEnd > 0 && contentEnd < duration - 1e-3;
  const [opts, setOpts] = useState({ scale: 1, crf: 30, alpha: transparent, speed: 2, range: hasShorterContent ? 'content' : 'project' });
  const renderDur = opts.range === 'content' && hasShorterContent ? contentEnd : duration;
  const cut = project.settings.cutPoint;
  const cutMs = cut != null && cut < renderDur ? Math.round(cut * 1000) : null;
  const [job, setJob] = useState(null);
  const esRef = useRef(null);

  const pollRef = useRef(null);
  useEffect(
    () => () => {
      if (esRef.current) esRef.current.close();
      clearInterval(pollRef.current);
    },
    [],
  );

  const finished = (s) => s === 'done' || s === 'failed' || s === 'canceled';

  // Cadangan jika koneksi SSE putus: tanya status tiap detik
  const startPolling = (id) => {
    clearInterval(pollRef.current);
    let misses = 0;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/renders/${id}`);
        if (res.status === 404) {
          clearInterval(pollRef.current);
          setJob({ status: 'failed', error: 'Job hilang — server API kemungkinan restart/crash. Lihat jendela terminal "npm run dev" untuk pesan error, lalu coba lagi.' });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        misses = 0;
        const data = await res.json();
        setJob(data);
        if (finished(data.status)) clearInterval(pollRef.current);
      } catch {
        misses += 1;
        if (misses >= 8) {
          clearInterval(pollRef.current);
          setJob({ status: 'failed', error: 'Server API (port 3001) tidak merespons. Periksa jendela terminal "npm run dev" — kemungkinan server berhenti karena error.' });
        }
      }
    }, 1000);
  };

  const close = () => useEditor.setState({ exportOpen: false });
  const busy = job && ['queued', 'preparing', 'rendering', 'muxing'].includes(job.status);

  const start = async () => {
    const st = useEditor.getState();
    if (st.saveState !== 'saved') await st.save();
    try {
      const j = await api.startRender({ projectId: project.id, ...opts, end: renderDur, cutMs: cutMs || undefined });
      setJob(j);
      const es = api.renderEvents(j.id);
      esRef.current = es;
      es.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        setJob(data);
        if (finished(data.status)) es.close();
      };
      es.onerror = () => es.close(); // polling tetap berjalan sebagai cadangan
      startPolling(j.id);
    } catch (e) {
      setJob({ status: 'failed', error: e.message });
    }
  };

  const outW = Math.round((width * opts.scale) / 2) * 2;
  const outH = Math.round((height * opts.scale) / 2) * 2;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && close()}>
      <div className="modal" role="dialog" aria-label="Export WebM">
        <div className="modal-head">
          <h2>Export WebM</h2>
          <button className="btn icon ghost" onClick={close} disabled={busy} aria-label="Tutup">✕</button>
        </div>

        {!job || job.status === 'failed' || job.status === 'canceled' ? (
          <>
            <div className="modal-grid">
              <label className="field">
                <span>Resolusi</span>
                <select value={opts.scale} onChange={(e) => setOpts({ ...opts, scale: Number(e.target.value) })}>
                  {[1, 0.75, 0.5, 0.25].map((s) => (
                    <option key={s} value={s}>
                      {Math.round(s * 100)}% · {Math.round((width * s) / 2) * 2}×{Math.round((height * s) / 2) * 2}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Kecepatan encode</span>
                <select value={opts.speed} onChange={(e) => setOpts({ ...opts, speed: Number(e.target.value) })}>
                  {SPEEDS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
                </select>
              </label>
              <label className="field wide">
                <span>Rentang waktu</span>
                <select value={opts.range} onChange={(e) => setOpts({ ...opts, range: e.target.value })}>
                  {hasShorterContent && <option value="content">Sampai akhir konten · {contentEnd.toFixed(2)} detik</option>}
                  <option value="project">Seluruh durasi proyek · {duration.toFixed(2)} detik</option>
                </select>
              </label>
              <label className="field wide">
                <span>
                  Kualitas (CRF {opts.crf}) — makin kecil makin bagus & makin besar file
                </span>
                <input type="range" min={15} max={45} value={opts.crf} onChange={(e) => setOpts({ ...opts, crf: Number(e.target.value) })} />
              </label>
              <label className="check wide">
                <input type="checkbox" checked={opts.alpha} onChange={(e) => setOpts({ ...opts, alpha: e.target.checked })} />
                Latar transparan (VP9 + alpha, untuk overlay di OBS / web)
              </label>
            </div>
            <p className="muted small">
              {outW}×{outH} · {fps} fps · {renderDur.toFixed(2)} detik · {Math.round(renderDur * fps)} frame · VP9 + Opus
            </p>
            {cutMs != null && (
              <div className="cut-info">
                <span>Transition Point untuk OBS</span>
                <b>{cutMs} ms</b>
                <button className="btn sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(String(cutMs))}>Salin</button>
              </div>
            )}
            {job && job.status === 'failed' && <p className="error">Render gagal: {job.error}</p>}
            <div className="modal-actions">
              <button className="btn ghost" onClick={close}>Batal</button>
              <button className="btn primary" onClick={start} disabled={!project.id}>Mulai render</button>
            </div>
          </>
        ) : (
          <RenderProgress job={job} cutMs={cutMs} onCancel={() => api.cancelRender(job.id).catch((e) => {
            clearInterval(pollRef.current);
            setJob({ status: 'failed', error: `Tidak bisa membatalkan: ${e.message}. Server API kemungkinan restart — jalankan ulang "npm run dev" lalu coba lagi.` });
          })} onClose={close} onAgain={() => setJob(null)} />
        )}
      </div>
    </div>
  );
}

const STATUS = { preparing: 'Menyiapkan video untuk renderer…', queued: 'Dalam antrean…', rendering: 'Merender frame…', muxing: 'Menggabungkan audio…', done: 'Selesai', failed: 'Gagal', canceled: 'Dibatalkan' };

function RenderProgress({ job, cutMs, onCancel, onClose, onAgain }) {
  const pct = Math.round((job.progress || 0) * 100);
  return (
    <div className="render-progress">
      <div className="rp-status">
        <span>{STATUS[job.status] || job.status}</span>
        <span>{pct}%</span>
      </div>
      <div className="bar big"><div style={{ width: `${pct}%` }} /></div>
      {job.status === 'rendering' && job.frame != null && (
        <p className="muted small">Frame {job.frame} / {job.frames}{job.eta ? ` · sisa ±${Math.ceil(job.eta)} detik` : ''}</p>
      )}
      {job.status === 'done' && (
        <>
          <div className="result checker">
            <video src={job.url} controls autoPlay loop muted playsInline />
          </div>
          <p className="muted small">
            {job.fileName} · {fmtBytes(job.size)} · selesai dalam {job.elapsed?.toFixed(1)} detik
            {job.outputPath ? <><br />Tersimpan di: <code>{job.outputPath}</code></> : null}
          </p>
          {cutMs != null && (
            <div className="cut-info">
              <span>OBS → Stinger → Transition Point</span>
              <b>{cutMs} ms</b>
              <button className="btn sm" onClick={() => navigator.clipboard && navigator.clipboard.writeText(String(cutMs))}>Salin</button>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn ghost" onClick={onAgain}>Render lagi</button>
            <a className="btn primary" href={`${job.url}?download=1`} download={job.fileName}>Unduh .webm</a>
            <button className="btn" onClick={onClose}>Tutup</button>
          </div>
        </>
      )}
      {job.note && <p className="muted small">{job.note}</p>}
      {['queued', 'preparing', 'rendering', 'muxing'].includes(job.status) && (
        <div className="modal-actions">
          <button className="btn danger" onClick={onCancel}>Batalkan</button>
        </div>
      )}
    </div>
  );
}
