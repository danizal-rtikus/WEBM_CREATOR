// Sanitasi & ukuran SVG (port dari server/src/media.js) untuk mode browser.
export function sanitizeSvg(src) {
  return src
    .replace(/<\?xml-stylesheet[\s\S]*?\?>/gi, '')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script[^>]*\/>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href\s*=\s*["'])\s*(javascript:|https?:|\/\/)[^"']*(["'])/gi, '$1#$3')
    .replace(/@import[^;]+;/gi, '');
}

export function svgSize(src) {
  const tag = (src.match(/<svg\b[^>]*>/i) || [''])[0];
  const num = (attr) => {
    const m = tag.match(new RegExp(`\\s${attr}\\s*=\\s*["']?([\\d.]+)(px)?["']?`, 'i'));
    return m ? parseFloat(m[1]) : null;
  };
  let w = num('width');
  let h = num('height');
  const vb = tag.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if ((!w || !h) && vb) {
    const vw = parseFloat(vb[1]);
    const vh = parseFloat(vb[2]);
    if (w && !h) h = (w * vh) / vw;
    else if (h && !w) w = (h * vw) / vh;
    else {
      w = vw;
      h = vh;
    }
  }
  w = w || 512;
  h = h || 512;
  // Rasterisasi SVG mengikuti ukuran ini; naikkan agar logo tetap tajam di 4K
  const k = Math.max(1, 1024 / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** Pastikan SVG punya width/height eksplisit agar browser tahu ukuran naturalnya. */
export function normalizeSvg(src, size) {
  return src.replace(/<svg\b([^>]*)>/i, (m, attrs) => {
    let a = attrs.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    if (!/viewBox/i.test(a)) a += ` viewBox="0 0 ${size.width} ${size.height}"`;
    return `<svg${a} width="${size.width}" height="${size.height}">`;
  });
}

