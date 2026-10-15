// State editor: proyek, seleksi, playhead, riwayat undo/redo, autosave.
import { createStore } from './createStore.js';
import { api } from '../api.js';
import { findClip, makeClip, uid, newProject, defaultTransform } from '../engine/project.js';
import { FX, fxDefaults } from '../engine/fx/index.js';
import { evaluateProp, splitClipAt, removeKeyframe, KF_EPS } from '../engine/evaluate.js';

const HISTORY_LIMIT = 150;

export const useEditor = createStore((set, get) => ({
  project: newProject(),
  assets: [],
  projects: [],
  selectedClipId: null,
  selectedKf: null, // { clipId, prop, t }
  time: 0,
  playing: false,
  zoom: 80, // px per detik di timeline
  past: [],
  future: [],
  saveState: 'saved', // saved | dirty | saving | error
  toast: null,
  exportOpen: false,
  inspectorTab: 'layer', // layer | motion | project
  backendMode: null, // 'server' | 'browser'
  projectIOOpen: false,

  // ---------- Riwayat ----------
  /** Ubah proyek + catat ke riwayat. fn menerima draft (salinan) proyek. */
  commit(fn) {
    const { project, past } = get();
    const draft = structuredClone(project);
    fn(draft);
    set({ project: draft, past: [...past.slice(-HISTORY_LIMIT), project], future: [], saveState: 'dirty' });
  },
  /** Simpan snapshot sekarang ke riwayat (dipanggil di awal gesture drag). */
  checkpoint() {
    const { project, past } = get();
    set({ past: [...past.slice(-HISTORY_LIMIT), project], future: [] });
  },
  /** Ubah proyek tanpa mencatat riwayat (dipakai selama drag). */
  mutate(fn) {
    const draft = structuredClone(get().project);
    fn(draft);
    set({ project: draft, saveState: 'dirty' });
  },
  undo() {
    const { past, project, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ project: { ...prev, version: project.version }, past: past.slice(0, -1), future: [project, ...future], saveState: 'dirty' });
  },
  redo() {
    const { past, project, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ project: { ...next, version: project.version }, past: [...past, project], future: future.slice(1), saveState: 'dirty' });
  },

  // ---------- Proyek ----------
  async loadProjects() {
    const projects = await api.listProjects();
    set({ projects });
    return projects;
  },
  async openProject(id) {
    const project = await api.getProject(id);
    set({ project, past: [], future: [], selectedClipId: null, selectedKf: null, time: 0, playing: false, saveState: 'saved' });
    try { localStorage.setItem('webm-editor:last', id); } catch { /* noop */ }
  },
  async createProject(name) {
    const p = await api.createProject({ name });
    await get().openProject(p.id);
    await get().loadProjects();
  },
  async save() {
    const { project } = get();
    if (!project.id) return;
    set({ saveState: 'saving' });
    try {
      const res = await api.saveProject(project);
      // Hanya perbarui versi jika proyek belum berubah lagi selama penyimpanan
      const cur = get().project;
      set({ project: { ...cur, version: res.version }, saveState: cur === project ? 'saved' : 'dirty' });
    } catch (e) {
      set({ saveState: 'error' });
      get().notify(`Gagal menyimpan: ${e.message}`);
    }
  },

  async loadAssets() {
    const assets = await api.listAssets();
    set({ assets });
  },

  notify(msg) {
    set({ toast: { msg, id: Date.now() } });
  },

  // ---------- Seleksi & waktu ----------
  select(clipId) {
    const tab = get().inspectorTab;
    set({ selectedClipId: clipId, selectedKf: null, inspectorTab: clipId && tab === 'project' ? 'layer' : tab });
  },
  setTime(t) {
    const d = get().project.settings.duration;
    set({ time: Math.max(0, Math.min(d, t)) });
  },
  togglePlay() {
    const { playing, time, project } = get();
    if (!playing && time >= project.settings.duration - 1e-3) set({ time: 0 });
    set({ playing: !playing });
  },

  // ---------- Layer & klip ----------
  addClip(type, asset, opts = {}) {
    const { project, time } = get();
    const start = opts.start ?? Math.min(time, Math.max(0, project.settings.duration - 0.5));
    const clip = makeClip({ type, asset, settings: project.settings, start, name: opts.name });
    if (opts.patch) opts.patch(clip);
    get().commit((p) => {
      p.tracks.push({ id: uid('trk'), name: clip.name, visible: true, locked: false, clips: [clip] });
    });
    set({ selectedClipId: clip.id, selectedKf: null });
    return clip;
  },
  /**
   * Terapkan template stinger: tambah layer FX (+ SFX) dan atur proyek.
   * opts: { logoId, sfx: boolean, sfxAssets: {name: asset}, fitProject: boolean }
   */
  addStinger(kind, opts = {}) {
    const def = FX[kind];
    if (!def) return null;
    const params = fxDefaults(kind);
    if (opts.logoId && 'logo' in params) params.logo = opts.logoId;
    if (opts.logoId && 'logoLeft' in params) params.logoLeft = opts.logoId;
    let clipId = null;
    get().commit((p) => {
      const empty = p.tracks.length === 0;
      if (opts.fitProject || empty) {
        if (empty) Object.assign(p.settings, { width: 1920, height: 1080, fps: 60 });
        p.settings.transparent = true;
        p.settings.duration = def.duration;
        if (def.card) delete p.settings.cutPoint;
        else p.settings.cutPoint = def.cut;
      }
      const start = opts.fitProject || empty ? 0 : Math.min(get().time, Math.max(0, p.settings.duration - def.duration));
      const clip = {
        id: (clipId = uid('clp')),
        type: 'fx',
        name: def.label,
        start,
        duration: def.duration,
        inPoint: 0,
        transform: defaultTransform(p.settings),
        keyframes: {},
        fx: { kind, params },
      };
      if (!(opts.fitProject || empty) && !def.card) p.settings.cutPoint = start + def.cut;
      p.tracks.push({ id: uid('trk'), name: def.label, visible: true, locked: false, clips: [clip] });
      if (opts.sfx && (def.sfx || def.sfxAt) && opts.sfxAssets) {
        const place = def.sfxAt
          ? def.sfxAt.map(([n, at]) => [n, start + at])
          : [
              [def.sfx.in, start],
              [def.sfx.out, start + def.cut],
            ];
        for (const [name, at] of place) {
          const a = opts.sfxAssets[name];
          if (!a) continue;
          const sc = makeClip({ type: 'audio', asset: a, settings: p.settings, start: Math.max(0, at - (name === 'whoosh' || name === 'wind' || name === 'riser' ? Math.min(0.25, a.duration * 0.3) : 0)), name: a.name });
          sc.duration = Math.min(a.duration, p.settings.duration - sc.start);
          sc.volume = 0.8;
          p.tracks.unshift({ id: uid('trk'), name: a.name, visible: true, locked: false, clips: [sc] });
        }
      }
    });
    set({ selectedClipId: clipId, selectedKf: null, inspectorTab: 'layer', time: 0, zoom: Math.max(10, Math.min(600, 900 / get().project.settings.duration)) });
    return clipId;
  },
  updateClip(clipId, fn, { history = true } = {}) {
    const apply = (p) => {
      const hit = findClip(p, clipId);
      if (hit) fn(hit.clip, hit.track, p);
    };
    if (history) get().commit(apply);
    else get().mutate(apply);
  },
  deleteSelected() {
    const { selectedKf, selectedClipId } = get();
    if (selectedKf) {
      get().updateClip(selectedKf.clipId, (c) => removeKeyframe(c, selectedKf.prop, selectedKf.t));
      set({ selectedKf: null });
      return;
    }
    if (!selectedClipId) return;
    get().commit((p) => {
      for (const t of p.tracks) t.clips = t.clips.filter((c) => c.id !== selectedClipId);
      p.tracks = p.tracks.filter((t) => t.clips.length > 0);
    });
    set({ selectedClipId: null });
  },
  duplicateSelected() {
    const { selectedClipId } = get();
    if (!selectedClipId) return;
    let newId = null;
    get().commit((p) => {
      const hit = findClip(p, selectedClipId);
      if (!hit) return;
      const copy = structuredClone(hit.clip);
      copy.id = newId = uid('clp');
      copy.name = `${hit.clip.name} (salinan)`;
      const idx = p.tracks.indexOf(hit.track);
      p.tracks.splice(idx + 1, 0, { id: uid('trk'), name: copy.name, visible: true, locked: false, clips: [copy] });
    });
    if (newId) set({ selectedClipId: newId });
  },
  splitSelected() {
    const { selectedClipId, time } = get();
    if (!selectedClipId) return;
    const hit = findClip(get().project, selectedClipId);
    if (!hit) return;
    const s = time - hit.clip.start;
    if (s <= KF_EPS || s >= hit.clip.duration - KF_EPS) {
      get().notify('Letakkan playhead di dalam klip untuk memotong (S).');
      return;
    }
    get().commit((p) => {
      const h = findClip(p, selectedClipId);
      const right = splitClipAt(h.clip, s, uid('clp'));
      h.track.clips.push(right);
      h.track.clips.sort((a, b) => a.start - b.start);
    });
  },
  moveTrack(fromIdx, toIdx) {
    get().commit((p) => {
      const [t] = p.tracks.splice(fromIdx, 1);
      p.tracks.splice(toIdx, 0, t);
    });
  },
  /** Tambah keyframe untuk semua properti beranimasi di playhead (Alt+K). */
  keyframeAll() {
    const { selectedClipId, time } = get();
    if (!selectedClipId) return;
    get().updateClip(selectedClipId, (c) => {
      const local = time - c.start;
      const props = Object.keys(c.keyframes || {});
      const list = props.length ? props : ['x', 'y'];
      for (const prop of list) {
        const v = evaluateProp(c, prop, local);
        if (!c.keyframes[prop]) c.keyframes[prop] = [];
        const kfs = c.keyframes[prop];
        if (!kfs.some((k) => Math.abs(k.t - local) < KF_EPS)) {
          kfs.push({ t: local, v, ease: 'smooth' });
          kfs.sort((a, b) => a.t - b.t);
        }
      }
    });
  },
}));

// ---------- Autosave (debounce 1,5 detik) ----------
let saveTimer = null;
let lastProject = null;
useEditor.subscribe(() => {
  const s = useEditor.getState();
  if (s.project === lastProject) return;
  lastProject = s.project;
  if (s.saveState !== 'dirty' || !s.project.id) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => useEditor.getState().save(), 1500);
});

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (useEditor.getState().saveState === 'dirty') {
      useEditor.getState().save();
      e.preventDefault();
    }
  });
}
