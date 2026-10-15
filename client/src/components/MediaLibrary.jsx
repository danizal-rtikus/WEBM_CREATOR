import React, { useRef, useState } from 'react';
import { useEditor } from '../store/editor.js';
import { api } from '../api.js';
import { fmtBytes, fmtTime } from '../util.js';
import { applyLogoPreset, defaultLogoPreset } from '../engine/presets.js';
import StingerGallery from './StingerGallery.jsx';

const TABS = [
  ['media', 'Media'],
  ['logo', 'Logo'],
  ['text', 'Teks'],
  ['shape', 'Shape'],
  ['stinger', 'Template'],
];

const KIND_TO_TYPE = { image: 'image', video: 'video', audio: 'audio' };

export function addAssetToTimeline(asset, start) {
  const st = useEditor.getState();
  st.addClip(KIND_TO_TYPE[asset.kind] || 'image', asset, { start });
}

export function addLogo(asset) {
  const st = useEditor.getState();
  st.addClip('logo', asset, {
    name: `Logo · ${asset.name}`,
    patch: (clip) => applyLogoPreset(clip, defaultLogoPreset(), { w: asset.width || 512, h: asset.height || 512 }, st.project.settings),
  });
}

export default function MediaLibrary() {
  const [tab, setTab] = useState('media');
  return (
    <aside className="panel library">
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'media' && <MediaTab />}
        {tab === 'logo' && <LogoTab />}
        {tab === 'text' && <TextTab />}
        {tab === 'shape' && <ShapeTab />}
        {tab === 'stinger' && <StingerGallery />}
      </div>
    </aside>
  );
}

function useUploader() {
  const [uploads, setUploads] = useState([]);
  const upload = async (files) => {
    for (const file of files) {
      const key = `${file.name}-${Date.now()}`;
      setUploads((u) => [...u, { key, name: file.name, p: 0 }]);
      try {
        await api.uploadAsset(file, (p) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, p } : x))));
        await useEditor.getState().loadAssets();
      } catch (e) {
        useEditor.getState().notify(`Upload ${file.name} gagal: ${e.message}`);
      }
      setUploads((u) => u.filter((x) => x.key !== key));
    }
  };
  return { uploads, upload };
}

function DropZone({ upload, accept, label }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      onClick={() => input.current.click()}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload([...e.dataTransfer.files]);
      }}
    >
      <strong>{label}</strong>
      <span>Seret file ke sini atau klik untuk memilih</span>
      <input ref={input} type="file" multiple accept={accept} hidden onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
    </div>
  );
}

function AssetCard({ asset, onAdd, addLabel = '+', draggableKind = 'asset' }) {
  const del = async () => {
    if (!confirm(`Hapus "${asset.name}" dari library?`)) return;
    try {
      await api.deleteAsset(asset.id);
      useEditor.getState().loadAssets();
    } catch (e) {
      useEditor.getState().notify(e.message);
    }
  };
  return (
    <div
      className="asset"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-webm-asset', JSON.stringify({ id: asset.id, as: draggableKind }));
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onDoubleClick={onAdd}
      title="Seret ke timeline atau klik dua kali untuk menambahkan"
    >
      <div className={`thumb ${asset.kind}`}>
        {asset.kind === 'image' && <img src={asset.url} alt="" draggable={false} />}
        {asset.kind === 'video' && asset.thumbUrl && <img src={asset.thumbUrl} alt="" draggable={false} />}
        {asset.kind === 'audio' && <span className="audio-ico">♪</span>}
        {asset.duration ? <span className="dur">{fmtTime(asset.duration, 30).slice(0, 5)}</span> : null}
        {asset.hasAlpha && <span className="badge">alpha</span>}
      </div>
      <div className="asset-meta">
        <span className="asset-name">{asset.name}</span>
        <span className="asset-sub">
          {asset.kind}
          {asset.width ? ` · ${asset.width}×${asset.height}` : ''} · {fmtBytes(asset.size)}
        </span>
      </div>
      <div className="asset-actions">
        <button className="btn icon sm" onClick={onAdd} title="Tambahkan ke timeline di playhead">{addLabel}</button>
        <button className="btn icon sm ghost" onClick={del} title="Hapus dari library">✕</button>
      </div>
    </div>
  );
}

function MediaTab() {
  const assets = useEditor((s) => s.assets);
  const { uploads, upload } = useUploader();
  return (
    <>
      <DropZone upload={upload} accept="video/*,image/*,audio/*,.svg,.webm,.mov,.mkv" label="Upload media" />
      {uploads.map((u) => (
        <div key={u.key} className="upload-row">
          <span>{u.name}</span>
          <div className="bar"><div style={{ width: `${Math.round(u.p * 100)}%` }} /></div>
        </div>
      ))}
      {assets.length === 0 && <p className="empty">Belum ada media. Upload video, gambar, logo, atau audio.</p>}
      <div className="asset-list">
        {[...assets.filter((a) => !a.builtin), ...assets.filter((a) => a.builtin)].map((a) => (
          <AssetCard key={a.id} asset={a} onAdd={() => addAssetToTimeline(a)} />
        ))}
      </div>
    </>
  );
}

function LogoTab() {
  const allAssets = useEditor((s) => s.assets);
  const assets = allAssets.filter((a) => a.kind === 'image');
  const { uploads, upload } = useUploader();
  return (
    <>
      <p className="note">
        Logo ditambahkan dengan preset <b>kanan-bawah</b> + animasi <b>Pop</b>. Ubah posisi, ukuran, animasi, atau jadikan watermark di panel properti.
      </p>
      <DropZone upload={upload} accept="image/png,image/svg+xml,image/webp,.svg" label="Upload logo (PNG / SVG / WebP)" />
      {uploads.map((u) => (
        <div key={u.key} className="upload-row">
          <span>{u.name}</span>
          <div className="bar"><div style={{ width: `${Math.round(u.p * 100)}%` }} /></div>
        </div>
      ))}
      <div className="asset-list">
        {assets.map((a) => (
          <AssetCard key={a.id} asset={a} onAdd={() => addLogo(a)} addLabel="◆" draggableKind="logo" />
        ))}
      </div>
    </>
  );
}

const TEXT_PRESETS = [
  { label: 'Judul besar', name: 'Judul', text: { content: 'Judul Besar', fontSize: 140, fontWeight: 800, fontFamily: 'Montserrat' } },
  { label: 'Subjudul', name: 'Subjudul', text: { content: 'Subjudul yang menjelaskan', fontSize: 56, fontWeight: 500, fontFamily: 'Inter' } },
  {
    label: 'Lower third',
    name: 'Lower third',
    text: { content: 'Nama Narasumber\nJabatan / Instansi', fontSize: 44, fontWeight: 600, fontFamily: 'Poppins', align: 'left', bgEnabled: true, bgColor: '#101418', bgPadding: 28 },
    pos: (s) => ({ x: s.width * 0.06, y: s.height * 0.8, anchorX: 0, anchorY: 0.5 }),
  },
  { label: 'Display', name: 'Display', text: { content: 'BREAKING', fontSize: 180, fontWeight: 400, fontFamily: 'Bebas Neue', letterSpacing: 8 } },
  {
    label: 'Caption',
    name: 'Caption',
    text: { content: 'Teks caption di bagian bawah', fontSize: 42, fontWeight: 600, fontFamily: 'Inter', strokeWidth: 3, strokeColor: '#000000' },
    pos: (s) => ({ y: s.height * 0.88 }),
  },
];

function TextTab() {
  const add = (preset) => {
    useEditor.getState().addClip('text', null, {
      name: preset.name,
      patch: (clip) => {
        Object.assign(clip.text, preset.text);
        if (preset.pos) Object.assign(clip.transform, preset.pos(useEditor.getState().project.settings));
      },
    });
  };
  return (
    <div className="preset-grid">
      {TEXT_PRESETS.map((p) => (
        <button key={p.label} className="preset text" onClick={() => add(p)}>
          <span style={{ fontFamily: `"${p.text.fontFamily}", sans-serif`, fontWeight: p.text.fontWeight }}>{p.label}</span>
        </button>
      ))}
    </div>
  );
}

const SHAPE_PRESETS = [
  { label: 'Persegi', shape: { kind: 'rect', radius: 0 } },
  { label: 'Rounded', shape: { kind: 'rect', radius: 32 } },
  { label: 'Lingkaran', shape: { kind: 'ellipse', width: 320, height: 320 } },
  { label: 'Bar', shape: { kind: 'rect', width: 900, height: 120, radius: 60 } },
  { label: 'Solid layar penuh', shape: { kind: 'rect', radius: 0, fill: '#0f172a' }, full: true },
  { label: 'Cincin', shape: { kind: 'ring', width: 360, height: 360, thickness: 28, fill: '#ffffff' } },
  { label: 'Bintang', shape: { kind: 'star', width: 320, height: 320, points: 5, inner: 0.45, fill: '#ffd23f' } },
  { label: 'Heksagon', shape: { kind: 'polygon', width: 320, height: 320, sides: 6, fill: '#3ddc97' } },
  { label: 'Panel gradasi', shape: { kind: 'rect', radius: 0, fill: '#0a2a9e', fill2: '#2f6bff', fillType: 'linear', gradAngle: 30 }, full: true },
];

function ShapeTab() {
  const add = (p) => {
    useEditor.getState().addClip('shape', null, {
      name: p.label,
      patch: (clip) => {
        Object.assign(clip.shape, p.shape);
        if (p.full) {
          const s = useEditor.getState().project.settings;
          clip.shape.width = s.width;
          clip.shape.height = s.height;
        }
      },
    });
  };
  return (
    <div className="preset-grid">
      {SHAPE_PRESETS.map((p) => (
        <button key={p.label} className="preset" onClick={() => add(p)}>
          <span
            className={`shape-ico ${p.shape.kind}`}
            style={{
              borderRadius: p.shape.kind === 'ellipse' || p.shape.kind === 'ring' ? '50%' : Math.min(10, (p.shape.radius || 0) / 3),
              background: p.shape.kind === 'ring' ? 'transparent' : p.shape.fillType ? `linear-gradient(120deg, ${p.shape.fill}, ${p.shape.fill2})` : p.shape.fill,
              border: p.shape.kind === 'ring' ? `4px solid ${p.shape.fill}` : 'none',
              clipPath: p.shape.kind === 'star' ? 'polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)' : p.shape.kind === 'polygon' ? 'polygon(25% 5%,75% 5%,100% 50%,75% 95%,25% 95%,0 50%)' : 'none',
              width: p.shape.kind === 'rect' ? 30 : 24,
              height: p.shape.kind === 'rect' ? 20 : 24,
            }}
          />
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}
