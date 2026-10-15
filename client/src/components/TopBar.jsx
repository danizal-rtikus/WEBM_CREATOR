import React, { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { api } from '../api.js';
import { importProject } from '../backend/portable.js';
import { fmtBytes } from '../util.js';

const SAVE_LABEL = { saved: 'Tersimpan', dirty: 'Belum tersimpan', saving: 'Menyimpan…', error: 'Gagal simpan' };

export default function TopBar() {
  const name = useEditor((s) => s.project.name);
  const saveState = useEditor((s) => s.saveState);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [menu, setMenu] = useState(false);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>◆</span>
        <span>WEBM Editor</span>
      </div>
      <div className="project-switch">
        <button className="btn ghost" onClick={() => setMenu((m) => !m)} title="Daftar proyek">
          Proyek ▾
        </button>
        {menu && <ProjectMenu onClose={() => setMenu(false)} />}
      </div>
      <input
        className="project-name"
        value={name}
        onChange={(e) => useEditor.getState().commit((p) => { p.name = e.target.value; })}
        aria-label="Nama proyek"
      />
      <div className="topbar-group">
        <button className="btn icon" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Undo (Ctrl+Z)">↶</button>
        <button className="btn icon" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>
      <span className={`save-state ${saveState}`}>{SAVE_LABEL[saveState]}</span>
      <ModeBadge />
      <div className="spacer" />
      <span className="hint">Spasi play · S split · Alt+K keyframe · Del hapus</span>
      <button className="btn primary" onClick={() => useEditor.setState({ exportOpen: true, playing: false })}>
        Export WebM
      </button>
    </header>
  );
}

function ModeBadge() {
  const mode = useEditor((s) => s.backendMode);
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    if (mode === 'browser' && api.storageEstimate) api.storageEstimate().then(setUsage);
  }, [mode]);
  if (!mode) return null;
  const tip =
    mode === 'browser'
      ? `Proyek & media disimpan di browser ini (IndexedDB), tidak dikirim ke server mana pun.${usage ? ` Terpakai ${fmtBytes(usage.usage || 0)} dari ±${fmtBytes(usage.quota || 0)}.` : ''} Gunakan Proyek ▸ Export proyek untuk cadangan / pindah perangkat.`
      : 'Terhubung ke server lokal (Node.js + FFmpeg). Proyek & media disimpan di folder data/.';
  return (
    <span className={`mode-badge ${mode}`} title={tip}>
      {mode === 'browser' ? '● Tersimpan di browser' : '● Server lokal'}
    </span>
  );
}

function ProjectMenu({ onClose }) {
  const projects = useEditor((s) => s.projects);
  const currentId = useEditor((s) => s.project.id);
  const ref = useRef(null);

  useEffect(() => {
    useEditor.getState().loadProjects();
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const open = async (id) => {
    const st = useEditor.getState();
    if (st.saveState === 'dirty') await st.save();
    await st.openProject(id);
    onClose();
  };
  const create = async () => {
    const st = useEditor.getState();
    if (st.saveState === 'dirty') await st.save();
    await st.createProject(`Proyek ${new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}`);
    onClose();
  };
  const remove = async (e, id) => {
    e.stopPropagation();
    if (id === currentId) return;
    await api.deleteProject(id);
    useEditor.getState().loadProjects();
  };

  const fileRef = useRef(null);
  const doImport = async (file) => {
    if (!file) return;
    const st = useEditor.getState();
    try {
      if (st.saveState === 'dirty') await st.save();
      st.notify('Mengimpor proyek…');
      const res = await importProject(api, file);
      await st.loadAssets();
      await st.loadProjects();
      await st.openProject(res.project.id);
      st.notify(
        res.missing.length
          ? `Proyek diimpor, tetapi ${res.missing.length} media tidak ikut di file (${res.missing.slice(0, 3).join(', ')}${res.missing.length > 3 ? ', …' : ''}). Upload ulang media tersebut.`
          : `Proyek "${res.project.name}" berhasil diimpor${res.added ? ` (${res.added} media)` : ''}.`,
      );
      onClose();
    } catch (e) {
      st.notify(`Import gagal: ${e.message}`);
    }
  };

  return (
    <div className="menu" ref={ref}>
      <button className="menu-item accent" onClick={create}>＋ Proyek baru</button>
      <button className="menu-item" onClick={() => { useEditor.setState({ projectIOOpen: true }); onClose(); }}>⇩ Export proyek (JSON / ZIP)…</button>
      <button className="menu-item" onClick={() => fileRef.current && fileRef.current.click()}>⇧ Import proyek…</button>
      <input ref={fileRef} type="file" accept=".json,.zip,application/json,application/zip" hidden onChange={(e) => { doImport(e.target.files[0]); e.target.value = ''; }} />
      <div className="menu-sep" />
      {projects.map((p) => (
        <div key={p.id} className={`menu-item ${p.id === currentId ? 'active' : ''}`} onClick={() => open(p.id)}>
          <span className="menu-title">{p.name}</span>
          <span className="menu-meta">{new Date(p.updatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
          {p.id !== currentId && (
            <button className="menu-del" title="Hapus proyek" onClick={(e) => remove(e, p.id)}>✕</button>
          )}
        </div>
      ))}
    </div>
  );
}
