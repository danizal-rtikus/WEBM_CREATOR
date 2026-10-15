// Pustaka SFX bawaan: dibuat sekali secara prosedural oleh FFmpeg (tanpa file pihak ketiga).
import fs from 'node:fs';
import path from 'node:path';
import { DIRS } from './config.js';
import { ffmpeg } from './ffmpeg.js';
import { listAssets, addAsset } from './storage.js';

const SFX = [
  {
    id: 'whoosh', name: 'SFX · Whoosh', duration: 0.9,
    args: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.9:c=pink:a=0.8:r=48000',
      '-af', 'highpass=f=180,lowpass=f=3800,afade=t=in:st=0:d=0.5:curve=exp,afade=t=out:st=0.5:d=0.4:curve=exp,volume=2.2'],
  },
  {
    id: 'swoosh', name: 'SFX · Swoosh cepat', duration: 0.45,
    args: ['-f', 'lavfi', '-i', 'anoisesrc=d=0.45:c=white:a=0.6:r=48000',
      '-af', 'highpass=f=900,lowpass=f=7000,afade=t=in:st=0:d=0.18:curve=exp,afade=t=out:st=0.18:d=0.27,volume=1.6'],
  },
  {
    id: 'pop', name: 'SFX · Pop', duration: 0.22,
    args: ['-f', 'lavfi', '-i', "aevalsrc='0.8*sin(2*PI*(260+2400*t)*t)*exp(-24*t)':s=48000:d=0.22"],
  },
  {
    id: 'impact', name: 'SFX · Impact', duration: 1.1,
    args: ['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*46*t)*exp(-3.2*t)+0.45*sin(2*PI*92*t)*exp(-6*t)':s=48000:d=1.1",
      '-f', 'lavfi', '-i', 'anoisesrc=d=1.1:c=brown:a=0.9:r=48000',
      '-filter_complex', '[1:a]lowpass=f=900,afade=t=out:st=0:d=0.35[n];[0:a][n]amix=inputs=2:normalize=0,volume=1.3'],
  },
  {
    id: 'chime', name: 'SFX · Chime', duration: 1.3,
    args: ['-f', 'lavfi', '-i', "aevalsrc='0.22*(sin(2*PI*1318.5*t)+sin(2*PI*1760*t)*exp(-1*t)+sin(2*PI*2637*t)*exp(-2*t))*exp(-2.4*t)':s=48000:d=1.3"],
  },
  {
    id: 'riser', name: 'SFX · Riser', duration: 1.3,
    args: ['-f', 'lavfi', '-i', "aevalsrc='0.35*sin(2*PI*(140*t+380*t*t))*(t/1.3)':s=48000:d=1.3",
      '-f', 'lavfi', '-i', 'anoisesrc=d=1.3:c=white:a=0.5:r=48000',
      '-filter_complex', '[1:a]highpass=f=2000,afade=t=in:st=0:d=1.25:curve=exp[n];[0:a][n]amix=inputs=2:normalize=0,afade=t=out:st=1.2:d=0.1'],
  },
  {
    id: 'wind', name: 'SFX · Angin', duration: 2.2,
    args: ['-f', 'lavfi', '-i', 'anoisesrc=d=2.2:c=pink:a=0.8:r=48000',
      '-af', 'highpass=f=150,lowpass=f=1300,tremolo=f=1.3:d=0.4,afade=t=in:st=0:d=0.8,afade=t=out:st=1.3:d=0.9,volume=2'],
  },
];

export async function ensureSfx() {
  const dir = path.join(DIRS.media, 'sfx');
  fs.mkdirSync(dir, { recursive: true });
  const assets = await listAssets();
  for (const s of SFX) {
    const file = `sfx/${s.id}.ogg`;
    const abs = path.join(DIRS.media, file);
    if (!fs.existsSync(abs)) {
      try {
        await ffmpeg(['-y', ...s.args, '-ac', '2', '-c:a', 'libopus', '-b:a', '128k', abs]);
      } catch (e) {
        console.warn(`[sfx] gagal membuat ${s.id}: ${e.message}`);
        continue;
      }
    }
    if (!assets.find((a) => a.id === `sfx_${s.id}`)) {
      await addAsset({
        id: `sfx_${s.id}`,
        name: s.name,
        kind: 'audio',
        file,
        url: `/media/${file}`,
        size: fs.statSync(abs).size,
        duration: s.duration,
        hasAudio: true,
        codec: 'opus',
        sfx: s.id,
        builtin: true,
        createdAt: new Date().toISOString(),
      });
    }
  }
}
