// The app's background, drawn as a dot-matrix (ordered dither) into a canvas at the window's size, redrawn on resize
// and theme change. Two different designs:
//   dark:  a glowing diagonal streak in blues on near-black
//   light: a light blue sky, with blue dotted waves across the lower part, and white dotted clouds, foam and a sun ring
(() => {
  const cv = document.getElementById('dither-bg');
  if (!cv) return;
  const CELL = 3; // each dot is 2×2 px inside a 3×3 px cell
  const PALETTES = {
    night: { base: [5, 7, 12], baseEnd: [5, 7, 12], dots: ['#0a1222', '#0d1c3c', '#11295c', '#163a86', '#1d50b4', '#2a6fe0', '#4d93ff', '#8fc0ff', '#d6eaff', '#f4faff'] },
    light: { base: [150, 195, 248], baseEnd: [196, 223, 252], dots: ['#a9cbf7', '#94bdf5', '#80b0f3', '#6ca3f0', '#5a96ed', '#4a89e9', '#3e7de3', '#3672db', '#2f68d0', '#2a5ec2'] },
  };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  // smooth value noise, so shapes have wisps instead of flat gradients
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
    // themes are 'day' (Light), 'night' (Dark) and 'auto' (System)
    return t === 'night' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  };

  // dark: a line from the upper left falling to the lower right, glowing wide above and tight below
  function streakField(W, H) {
    const x0 = 0.12 * W; const y0 = 0.14 * H; const slope = 0.5;
    const len = Math.hypot(1, slope);
    const tx = 1 / len; const ty = slope / len; const nx = -slope / len; const ny = 1 / len;
    const width = Math.max(W, H) * 0.15;
    return (x, y) => {
      const dx = x - x0; const dy = y - y0;
      const d = dx * nx + dy * ny; const t = dx * tx + dy * ty;
      const w = d < 0 ? width * 1.5 : width * 0.62;
      let v = Math.exp(-(d * d) / (w * w));
      v *= 0.45 + 1.0 * fbm(t / 210, d / 55 + 7.3); // wisps along the streak
      return v + 0.1 * fbm(x / 70 + 3, y / 70) - 0.02; // faint speckle everywhere
    };
  }

  // light: blue waves across the lower part, with a gentle rise along the bottom edge
  function waveField(W, H) {
    return (x, y) => {
      let v = 0;
      for (let k = 0; k < 4; k++) {
        const yk = H * (0.6 + k * 0.085)
          + Math.sin((x / W) * Math.PI * 2 * (0.7 + k * 0.15) + k * 1.7) * H * (0.045 + k * 0.01)
          + (fbm(x / 260 + k * 5, k) - 0.5) * H * 0.04;
        const w = H * (0.045 + k * 0.01);
        const d = y - yk;
        v += Math.exp(-(d * d) / (w * w)) * (0.46 - k * 0.07);
      }
      const rise = Math.max(0, (y - H * 0.72) / (H * 0.28));
      v += 0.2 * rise * rise;
      return v * (0.72 + 0.5 * fbm(x / 120, y / 120)) - 0.02;
    };
  }

  // light: the white layer, drawn wherever the waves leave a gap: clouds up top, foam over the waves, a sun ring top right
  function whiteField(W, H) {
    const R = Math.min(W, H) * 0.13;
    const sx = W * 0.84; const sy = H * 0.2;
    return (x, y) => {
      const cloud = (fbm(x / 300 + 2, y / 130 + 9) - 0.42) * 4.2 * Math.max(0, 1 - y / (H * 0.72));
      const fy = H * 0.5 + Math.sin((x / W) * Math.PI * 2 * 0.7) * H * 0.05;
      const foam = 0.75 * Math.exp(-((y - fy) ** 2) / ((H * 0.1) ** 2));
      const dist = Math.hypot(x - sx, y - sy);
      const sun = 0.95 * Math.exp(-((dist - R) ** 2) / ((R * 0.14) ** 2)) + 0.5 * Math.exp(-(dist * dist) / ((R * 0.72) ** 2));
      return Math.max(0, cloud) + foam * (0.5 + fbm(x / 110, y / 60)) + sun;
    };
  }

  function draw() {
    const W = innerWidth; const H = innerHeight;
    const cols = Math.ceil(W / CELL); const rows = Math.ceil(H / CELL);
    cv.width = cols * CELL; cv.height = rows * CELL;
    cv.style.width = `${cv.width}px`; cv.style.height = `${cv.height}px`;
    const night = isNight();
    const pal = PALETTES[night ? 'night' : 'light'];
    const field = night ? streakField(W, H) : waveField(W, H);
    const white = night ? null : whiteField(W, H);
    const dots = pal.dots.map(hex);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(cv.width, cv.height);
    const px = img.data;
    for (let y = 0; y < cv.height; y++) { // the base fades from top to bottom (flat in dark)
      const f = y / cv.height;
      const [r, g, b] = pal.base.map((c, n) => Math.round(c + (pal.baseEnd[n] - c) * f));
      for (let x = 0; x < cv.width; x++) { const i = (y * cv.width + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; }
    }
    const top = dots.length - 1;
    const put = (x, y, [R, G, B]) => { // one 2×2 dot
      const p0 = ((y - 1) * cv.width + (x - 1)) * 4; const p1 = p0 + cv.width * 4;
      px[p0] = R; px[p0 + 1] = G; px[p0 + 2] = B; px[p0 + 4] = R; px[p0 + 5] = G; px[p0 + 6] = B;
      px[p1] = R; px[p1 + 1] = G; px[p1 + 2] = B; px[p1 + 4] = R; px[p1 + 5] = G; px[p1 + 6] = B;
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL + 1; const y = r * CELL + 1;
        const th = BAYER[(r & 3) * 4 + (c & 3)];
        const v = Math.min(field(x, y), 1);
        const level = v * top;
        let idx = v <= 0 ? 0 : Math.floor(level) + (level - Math.floor(level) > th ? 1 : 0);
        if (idx > top) idx = top;
        if (white && idx <= 3 && white(x, y) > th) put(x, y, [255, 255, 255]); // white breaks up the waves' top edge
        else if (idx > 0) put(x, y, dots[idx]); // an empty cell keeps the dot-matrix gaps
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
