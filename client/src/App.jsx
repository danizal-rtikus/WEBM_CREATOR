import React, { useEffect, useMemo } from 'react';
import { useEditor } from './store/editor.js';
import { MediaPool } from './engine/media.js';
import TopBar from './components/TopBar.jsx';
import MediaLibrary from './components/MediaLibrary.jsx';
import PreviewCanvas from './components/PreviewCanvas.jsx';
import Inspector from './components/Inspector.jsx';
import Timeline from './components/Timeline.jsx';
import ExportDialog from './components/ExportDialog.jsx';
import Toast from './components/Toast.jsx';
import ProjectIODialog from './components/ProjectIODialog.jsx';
import { initBackend } from './api.js';

export default function App() {
  const exportOpen = useEditor((s) => s.exportOpen);
  const projectIOOpen = useEditor((s) => s.projectIOOpen);
  const project = useEditor((s) => s.project);
  const assets = useEditor((s) => s.assets);
  const pool = useMemo(() => new MediaPool({ onChange: () => window.dispatchEvent(new Event('media-change')) }), []);

  // Muat daftar proyek & aset; buka proyek terakhir atau buat baru
  useEffect(() => {
    (async () => {
      const st = useEditor.getState();
      try {
        const b = await initBackend();
        useEditor.setState({ backendMode: b.mode });
        await st.loadAssets();
        const list = await st.loadProjects();
        let last = null;
        try { last = localStorage.getItem('webm-editor:last'); } catch { /* noop */ }
        const target = list.find((p) => p.id === last) || list[0];
        if (target) await st.openProject(target.id);
        else await st.createProject('Proyek pertama');
        if (b.mode === 'browser') {
          let seen = null;
          try { seen = localStorage.getItem('webm-editor:browser-intro'); localStorage.setItem('webm-editor:browser-intro', '1'); } catch { /* noop */ }
          if (!seen) st.notify('Proyek & media kamu tersimpan di browser ini saja. Export proyek (menu Proyek) untuk cadangan atau pindah perangkat.');
        }
      } catch (e) {
        st.notify(`Gagal memuat data: ${e.message}`);
      }
    })();
  }, []);

  useEffect(() => {
    pool.setAssets(assets);
    pool.sync(project);
  }, [pool, assets, project]);

  usePlaybackLoop(pool);
  useShortcuts();

  return (
    <div className="app">
      <TopBar />
      <MediaLibrary />
      <PreviewCanvas pool={pool} />
      <Inspector pool={pool} />
      <Timeline />
      {exportOpen && <ExportDialog />}
      {projectIOOpen && <ProjectIODialog />}
      <Toast />
    </div>
  );
}

function usePlaybackLoop(pool) {
  const playing = useEditor((s) => s.playing);
  useEffect(() => {
    if (!playing) {
      pool.update(useEditor.getState().project, useEditor.getState().time, false);
      return undefined;
    }
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const st = useEditor.getState();
      const dt = (now - last) / 1000;
      last = now;
      let t = st.time + dt;
      const end = st.project.settings.duration;
      if (t >= end) {
        t = end;
        useEditor.setState({ time: t, playing: false });
        pool.pauseAll();
        return;
      }
      useEditor.setState({ time: t });
      pool.update(st.project, t, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      pool.pauseAll();
    };
  }, [playing, pool]);

  // Saat tidak play: sinkronkan video ke playhead ketika scrub
  useEffect(
    () =>
      useEditor.subscribe(() => {
        const s = useEditor.getState();
        if (!s.playing) pool.update(s.project, s.time, false);
      }),
    [pool],
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const type = (e.target.type || '').toLowerCase();
      const typing = (tag === 'input' && !['checkbox', 'radio', 'range', 'color', 'button'].includes(type)) || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
      if (typing) return;
      if (tag === 'input' && e.code === 'Space') e.target.blur();
      const st = useEditor.getState();
      const fps = st.project.settings.fps;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateSelected();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        st.save();
      } else if (e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        st.keyframeAll();
      } else if (e.code === 'Space') {
        e.preventDefault();
        st.togglePlay();
      } else if (e.key === 'k' || e.key === 'K') {
        useEditor.setState({ playing: false });
      } else if (e.key === 'l' || e.key === 'L') {
        if (!st.playing) st.togglePlay();
      } else if (e.key === 'j' || e.key === 'J') {
        useEditor.setState({ playing: false });
        st.setTime(st.time - 1);
      } else if (e.key === 's' || e.key === 'S') {
        st.splitSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.deleteSelected();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        st.setTime(st.time - (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        st.setTime(st.time + (e.shiftKey ? 1 : 1 / fps));
      } else if (e.key === 'Home') {
        st.setTime(0);
      } else if (e.key === 'End') {
        st.setTime(st.project.settings.duration);
      } else if (e.key === '+' || e.key === '=') {
        useEditor.setState({ zoom: Math.min(600, st.zoom * 1.25) });
      } else if (e.key === '-' || e.key === '_') {
        useEditor.setState({ zoom: Math.max(10, st.zoom / 1.25) });
      } else if (e.key === 'Escape') {
        st.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
