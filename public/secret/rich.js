// Rich replies: Markdown (headings, lists, tables, quotes, links, bold/italic, inline code),
// code blocks with a Copy button (Geist Mono), and Experiment UI: ```chart blocks drawn as SVG charts.
// Plain script, loaded before app.js. Builds DOM nodes only (never innerHTML from the reply), so replies can't inject HTML.

(() => {
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.flat(Infinity).filter((c) => c != null && c !== false && c !== ''));
    return n;
  };
  const SVGNS = 'http://www.w3.org/2000/svg';
  const s = (tag, attrs = {}, ...kids) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) n.setAttribute(k, v);
    n.append(...kids.flat(Infinity).filter((c) => c != null && c !== false));
    return n;
  };
  const ico = (paths) => { const n = s('svg', { viewBox: '0 0 256 256', class: 'ico', 'aria-hidden': 'true' }); n.innerHTML = paths; return n; };
  const COPY = '<path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/>';
  const TICK = '<path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/>';

  // a button that copies text and shows a tick for a moment
  function copyButton(getText, label = 'Copy') {
    const txt = h('span', {}, label);
    const b = h('button', { type: 'button', class: 'copy-btn', title: label, 'aria-label': label }, ico(COPY), txt);
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(getText()); } catch { return; }
      b.replaceChildren(ico(TICK), h('span', {}, 'Copied'));
      b.classList.add('done');
      setTimeout(() => { b.replaceChildren(ico(COPY), txt); b.classList.remove('done'); }, 1600);
    });
    return b;
  }

  /* ── inline: `code`, **bold**, *italic*, ~~strike~~, [links](https://…), bare https:// links ── */
  const INLINE = /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|(?<![\w*])\*(?!\s)([^*\n]+?)\*(?!\w)|(?<![\w_])_(?!\s)([^_\n]+?)_(?!\w)|~~([\s\S]+?)~~|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  const safeUrl = (u) => (/^(https?:|mailto:)/i.test(u) ? u : null);
  function inline(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(INLINE)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      last = m.index + m[0].length;
      if (m[2] != null) out.push(h('code', { class: 'ic' }, m[2].replace(/^ (.*) $/, '$1')));
      else if (m[3] != null || m[4] != null) out.push(h('strong', {}, inline(m[3] ?? m[4])));
      else if (m[5] != null || m[6] != null) out.push(h('em', {}, inline(m[5] ?? m[6])));
      else if (m[7] != null) out.push(h('del', {}, inline(m[7])));
      else if (m[8] != null) {
        const url = safeUrl(m[9]);
        out.push(url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, inline(m[8])) : m[0]);
      } else if (m[10] != null) out.push(h('a', { href: m[10], target: '_blank', rel: 'noopener noreferrer' }, m[10]));
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  /* ── code blocks ── */
  function codeBlock(code, lang) {
    return h('div', { class: 'code-block' },
      h('div', { class: 'code-head' }, h('span', { class: 'code-lang' }, lang || 'code'), copyButton(() => code)),
      h('pre', {}, h('code', {}, code)));
  }

  /* ── tables ── */
  const cells = (line) => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
  const isRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
  function table(head, rows, aligns) {
    return h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, head.map((c, i) => h('th', { style: aligns[i] && `text-align:${aligns[i]}` }, inline(c))))),
      h('tbody', {}, rows.map((r) => h('tr', {}, head.map((_, i) => h('td', { style: aligns[i] && `text-align:${aligns[i]}` }, inline(r[i] || ''))))))));
  }

  /* ── block parser ── */
  function blocks(text, streaming) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = [];
    const flush = () => { if (para.length) { out.push(h('p', {}, inline(para.join('\n')))); para = []; } };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/);
      if (fence) {
        flush();
        const body = [];
        let j = i + 1;
        while (j < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[j])) body.push(lines[j++]);
        const closed = j < lines.length;
        const lang = fence[2].toLowerCase();
        if (lang === 'chart') out.push(closed || !streaming ? chartBlock(body.join('\n')) : h('div', { class: 'chart-wait' }, h('span', { class: 'spinner' }), 'Drawing a chart…'));
        else out.push(codeBlock(body.join('\n'), fence[2]));
        i = closed ? j : lines.length;
        continue;
      }
      if (!line.trim()) { flush(); continue; }
      const head = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
      if (head) { flush(); out.push(h(`h${Math.min(6, head[1].length + 2)}`, { class: 'md-h' }, inline(head[2]))); continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push(h('hr')); continue; }
      if (/^\s*>/.test(line)) {
        flush();
        const q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        i--;
        out.push(h('blockquote', {}, blocks(q.join('\n'), streaming)));
        continue;
      }
      if (line.includes('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
        flush();
        const headCells = cells(line);
        const aligns = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : null));
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
        i--;
        out.push(table(headCells, rows, aligns));
        continue;
      }
      const item = line.match(/^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/);
      if (item) {
        flush();
        const ordered = /\d/.test(item[2]);
        const indent = item[1].length;
        const list = h(ordered ? 'ol' : 'ul', ordered && Number.parseInt(item[2], 10) !== 1 ? { start: Number.parseInt(item[2], 10) } : {});
        let li = null;
        for (; i < lines.length; i++) {
          const l = lines[i];
          const m = l.match(/^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/);
          if (m && m[1].length <= indent + 1 && /\d/.test(m[2]) === ordered) {
            const task = m[3].match(/^\[([ xX])\]\s+(.*)$/);
            li = h('li', task ? { class: 'task' } : {}, task && h('span', { class: `tick${task[1] === ' ' ? '' : ' on'}`, 'aria-hidden': 'true' }), inline(task ? task[2] : m[3]));
            list.append(li);
          } else if (l.trim() && /^\s{2,}/.test(l) && li) {
            // a nested list or a continued line under the current item
            const rest = [];
            while (i < lines.length && (lines[i].trim() === '' ? /^\s{2,}/.test(lines[i + 1] || '') : /^\s{2,}/.test(lines[i]))) rest.push(lines[i++].replace(/^\s{2,4}/, ''));
            i--;
            li.append(...blocks(rest.join('\n'), streaming));
          } else { i--; break; }
        }
        out.push(list);
        continue;
      }
      para.push(line);
    }
    flush();
    return out;
  }

  /* ───────── Experiment UI: charts ───────── */
  const SERIES = 8; // colour slots, fixed order (CSS: --s1 … --s8, validated light + dark)
  const fmt = (v, unit = '') => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v ?? '');
    const abs = Math.abs(v);
    const n = abs >= 1e9 ? `${+(v / 1e9).toFixed(1)}B` : abs >= 1e6 ? `${+(v / 1e6).toFixed(1)}M` : abs >= 1e4 ? `${+(v / 1e3).toFixed(1)}K` : `${+v.toFixed(abs < 10 ? 2 : abs < 100 ? 1 : 0)}`;
    return unit === '$' ? `${v < 0 ? '−' : ''}$${n.replace('-', '')}` : unit === '%' ? `${n}%` : unit ? `${n} ${unit}` : n;
  };
  const full = (v, unit = '') => (typeof v === 'number'
    ? (unit === '$' ? `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`)
    : String(v ?? ''));
  // "nice" axis ticks
  function ticks(min, max, count = 5) {
    if (min === max) { max = min + 1; min = Math.min(0, min); }
    const step0 = (max - min) / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= step0) || 10 * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(10));
    return out;
  }
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(+v) ? +v : null);

  function readSpec(src) {
    const spec = JSON.parse(src);
    if (!spec || typeof spec !== 'object') throw new Error('bad');
    const type = String(spec.type || 'bar').toLowerCase();
    if (!['bar', 'hbar', 'line', 'area', 'scatter', 'dot', 'stat'].includes(type)) throw new Error('type');
    if (type === 'stat') {
      const stats = (Array.isArray(spec.stats) ? spec.stats : []).slice(0, 6).map((x) => ({ label: String(x.label ?? ''), value: String(x.value ?? ''), note: x.note != null ? String(x.note) : '' }));
      if (!stats.length) throw new Error('empty');
      return { type, title: spec.title, stats };
    }
    const series = (Array.isArray(spec.series) ? spec.series : []).slice(0, SERIES).map((x, i) => ({
      name: String(x?.name ?? `Series ${i + 1}`),
      data: (Array.isArray(x?.data) ? x.data : []).slice(0, 400),
    })).filter((x) => x.data.length);
    if (!series.length) throw new Error('empty');
    const labels = Array.isArray(spec.labels) ? spec.labels.map(String).slice(0, 400) : [];
    return { type, title: spec.title, subtitle: spec.subtitle, x: spec.x, y: spec.y, unit: spec.unit ? String(spec.unit).slice(0, 12) : '', labels, series };
  }

  function chartBlock(src) {
    let spec;
    try { spec = readSpec(src); } catch { return codeBlock(src, 'chart'); } // not a chart we can draw: show the data
    const wrap = h('figure', { class: 'chart' });
    const title = spec.title && h('figcaption', { class: 'chart-title' }, String(spec.title), spec.subtitle && h('small', {}, String(spec.subtitle)));
    if (spec.type === 'stat') {
      wrap.append(title || '', h('div', { class: 'stat-row' }, spec.stats.map((x) => h('div', { class: 'stat' },
        h('span', { class: 'stat-label' }, x.label), h('strong', { class: 'stat-value' }, x.value), x.note && h('span', { class: 'stat-note' }, x.note)))));
      return wrap;
    }
    const plot = h('div', { class: 'chart-plot' });
    const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
    const multi = spec.series.length > 1;
    const legend = multi && h('div', { class: 'chart-legend' }, spec.series.map((x, i) => h('span', {}, h('i', { class: `sw s${i + 1}` }), x.name)));
    let tableOn = false;
    const tableBox = h('div', { class: 'chart-table', hidden: true });
    const toggle = h('button', { type: 'button', class: 'chart-btn', 'aria-pressed': 'false' }, 'Table');
    toggle.addEventListener('click', () => {
      tableOn = !tableOn;
      toggle.setAttribute('aria-pressed', String(tableOn));
      tableBox.hidden = !tableOn;
      plot.hidden = tableOn;
      if (tableOn && !tableBox.firstChild) tableBox.append(dataTable(spec));
    });
    wrap.append(h('div', { class: 'chart-top' }, title || h('span'), h('div', { class: 'chart-tools' }, toggle, copyButton(() => csv(spec), 'CSV'))),
      legend || '', plot, tableBox, tip);
    try { draw(spec, plot, tip); } catch { plot.replaceChildren(codeBlock(src, 'chart')); }
    return wrap;
  }

  function csv(spec) {
    const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    if (spec.type === 'scatter') return ['series,x,y', ...spec.series.flatMap((x) => x.data.map((p) => [x.name, ...(Array.isArray(p) ? p : [p.x, p.y])].map(q).join(',')))].join('\n');
    const n = Math.max(spec.labels.length, ...spec.series.map((x) => x.data.length));
    return [[spec.x || 'label', ...spec.series.map((x) => x.name)].map(q).join(','),
      ...Array.from({ length: n }, (_, i) => [spec.labels[i] ?? i + 1, ...spec.series.map((x) => x.data[i] ?? '')].map(q).join(','))].join('\n');
  }
  function dataTable(spec) {
    let head; let body;
    if (spec.type === 'scatter') {
      head = ['Series', spec.x || 'x', spec.y || 'y'];
      body = spec.series.flatMap((x) => x.data.map((p) => [x.name, ...(Array.isArray(p) ? p : [p?.x, p?.y]).map((v) => full(num(v) ?? v))]));
    } else {
      const n = Math.max(spec.labels.length, ...spec.series.map((x) => x.data.length));
      head = [spec.x || '', ...spec.series.map((x) => x.name)];
      body = Array.from({ length: n }, (_, i) => [spec.labels[i] ?? String(i + 1), ...spec.series.map((x) => full(num(x.data[i]) ?? '–', spec.unit))]);
    }
    return table(head.map(String), body.map((r) => r.map(String)), head.map((_, i) => (i ? 'right' : null)));
  }

  // place the tooltip near a point inside the chart
  function showTip(tip, plot, x, y, lines) {
    tip.replaceChildren(...lines.map(([k, v, i]) => h('div', {}, i != null && h('i', { class: `sw s${i + 1}` }), k && h('span', {}, k), h('b', {}, v))));
    tip.hidden = false;
    const pr = plot.getBoundingClientRect();
    const fr = plot.parentElement.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const left = Math.min(Math.max(8, x + pr.left - fr.left - tw / 2), fr.width - tw - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${y + pr.top - fr.top - tip.offsetHeight - 12}px`;
  }

  function draw(spec, plot, tip) {
    const W = 560;
    const horiz = spec.type === 'hbar' || spec.type === 'dot';
    const scatter = spec.type === 'scatter';
    const n = scatter ? 0 : Math.max(spec.labels.length, ...spec.series.map((x) => x.data.length));
    const labels = Array.from({ length: n }, (_, i) => spec.labels[i] ?? String(i + 1));
    const H = horiz ? Math.max(160, 36 + n * (spec.type === 'dot' ? 30 : 18 + 12 * spec.series.length)) : 280;
    const vals = scatter
      ? spec.series.flatMap((x) => x.data.map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p?.x), num(p?.y)])).filter(([a, b]) => a != null && b != null))
      : spec.series.flatMap((x) => x.data.map(num).filter((v) => v != null));
    if (!vals.length) throw new Error('no numbers');
    const ys = scatter ? vals.map((p) => p[1]) : vals;
    const zero = ['bar', 'hbar', 'area'].includes(spec.type);
    const yt = ticks(Math.min(zero ? 0 : Infinity, ...ys), Math.max(zero ? 0 : -Infinity, ...ys));
    const longest = Math.max(...(horiz ? labels : yt.map((v) => fmt(v, spec.unit))).map((t) => t.length));
    const L = horiz ? Math.min(170, 16 + longest * 7.6) : Math.max(36, 14 + longest * 8);
    const pad = { l: L, r: 14, t: 10, b: horiz ? 26 : 34 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': `${spec.title || 'Chart'}. Use the Table button to read the values.` });
    const grid = s('g', { class: 'grid' });
    const marks = s('g', { class: 'marks' });
    const hits = s('g', { class: 'hits' });
    svg.append(grid, marks, hits);
    const [v0, v1] = [yt[0], yt.at(-1)];
    const val = (v) => (horiz ? pad.l + ((v - v0) / (v1 - v0)) * iw : pad.t + ih - ((v - v0) / (v1 - v0)) * ih);
    // value axis: recessive grid + labels
    for (const t of yt) {
      const p = val(t);
      grid.append(horiz
        ? s('line', { x1: p, x2: p, y1: pad.t, y2: pad.t + ih, class: t === 0 ? 'base' : '' })
        : s('line', { x1: pad.l, x2: pad.l + iw, y1: p, y2: p, class: t === 0 ? 'base' : '' }));
      grid.append(horiz
        ? s('text', { x: p, y: H - 8, 'text-anchor': 'middle' }, fmt(t, spec.unit))
        : s('text', { x: pad.l - 8, y: p + 4, 'text-anchor': 'end' }, fmt(t, spec.unit)));
    }
    if (spec.y && !horiz) plot.dataset.y = String(spec.y);
    if (spec.x) plot.dataset.x = String(spec.x);

    if (scatter) {
      const xs = vals.map((p) => p[0]);
      const xt = ticks(Math.min(...xs), Math.max(...xs));
      const xp = (v) => pad.l + ((v - xt[0]) / (xt.at(-1) - xt[0])) * iw;
      for (const t of xt) grid.append(s('text', { x: xp(t), y: H - 12, 'text-anchor': 'middle' }, fmt(t)));
      spec.series.forEach((x, si) => x.data.forEach((p) => {
        const [a, b] = Array.isArray(p) ? [num(p[0]), num(p[1])] : [num(p?.x), num(p?.y)];
        if (a == null || b == null) return;
        const cx = xp(a);
        const cy = val(b);
        const dot = s('circle', { cx, cy, r: 5, class: `mk s${si + 1}` });
        marks.append(dot);
        const hit = s('circle', { cx, cy, r: 12 });
        hit.addEventListener('pointerenter', () => { dot.classList.add('on'); showTip(tip, plot, cx * plot.clientWidth / W, cy * plot.clientWidth / W, [[spec.series.length > 1 ? x.name : '', `${spec.x || 'x'} ${full(a)} · ${spec.y || 'y'} ${full(b, spec.unit)}`, si]]); });
        hit.addEventListener('pointerleave', () => { dot.classList.remove('on'); tip.hidden = true; });
        hits.append(hit);
      }));
    } else if (horiz) {
      const band = ih / n;
      labels.forEach((lab, i) => {
        const cy = pad.t + band * i + band / 2;
        grid.append(s('text', { x: pad.l - 8, y: cy + 4, 'text-anchor': 'end' }, lab.length > 26 ? `${lab.slice(0, 25)}…` : lab));
        if (spec.type === 'dot') {
          grid.append(s('line', { x1: pad.l, x2: pad.l + iw, y1: cy, y2: cy, class: 'lane' }));
          const pts = spec.series.map((x, si) => [num(x.data[i]), si]).filter(([v]) => v != null);
          if (pts.length > 1) marks.append(s('line', { x1: val(Math.min(...pts.map((p) => p[0]))), x2: val(Math.max(...pts.map((p) => p[0]))), y1: cy, y2: cy, class: 'span' }));
          pts.forEach(([v, si]) => marks.append(s('circle', { cx: val(v), cy, r: 5.5, class: `mk s${si + 1}` })));
        } else {
          const bh = Math.min(22, (band - 10) / spec.series.length);
          spec.series.forEach((x, si) => {
            const v = num(x.data[i]);
            if (v == null) return;
            const y = cy - (bh * spec.series.length) / 2 + si * bh;
            const a = val(Math.min(0, v));
            const w = Math.abs(val(v) - val(0));
            marks.append(s('path', { d: barPath(a, y + 1, Math.max(1, w), bh - 2, v >= 0 ? 'r' : 'l'), class: `fill s${si + 1}` }));
          });
        }
        const hit = s('rect', { x: 0, y: pad.t + band * i, width: W, height: band });
        hit.addEventListener('pointerenter', () => { hit.classList.add('on'); showTip(tip, plot, (pad.l + iw / 2) * plot.clientWidth / W, (pad.t + band * i) * plot.clientWidth / W, [[lab, ''], ...spec.series.map((x, si) => [x.name, full(num(x.data[i]) ?? '–', spec.unit), si])]); });
        hit.addEventListener('pointerleave', () => { hit.classList.remove('on'); tip.hidden = true; });
        hits.append(hit);
      });
    } else {
      const band = iw / n;
      const cx = (i) => pad.l + band * i + band / 2;
      const every = Math.ceil(n / Math.max(1, Math.floor(iw / 64)));
      labels.forEach((lab, i) => { if (i % every === 0) grid.append(s('text', { x: cx(i), y: H - 12, 'text-anchor': 'middle' }, lab.length > 12 ? `${lab.slice(0, 11)}…` : lab)); });
      if (spec.type === 'bar') {
        const gap = 2;
        const bw = Math.min(40, (band * 0.72) / spec.series.length);
        spec.series.forEach((x, si) => x.data.forEach((raw, i) => {
          const v = num(raw);
          if (v == null) return;
          const x0 = cx(i) - (bw * spec.series.length) / 2 + si * bw + gap / 2;
          const top = val(Math.max(0, v));
          const hgt = Math.abs(val(v) - val(0));
          marks.append(s('path', { d: barPath(x0, top, bw - gap, Math.max(1, hgt), v >= 0 ? 't' : 'b'), class: `fill s${si + 1}` }));
        }));
      } else {
        spec.series.forEach((x, si) => {
          const pts = x.data.map((raw, i) => [cx(i), num(raw)]).filter(([, v]) => v != null).map(([px, v]) => [px, val(v)]);
          if (!pts.length) return;
          const d = pts.map(([px, py], k) => `${k ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('');
          if (spec.type === 'area') marks.append(s('path', { d: `${d}L${pts.at(-1)[0]},${val(Math.max(v0, 0))}L${pts[0][0]},${val(Math.max(v0, 0))}Z`, class: `area s${si + 1}` }));
          marks.append(s('path', { d, class: `line s${si + 1}` }));
          if (pts.length <= 24) pts.forEach(([px, py]) => marks.append(s('circle', { cx: px, cy: py, r: 4, class: `mk s${si + 1} small` })));
        });
      }
      // hover: a crosshair (line/area) or the column (bar) with every series' value
      const cross = s('line', { y1: pad.t, y2: pad.t + ih, class: 'cross', visibility: 'hidden' });
      grid.append(cross);
      labels.forEach((lab, i) => {
        const hit = s('rect', { x: pad.l + band * i, y: 0, width: band, height: H });
        hit.addEventListener('pointerenter', () => {
          hit.classList.add('on');
          if (spec.type !== 'bar') { cross.setAttribute('x1', cx(i)); cross.setAttribute('x2', cx(i)); cross.setAttribute('visibility', 'visible'); }
          const top = Math.min(...spec.series.map((x) => num(x.data[i])).filter((v) => v != null).map(val), pad.t + ih);
          showTip(tip, plot, cx(i) * plot.clientWidth / W, top * plot.clientWidth / W, [[lab, ''], ...spec.series.map((x, si) => [multi(spec) ? x.name : '', full(num(x.data[i]) ?? '–', spec.unit), si])]);
        });
        hit.addEventListener('pointerleave', () => { hit.classList.remove('on'); cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
        hits.append(hit);
      });
    }
    plot.append(svg);
  }
  const multi = (spec) => spec.series.length > 1;
  // a bar with 4px rounded corners on its data end only
  function barPath(x, y, w, hgt, end) {
    const r = Math.min(4, w / 2, hgt / 2);
    if (end === 't') return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
    if (end === 'b') return `M${x},${y}V${y + hgt - r}Q${x},${y + hgt} ${x + r},${y + hgt}H${x + w - r}Q${x + w},${y + hgt} ${x + w},${y + hgt - r}V${y}Z`;
    if (end === 'r') return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt - r}Q${x + w},${y + hgt} ${x + w - r},${y + hgt}H${x}Z`;
    return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + hgt - r}Q${x},${y + hgt} ${x + r},${y + hgt}H${x + w}Z`;
  }

  // plain words for read-aloud: no code, charts or Markdown symbols
  function speakable(text) {
    return String(text || '')
      .replace(/```chart[\s\S]*?(```|$)/g, ' (a chart) ')
      .replace(/```[\s\S]*?(```|$)/g, ' (code) ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, 'a link')
      .replace(/[*_~`#>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.richText = (text, { streaming = false } = {}) => blocks(String(text || ''), streaming);
  window.richSpeakable = speakable;
  window.richCopyButton = copyButton;
})();
