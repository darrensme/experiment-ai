// The app's background: a dot-matrix (ordered-dither) field with a glowing diagonal streak, in blues.
// Drawn once into a canvas at the window's size (redrawn on resize and theme change). Light and dark palettes.
(() => {
  const cv = document.getElementById('dither-bg');
  if (!cv) return;
  const CELL = 3; // each dot is 2×2 px inside a 3×3 px cell
  const PALETTES = {
    night: { base: [5, 7, 12], dots: ['#0a1222', '#0d1c3c', '#11295c', '#163a86', '#1d50b4', '#2a6fe0', '#4d93ff', '#8fc0ff', '#d6eaff', '#f4faff'] },
    light: { base: [233, 239, 247], dots: ['#d9e3f1', '#c5d5ec', '#a9c2e7', '#86a9e0', '#5e8bd6', '#3a6ecb', '#2558b8', '#1a479d', '#123a85', '#0c2e6e'] },
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // smooth value noise, so the streak has wisps instead of a flat gradient
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const u = x - xi; const v = y - yi;
    const su = u * u * (3 - 2 * u); const sv = v * v * (3 - 2 * v);
    const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  const fbm = (x, y) => noise(x, y) * 0.55 + noise(x * 2.1, y * 2.1) * 0.28 + noise(x * 4.3, y * 4.3) * 0.17;
  const isNight = () => {
    const t = document.documentElement.dataset.theme;
    return t === 'night' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  };

  function draw() {
    const W = innerWidth; const H = innerHeight;
    const cols = Math.ceil(W / CELL); const rows = Math.ceil(H / CELL);
    cv.width = cols * CELL; cv.height = rows * CELL;
    cv.style.width = `${cv.width}px`; cv.style.height = `${cv.height}px`;
    const night = isNight();
    const pal = PALETTES[night ? 'night' : 'light'];
    const dots = pal.dots.map(hex);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cv.width, cv.height);
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) { px[i] = pal.base[0]; px[i + 1] = pal.base[1]; px[i + 2] = pal.base[2]; px[i + 3] = 255; }
    // the streak: a line from the upper left falling to the lower right, glowing wide above and tight below
    const x0 = 0.12 * W; const y0 = 0.14 * H; const slope = 0.5;
    const len = Math.hypot(1, slope);
    const tx = 1 / len; const ty = slope / len; // along the line
    const nx = -slope / len; const ny = 1 / len; // across it (positive = below)
    const width = Math.max(W, H) * 0.15;
    const top = dots.length - 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL + 1; const y = r * CELL + 1;
        const dx = x - x0; const dy = y - y0;
        const d = dx * nx + dy * ny;
        const t = dx * tx + dy * ty;
        const w = d < 0 ? width * 1.5 : width * 0.62;
        let v = Math.exp(-(d * d) / (w * w));
        v *= 0.45 + 1.0 * fbm(t / 210, d / 55 + 7.3); // wisps along the streak
        v += 0.1 * fbm(x / 70 + 3, y / 70) - 0.02; // faint speckle everywhere
        if (v <= 0) continue;
        if (v > 1) v = 1;
        const th = BAYER[(r & 3) * 4 + (c & 3)];
        const level = v * top;
        let idx = Math.floor(level) + (level - Math.floor(level) > th ? 1 : 0);
        if (idx <= 0) continue; // an empty cell keeps the dot-matrix gaps
        if (idx > top) idx = top;
        const [R, G, B] = dots[idx];
        const p0 = ((y - 1) * cv.width + (x - 1)) * 4; const p1 = p0 + cv.width * 4;
        px[p0] = R; px[p0 + 1] = G; px[p0 + 2] = B; px[p0 + 4] = R; px[p0 + 5] = G; px[p0 + 6] = B;
        px[p1] = R; px[p1 + 1] = G; px[p1 + 2] = B; px[p1 + 4] = R; px[p1 + 5] = G; px[p1 + 6] = B;
      }
    }
    ctx.putImageData(img, 0, 0);
    cv.classList.add('ready');
  }

  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(draw, 160); };
  addEventListener('resize', later);
  new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', later);
  draw();
})();
