// Pengelola elemen media (gambar, video, audio) untuk pratinjau dan render.
import { fxAssets } from './fx/index.js';

export class MediaPool {
  constructor({ onChange, exact = false } = {}) {
    this.assets = new Map(); // assetId -> meta
    this.images = new Map(); // assetId -> HTMLImageElement
    this.videos = new Map(); // clipId -> HTMLVideoElement
    this.audios = new Map(); // clipId -> HTMLAudioElement
    this.onChange = onChange || (() => {});
    this.exact = exact; // mode render: seek presisi per frame
  }

  setAssets(list) {
    this.assets = new Map(list.map((a) => [a.id, a]));
  }

  asset = (id) => this.assets.get(id);
  image = (assetId) => this.images.get(assetId);
  video = (clipId) => this.videos.get(clipId);

  /** Pastikan elemen media tersedia untuk semua klip proyek. */
  sync(project) {
    const liveClips = new Set();
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.type === 'fx') {
          for (const id of fxAssets(clip)) this.loadImage(this.assets.get(id));
          continue;
        }
        const asset = this.assets.get(clip.assetId);
        if (!asset) continue;
        liveClips.add(clip.id);
        if ((clip.type === 'image' || clip.type === 'logo') && !this.images.has(asset.id)) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.decoding = 'async';
          img.onload = () => this.onChange();
          img.src = asset.url;
          this.images.set(asset.id, img);
        }
        if (clip.type === 'video' && !this.videos.has(clip.id)) {
          const v = document.createElement('video');
          v.crossOrigin = 'anonymous';
          v.preload = 'auto';
          v.playsInline = true;
          v.muted = this.exact; // saat render, audio dimix oleh FFmpeg
          v.src = asset.url;
          v.addEventListener('loadeddata', () => {
            // Setelah sumber (ulang) dimuat, posisikan lagi ke playhead terakhir
            if (this.last) this.update(this.last.project, this.last.t, this.last.playing);
            this.onChange();
          });
          v.addEventListener('seeked', () => this.onChange());
          if (!this.exact) {
            // Browser tidak bisa decode (mis. H.264 di Chromium/Firefox tertentu) → minta salinan VP9
            v.addEventListener('error', () => this.useProxy(v, asset), { once: true });
          }
          this.videos.set(clip.id, v);
        }
        if (clip.type === 'audio' && !this.exact && !this.audios.has(clip.id)) {
          const a = new Audio();
          a.preload = 'auto';
          a.src = asset.url;
          this.audios.set(clip.id, a);
        }
      }
    }
    for (const [id, el] of [...this.videos, ...this.audios]) {
      if (!liveClips.has(id)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
        this.videos.delete(id);
        this.audios.delete(id);
      }
    }
  }

  async useProxy(v, asset) {
    try {
      let url = asset.renderUrl;
      if (!url) {
        const res = await fetch(`/api/assets/${asset.id}/proxy`, { method: 'POST' });
        if (!res.ok) return;
        url = (await res.json()).renderUrl;
        asset.renderUrl = url;
      }
      v.src = url;
    } catch {
      /* biarkan kosong */
    }
  }

  loadImage(asset) {
    if (!asset || this.images.has(asset.id)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => this.onChange();
    img.src = asset.url;
    this.images.set(asset.id, img);
  }

  /** Sinkronisasi playback video/audio ke playhead (pratinjau). */
  update(project, t, playing) {
    this.last = { project, t, playing };
    const fps = project.settings.fps;
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        const el = clip.type === 'video' ? this.videos.get(clip.id) : clip.type === 'audio' ? this.audios.get(clip.id) : null;
        if (!el) continue;
        const active = track.visible && t >= clip.start && t < clip.start + clip.duration;
        const target = (clip.inPoint || 0) + (t - clip.start);
        el.volume = Math.max(0, Math.min(1, clip.volume ?? 1));
        el.muted = !!clip.muted;
        if (!active) {
          if (!el.paused) el.pause();
          continue;
        }
        if (playing) {
          if (el.paused) {
            el.currentTime = target;
            el.play().catch(() => {});
          } else if (Math.abs(el.currentTime - target) > 0.25) {
            el.currentTime = target;
          }
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - target) > 0.5 / fps) el.currentTime = target;
        }
      }
    }
  }

  pauseAll() {
    for (const el of [...this.videos.values(), ...this.audios.values()]) el.pause();
  }

  /** Mode render: seek setiap video aktif tepat ke frame t lalu tunggu frame siap. */
  async seekExact(project, t) {
    const waits = [];
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        if (clip.type !== 'video') continue;
        const v = this.videos.get(clip.id);
        if (!v) continue;
        if (!(t >= clip.start && t < clip.start + clip.duration)) continue;
        const target = Math.min((clip.inPoint || 0) + (t - clip.start), Math.max(0, (v.duration || 1e9) - 0.001));
        if (Math.abs(v.currentTime - target) < 1e-4 && v.readyState >= 2) continue;
        waits.push(
          new Promise((resolve) => {
            const done = () => {
              v.removeEventListener('seeked', done);
              resolve();
            };
            v.addEventListener('seeked', done);
            v.currentTime = target;
            setTimeout(done, 3000);
          }),
        );
      }
    }
    await Promise.all(waits);
  }

  async waitLoaded(timeoutMs = 20000) {
    const timeout = () => new Promise((r) => setTimeout(r, timeoutMs));
    const imgs = [...this.images.values()].map((img) =>
      img.complete ? null : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }),
    );
    const vids = [...this.videos.values()].map((v) =>
      v.readyState >= 2 ? null : new Promise((r) => { v.addEventListener('loadeddata', r, { once: true }); v.addEventListener('error', r, { once: true }); }),
    );
    await Promise.race([Promise.all([...imgs, ...vids].filter(Boolean)), timeout()]);
    // Kembalikan daftar klip video yang gagal dimuat (codec tidak didukung, dsb.)
    return [...this.videos.entries()].filter(([, v]) => v.error || v.readyState < 2).map(([id]) => id);
  }
}
