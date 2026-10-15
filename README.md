# WEBM Editor

Editor video berlayer di browser untuk membuat animasi pendek, overlay, dan animasi logo, lalu mengekspornya sebagai **WebM (VP9 + Opus)**, termasuk opsi **latar transparan (alpha)**.
Semuanya berjalan di PC sendiri (localhost). Aset dan hasil render disimpan di disk lokal.

- **Frontend:** Vite + React (tanpa library state, cukup store kecil di `client/src/store`)
- **Backend:** Node.js murni (modul bawaan, tanpa Express) + FFmpeg
- **Render:** Puppeteer (Chromium headless) menggambar setiap frame dengan *compositor yang sama* dengan pratinjau, lalu frame di-pipe ke FFmpeg. Hasil export identik dengan pratinjau.

## Kebutuhan

- **Node.js 20 atau lebih baru** ([nodejs.org](https://nodejs.org))
- Koneksi internet saat `npm install` pertama: Puppeteer mengunduh Chromium (~150 MB) dan `ffmpeg-static` mengunduh FFmpeg.
  FFmpeg tidak perlu dipasang manual.

## Menjalankan

```bash
# sekali saja
npm install

# mode pengembangan (hot reload)
npm run dev
#   → buka http://localhost:5173

# mode pemakaian (build sekali, satu port)
npm start
#   → buka http://localhost:3001
```

Data tersimpan di folder `data/`:

| Folder | Isi |
| --- | --- |
| `data/projects/` | Satu file JSON per proyek |
| `data/media/` | Aset yang di-upload, thumbnail, salinan VP9 untuk render |
| `data/renders/` | Hasil export `.webm` |
| `data/assets.json` | Daftar media library |

## Fitur

**Antarmuka ala video editor:** media library (kiri), preview canvas (tengah), panel properti (kanan), dan timeline berlayer (bawah). Tinggi timeline bisa diubah dengan menyeret tepi atasnya.

**Layer:** video, gambar, logo, teks, shape, dan audio.
- Seret media dari library ke timeline atau canvas, atau klik dua kali.
- Urutan layer: seret `⋮⋮` di header track. Track paling atas tampil paling depan.
- Tombol 👁 untuk sembunyikan, 🔒 untuk kunci.
- Klip bisa di-trim (tarik tepi), dipindah (snap ke playhead/tepi klip lain), di-split, dan diduplikat.

**Motion / keyframe:**
- Klik ⏱ pada properti (posisi, skala, rotasi, opacity) untuk mengaktifkan animasi.
- Pindahkan playhead lalu ubah nilai (di panel atau langsung di canvas); keyframe dibuat otomatis.
- Easing per keyframe: Linear, Ease In/Out, Back, Elastic, Bounce, Hold.
- Keyframe tampil sebagai ◆ di baris properti timeline. Bisa digeser, diklik untuk diedit, atau dihapus dengan Delete.
- Jalur gerak (motion path) tampil putus-putus di canvas.

**Template motion** (panel kanan → tab *Motion*, setelah memilih layer):
- **Masuk** (di awal klip): Fade, Slide 4 arah, Rise & Fade, Masuk dari luar layar, Zoom, Pop (overshoot), Elastic, Spin, Drop (bounce), Swing.
- **Keluar** (di akhir klip): Fade, Slide 4 arah, Sink & Fade, Keluar layar, Zoom Out, Pop Out, Spin Out.
- **Penekanan** (di posisi playhead): Pulse, Heartbeat, Shake, Wobble, Jump, Rubber Band, Flash, Tada.
- **Loop** (sepanjang klip): Float, Breathe, Pendulum, Blink, Putar terus.
- Template dihitung relatif terhadap posisi, skala, dan rotasi objek saat ini, dan hanya menimpa keyframe di rentang waktunya. Masuk, Penekanan, dan Keluar bisa digabung.
- Atur durasi, intensitas, dan **kurva easing** (cubic-bezier) sebelum klik template.

**Kurva easing (bezier):** Smooth, Easy Ease (ala After Effects), Silk, Sine, Expo In/Out, Decelerate/Accelerate, Overshoot, Anticipate, Back. Kurvanya bisa dibentuk sendiri dengan menyeret dua handle di editor kurva (tab Motion, atau pada keyframe terpilih di tab Layer).

**Kartu info** (tab *Template* → Kartu info): **Kartu Wisuda**, dengan wipe chevron biru, foto, logo kiri & kanan, judul acara, program studi, NIM, nama, gelar, IPK, predikat, dan footer. Semua foto, logo, teks, dan warna bisa diganti di panel kanan. Ukuran teks menyesuaikan otomatis bila nama terlalu panjang.

**Stinger / transisi** (tab *Template* di panel kiri): 21 template yang menutup layar penuh di **titik potong** lalu membuka scene baru, cocok untuk OBS (Scene Transition → Stinger).
- **Partikel logo:** Logo Rain, Logo Pop Storm, Logo Balls, Logo Confetti, Sticker Wall.
- **Panel & logo:** Neon Wipe, Card Flip, Diagonal Slash, Split Doors, Dark Stage.
- **Bentuk flat:** Circle Reveal, Shape Burst, Stripe Wipe, Liquid Blob.
- **Partikel alami:** Sakura Gust, Autumn Leaves, Snow Burst, Bubbles, Logo Petals.
- **Tipografi:** Big Type Wipe, Kinetic Stack.
- Pilih logo, lalu klik kartu template. Proyek otomatis diatur (durasi, titik potong, latar transparan) dan SFX ditambahkan.
- Semua warna, ukuran, kepadatan, arah, dan *seed* acak bisa diubah di panel kanan. Pratinjau dan render dijamin identik (deterministik).
- **Titik potong** tampil sebagai penanda merah `CUT` di timeline dan bisa digeser. Nilainya (ms) muncul di dialog Export dan di nama file, misalnya `...-cut680ms.webm`. Isikan nilai ini ke OBS → Stinger → *Transition Point*.

**Efek layer** (tab Layer → Efek): blend mode, glow, outline stiker, warnai ulang, ketebalan 3D (extrude), motion blur, dan **track matte** (layer di atasnya jadi mask). Properti **Rotasi 3D (Y)** bisa dianimasikan, plus template motion Flip 3D, Flip 360°, dan Koin berputar.

**Shape lanjutan:** cincin, poligon, bintang, dan isian gradasi linear/radial.

**SFX bawaan:** Whoosh, Swoosh, Pop, Impact, Chime, Riser, dan Angin. Semuanya dibuat otomatis oleh FFmpeg saat server pertama kali berjalan (`data/media/sfx/`).

**Pengaturan proyek** (ukuran canvas, FPS, durasi, latar) ada di tab *Proyek* panel kanan, atau klik teks `⚙ 1920×1080 · fps` di bawah preview.

**Logo & watermark** (tab *Logo*):
- Upload PNG / SVG / WebP. SVG disanitasi otomatis (script & event handler dibuang).
- Preset posisi 9 titik + margin + lebar (% canvas).
- Animasi masuk/keluar: Fade, Slide (4 arah), Pop, Spin, Drop.
- Mode watermark: logo tampil sepanjang video dengan opacity tertentu.
- Preset menghasilkan keyframe biasa, jadi semuanya tetap bisa diedit manual.

**Export:** resolusi 100/75/50/25%, CRF 15–45, kecepatan encode, latar transparan (alpha). Progres tampil real-time, hasil bisa langsung dipratinjau dan diunduh.

## Shortcut

| Tombol | Aksi |
| --- | --- |
| Spasi | Play / pause |
| J / K / L | Mundur 1 detik / stop / play |
| ← / → | Mundur / maju 1 frame (Shift = 1 detik) |
| Home / End | Ke awal / akhir |
| S | Split klip terpilih di playhead |
| Alt+K | Tambah keyframe untuk properti beranimasi di playhead |
| Delete | Hapus keyframe atau klip terpilih |
| Ctrl+D | Duplikat klip |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo |
| Ctrl+S | Simpan sekarang (autosave tetap aktif) |
| + / − atau Ctrl+scroll | Zoom timeline |
| Shift saat drag | Kunci sumbu gerak / rotasi kelipatan 15° |

## Catatan teknis

- **H.264 & Chromium headless.** Chromium bawaan Puppeteer bisa tidak memiliki codec H.264. Bila terdeteksi, server otomatis membuat salinan VP9 berkualitas tinggi (CRF 12) khusus render di `data/media/render-proxy/`, sekali per video. Pratinjau di Chrome biasa tetap memakai file asli.
  Alternatifnya, pakai Chrome yang sudah terpasang: set `PUPPETEER_EXECUTABLE_PATH` ke `chrome.exe`.
- Video selain H.264/VP8/VP9/AV1 (misalnya ProRes, HEVC `.mov`, `.mkv`) dikonversi ke WebM VP9 saat upload. Alpha tetap dipertahankan.
- Audio dari klip audio dan video dimix oleh FFmpeg (volume & mute per klip ikut diterapkan).
- Server hanya listen di `127.0.0.1`, jadi tidak bisa diakses dari jaringan.

### Variabel lingkungan (opsional)

| Variabel | Default | Fungsi |
| --- | --- | --- |
| `PORT` | `3001` | Port server API |
| `DATA_DIR` | `./data` | Lokasi penyimpanan |
| `MAX_UPLOAD_MB` | `500` | Batas ukuran upload |
| `FFMPEG_PATH` / `FFPROBE_PATH` | dari `ffmpeg-static` | Pakai FFmpeg sendiri |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium Puppeteer | Pakai Chrome sendiri untuk render |

## Struktur

```
client/                 Vite + React
  index.html            editor
  render.html           halaman render headless
  src/engine/           evaluate (keyframe), easing, compositor, preset logo, media pool
  src/store/            state editor + undo/redo + autosave
  src/components/       TopBar, MediaLibrary, PreviewCanvas, Inspector, Timeline, ExportDialog
server/
  src/index.js          HTTP server + routing + file statis (dengan Range)
  src/storage.js        proyek & aset (JSON)
  src/media.js          upload, ffprobe, thumbnail, transcode, sanitasi SVG
  src/render.js         antrean render, Puppeteer → FFmpeg, mix audio
```

## Kalau ada masalah

- **`npm install` gagal saat mengunduh Chromium:** jalankan `set PUPPETEER_SKIP_DOWNLOAD=1` (CMD) atau `$env:PUPPETEER_SKIP_DOWNLOAD=1` (PowerShell), lalu `npm install`, lalu set `PUPPETEER_EXECUTABLE_PATH` ke Chrome Anda, misalnya `C:\Program Files\Google\Chrome\Application\chrome.exe`.
- **Render gagal "Halaman render tidak siap":** pastikan `npm run dev` berjalan lengkap (API dan web), atau gunakan `npm start`.
- **Font teks tidak sesuai di hasil render:** font diambil dari Google Fonts, jadi butuh koneksi internet saat render.
