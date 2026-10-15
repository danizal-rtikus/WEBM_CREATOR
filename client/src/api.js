// Facade backend: otomatis memilih "server lokal" (Node.js + FFmpeg) bila tersedia,
// atau "browser" (IndexedDB + WebCodecs) saat dijalankan sebagai situs statis (mis. Vercel).
import { detectServer, serverBackend } from './backend/server.js';

let impl = null;

export async function initBackend() {
  if (impl) return impl;
  const forced = new URLSearchParams(location.search).get('mode');
  const useServer = forced === 'browser' ? false : await detectServer();
  if (useServer) impl = serverBackend;
  else {
    const { browserBackend } = await import('./backend/browser.js');
    await browserBackend.init();
    impl = browserBackend;
  }
  return impl;
}

const need = () => {
  if (!impl) throw new Error('Backend belum siap');
  return impl;
};

export const api = new Proxy(
  {},
  {
    get(_t, key) {
      if (key === 'ready') return !!impl;
      const b = need();
      const v = b[key];
      return typeof v === 'function' ? v.bind(b) : v;
    },
  },
);
