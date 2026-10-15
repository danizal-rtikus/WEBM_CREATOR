// Penulis file WebM (Matroska/EBML) minimal untuk mode browser.
// Mendukung video VP9 (+ alpha lewat BlockAdditions) dan audio Opus, lengkap dengan Cues & SeekHead.

const te = new TextEncoder();

function idBytes(id) {
  const b = [];
  let v = id;
  while (v > 0) {
    b.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return Uint8Array.from(b);
}

function vint(n) {
  for (let len = 1; len <= 8; len++) {
    if (n < 2 ** (7 * len) - 1) {
      const b = new Uint8Array(len);
      let v = n;
      for (let i = len - 1; i >= 0; i--) {
        b[i] = v % 256;
        v = Math.floor(v / 256);
      }
      b[0] |= 1 << (8 - len);
      return b;
    }
  }
  throw new Error('Ukuran elemen terlalu besar');
}

function uintBytes(v, fixed = 0) {
  const b = [];
  let x = Math.max(0, Math.round(v));
  while (x > 0) {
    b.unshift(x % 256);
    x = Math.floor(x / 256);
  }
  while (b.length < Math.max(1, fixed)) b.unshift(0);
  return Uint8Array.from(b);
}

/** Potongan biner: kumpulan Uint8Array + total panjang (tanpa menyalin data besar). */
function chunk(...items) {
  const parts = [];
  let len = 0;
  for (const it of items.flat()) {
    if (!it) continue;
    if (it instanceof Uint8Array) {
      parts.push(it);
      len += it.length;
    } else {
      parts.push(...it.parts);
      len += it.len;
    }
  }
  return { parts, len };
}

const el = (id, ...items) => {
  const body = chunk(...items);
  return chunk(idBytes(id), vint(body.len), body);
};
const uintEl = (id, v, fixed) => el(id, uintBytes(v, fixed));
const strEl = (id, s) => el(id, te.encode(s));
const floatEl = (id, v) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v);
  return el(id, b);
};

const ID = {
  EBML: 0x1a45dfa3, Segment: 0x18538067, SeekHead: 0x114d9b74, Seek: 0x4dbb, SeekID: 0x53ab, SeekPosition: 0x53ac,
  Info: 0x1549a966, TimestampScale: 0x2ad7b1, MuxingApp: 0x4d80, WritingApp: 0x5741, Duration: 0x4489,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83, FlagLacing: 0x9c,
  CodecID: 0x86, CodecPrivate: 0x63a2, CodecDelay: 0x56aa, SeekPreRoll: 0x56bb, DefaultDuration: 0x23e383,
  MaxBlockAdditionID: 0x55ee, Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba, AlphaMode: 0x53c0,
  Audio: 0xe1, SamplingFrequency: 0xb5, Channels: 0x9f,
  Cluster: 0x1f43b675, Timestamp: 0xe7, SimpleBlock: 0xa3, BlockGroup: 0xa0, Block: 0xa1, ReferenceBlock: 0xfb,
  BlockAdditions: 0x75a1, BlockMore: 0xa6, BlockAddID: 0xee, BlockAdditional: 0xa5,
  Cues: 0x1c53bb6b, CuePoint: 0xbb, CueTime: 0xb3, CueTrackPositions: 0xb7, CueTrack: 0xf7, CueClusterPosition: 0xf1,
};

function opusHead(channels = 2, sampleRate = 48000, preSkip = 312) {
  const b = new Uint8Array(19);
  b.set(te.encode('OpusHead'), 0);
  const dv = new DataView(b.buffer);
  b[8] = 1;
  b[9] = channels;
  dv.setUint16(10, preSkip, true);
  dv.setUint32(12, sampleRate, true);
  dv.setInt16(16, 0, true);
  b[18] = 0;
  return b;
}

export class WebMWriter {
  constructor({ width, height, fps, alpha = false, audio = null }) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.alpha = alpha;
    this.audio = audio; // { sampleRate, channels }
    this.blocks = []; // { track, ms, key, data, alphaData }
    this.audioPrivate = null;
  }

  addVideo(data, timestampUs, key, alphaData) {
    this.blocks.push({ track: 1, ms: Math.round(timestampUs / 1000), key: !!key, data, alphaData: this.alpha ? alphaData : null });
  }

  setAudioPrivate(description) {
    if (description) this.audioPrivate = new Uint8Array(description instanceof ArrayBuffer ? description : description.buffer ? new Uint8Array(description.buffer, description.byteOffset, description.byteLength) : description);
  }

  addAudio(data, timestampUs) {
    this.blocks.push({ track: 2, ms: Math.round(timestampUs / 1000), key: true, data });
  }

  block(b, clusterMs) {
    const rel = b.ms - clusterMs;
    const head = new Uint8Array(4);
    head[0] = 0x80 | b.track;
    new DataView(head.buffer).setInt16(1, rel);
    if (b.alphaData && b.alphaData.byteLength) {
      head[3] = 0x00;
      return el(
        ID.BlockGroup,
        el(ID.Block, head, b.data),
        el(ID.BlockAdditions, el(ID.BlockMore, uintEl(ID.BlockAddID, 1), el(ID.BlockAdditional, b.alphaData))),
        b.key ? null : el(ID.ReferenceBlock, Uint8Array.of(0xff)),
      );
    }
    head[3] = b.key ? 0x80 : 0x00;
    return el(ID.SimpleBlock, head, b.data);
  }

  finalize(durationSec) {
    const header = el(
      ID.EBML,
      uintEl(0x4286, 1), uintEl(0x42f7, 1), uintEl(0x42f2, 4), uintEl(0x42f3, 8),
      strEl(0x4282, 'webm'), uintEl(0x4287, 4), uintEl(0x4285, 2),
    );

    const info = el(
      ID.Info,
      uintEl(ID.TimestampScale, 1000000),
      strEl(ID.MuxingApp, 'WEBM Editor'),
      strEl(ID.WritingApp, 'WEBM Editor (browser)'),
      floatEl(ID.Duration, durationSec * 1000),
    );

    const videoTrack = el(
      ID.TrackEntry,
      uintEl(ID.TrackNumber, 1), uintEl(ID.TrackUID, 1), uintEl(ID.TrackType, 1), uintEl(ID.FlagLacing, 0),
      strEl(ID.CodecID, 'V_VP9'),
      uintEl(ID.DefaultDuration, Math.round(1e9 / this.fps)),
      this.alpha ? uintEl(ID.MaxBlockAdditionID, 1) : null,
      el(ID.Video, uintEl(ID.PixelWidth, this.width), uintEl(ID.PixelHeight, this.height), this.alpha ? uintEl(ID.AlphaMode, 1) : null),
    );
    const hasAudio = this.audio && this.blocks.some((b) => b.track === 2);
    const audioTrack = hasAudio
      ? el(
          ID.TrackEntry,
          uintEl(ID.TrackNumber, 2), uintEl(ID.TrackUID, 2), uintEl(ID.TrackType, 2), uintEl(ID.FlagLacing, 0),
          strEl(ID.CodecID, 'A_OPUS'),
          el(ID.CodecPrivate, this.audioPrivate && this.audioPrivate.length >= 19 ? this.audioPrivate : opusHead(this.audio.channels, this.audio.sampleRate)),
          uintEl(ID.CodecDelay, 6500000),
          uintEl(ID.SeekPreRoll, 80000000),
          el(ID.Audio, floatEl(ID.SamplingFrequency, this.audio.sampleRate), uintEl(ID.Channels, this.audio.channels)),
        )
      : null;
    const tracks = el(ID.Tracks, videoTrack, audioTrack);

    // Susun cluster: mulai cluster baru di setiap keyframe video (atau tiap 30 s)
    const blocks = this.blocks.filter((b) => b.track === 1 || hasAudio).sort((a, b) => a.ms - b.ms || a.track - b.track);
    const clusters = [];
    let cur = null;
    for (const b of blocks) {
      const startNew = !cur || (b.track === 1 && b.key && cur.items.length) || b.ms - cur.ms > 30000;
      if (startNew) {
        cur = { ms: b.ms, items: [], keyStart: b.track === 1 && b.key };
        clusters.push(cur);
      }
      cur.items.push(b);
    }
    const clusterEls = clusters.map((c) => ({ c, el: el(ID.Cluster, uintEl(ID.Timestamp, c.ms), ...c.items.map((b) => this.block(b, c.ms))) }));

    const seekHead = (pInfo, pTracks, pCues) =>
      el(
        ID.SeekHead,
        el(ID.Seek, el(ID.SeekID, idBytes(ID.Info)), uintEl(ID.SeekPosition, pInfo, 8)),
        el(ID.Seek, el(ID.SeekID, idBytes(ID.Tracks)), uintEl(ID.SeekPosition, pTracks, 8)),
        el(ID.Seek, el(ID.SeekID, idBytes(ID.Cues)), uintEl(ID.SeekPosition, pCues, 8)),
      );
    const shLen = seekHead(0, 0, 0).len;
    const pInfo = shLen;
    const pTracks = pInfo + info.len;
    let pos = pTracks + tracks.len;
    const cuePoints = [];
    for (const { c, el: ce } of clusterEls) {
      if (c.keyStart) cuePoints.push(el(ID.CuePoint, uintEl(ID.CueTime, c.ms), el(ID.CueTrackPositions, uintEl(ID.CueTrack, 1), uintEl(ID.CueClusterPosition, pos, 8))));
      pos += ce.len;
    }
    const cues = el(ID.Cues, ...cuePoints);
    const segment = el(ID.Segment, seekHead(pInfo, pTracks, pos), info, tracks, ...clusterEls.map((x) => x.el), cues);
    const all = chunk(header, segment);
    return new Blob(all.parts, { type: 'video/webm' });
  }
}
