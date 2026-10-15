// Lokasi biner FFmpeg/ffprobe + helper menjalankan proses.
import { spawn } from 'node:child_process';

async function resolveBin(envName, pkg, fallback) {
  if (process.env[envName]) return process.env[envName];
  try {
    const mod = await import(pkg);
    const p = mod.default && (typeof mod.default === 'string' ? mod.default : mod.default.path);
    if (p) return p;
  } catch {
    /* paket opsional tidak terpasang */
  }
  return fallback;
}

export const FFMPEG = await resolveBin('FFMPEG_PATH', 'ffmpeg-static', 'ffmpeg');
export const FFPROBE = await resolveBin('FFPROBE_PATH', 'ffprobe-static', 'ffprobe');

/** Jalankan proses, kembalikan { code, stdout, stderr }. */
export function run(bin, args, { onSpawn } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    if (onSpawn) onSpawn(p);
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 200000) stderr = stderr.slice(-100000);
    });
    p.on('error', (e) => {
      if (e.code === 'ENOENT') reject(new Error(`Tidak menemukan "${bin}". Pasang FFmpeg atau jalankan npm install.`));
      else reject(e);
    });
    p.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export async function ffprobe(file) {
  const { code, stdout, stderr } = await run(FFPROBE, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  if (code !== 0) throw new Error(`ffprobe gagal: ${stderr.trim().split('\n').pop()}`);
  return JSON.parse(stdout);
}

export async function ffmpeg(args, opts) {
  const res = await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], opts);
  if (res.code !== 0) throw new Error(`FFmpeg gagal: ${res.stderr.trim().split('\n').slice(-3).join(' | ')}`);
  return res;
}
