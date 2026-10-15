// Skema proyek, nilai default, dan helper murni (tanpa React).

export const ANIMATABLE = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'rotateY', 'opacity'];

/** Nilai default untuk properti yang belum ada di klip lama. */
export const PROP_DEFAULTS = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, rotateY: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 };

export const PROP_LABELS = {
  x: 'Posisi X',
  y: 'Posisi Y',
  scaleX: 'Skala X',
  scaleY: 'Skala Y',
  rotation: 'Rotasi',
  rotateY: 'Rotasi 3D (Y)',
  opacity: 'Opacity',
};

export const CANVAS_PRESETS = [
  { label: '16:9 · 1920×1080', width: 1920, height: 1080 },
  { label: '16:9 · 1280×720', width: 1280, height: 720 },
  { label: '9:16 · 1080×1920', width: 1080, height: 1920 },
  { label: '1:1 · 1080×1080', width: 1080, height: 1080 },
  { label: '4:5 · 1080×1350', width: 1080, height: 1350 },
  { label: '4K · 3840×2160', width: 3840, height: 2160 },
];

export const FONTS = [
  'Inter',
  'Montserrat',
  'Poppins',
  'Bebas Neue',
  'Playfair Display',
  'Space Grotesk',
  'JetBrains Mono',
  'Arial',
  'Georgia',
];

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

export function defaultTransform(settings) {
  return {
    x: settings.width / 2,
    y: settings.height / 2,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    rotateY: 0,
    opacity: 1,
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

export function defaultText() {
  return {
    content: 'Judul Anda',
    fontFamily: 'Inter',
    fontSize: 96,
    fontWeight: 700,
    color: '#ffffff',
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: false,
    shadowColor: 'rgba(0,0,0,0.5)',
    shadowBlur: 12,
    bgEnabled: false,
    bgColor: '#111111',
    bgPadding: 24,
  };
}

export function defaultShape() {
  return { kind: 'rect', width: 400, height: 240, fill: '#22c55e', radius: 16 };
}

export function newProject(name = 'Proyek baru') {
  return {
    id: null,
    name,
    settings: { width: 1920, height: 1080, fps: 30, duration: 10, background: '#000000', transparent: true },
    tracks: [],
    version: 0,
  };
}

/** Durasi klip disesuaikan dengan batas sumber (video/audio). */
export function makeClip({ type, asset, settings, start = 0, name }) {
  const base = {
    id: uid('clp'),
    type,
    assetId: asset ? asset.id : null,
    name: name || (asset ? asset.name : type),
    start,
    duration: 5,
    inPoint: 0,
    transform: defaultTransform(settings),
    keyframes: {},
    volume: 1,
    muted: false,
  };
  if (asset && (asset.kind === 'video' || asset.kind === 'audio') && asset.duration) {
    base.duration = Math.max(0.1, Math.min(asset.duration, settings.duration - start || asset.duration));
  } else {
    base.duration = Math.max(0.5, settings.duration - start);
  }
  if ((type === 'image' || type === 'logo' || type === 'video') && asset && asset.width) {
    // Muat ke dalam canvas: maks 80% (gambar/video), 22% lebar (logo)
    const maxW = type === 'logo' ? settings.width * 0.22 : settings.width * 0.8;
    const maxH = type === 'logo' ? settings.height * 0.3 : settings.height * 0.8;
    let s = Math.min(maxW / asset.width, maxH / asset.height);
    if (type === 'video' && asset.width <= settings.width && asset.height <= settings.height) {
      s = Math.min(settings.width / asset.width, settings.height / asset.height);
    }
    base.transform.scaleX = base.transform.scaleY = round(s, 4);
  }
  if (type === 'text') base.text = defaultText();
  if (type === 'shape') base.shape = defaultShape();
  return base;
}

export function round(v, d = 3) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

export function findClip(project, clipId) {
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { track, clip };
  }
  return null;
}

export function projectEnd(project) {
  let end = 0;
  for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  return end;
}
