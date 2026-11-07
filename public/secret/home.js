// Home screen widgets (Activity, Recent sessions, Usage, Top models, This month) and Voice mode (beta).
// Plain script, loaded after app.js and settings.js, sharing their globals (chats, el, icon, usageData, openChat …).

Object.assign(ICONS, {
  grid: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9.5h16M4 14.5h16M9.5 4v16M14.5 4v16"/>',
  history: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v3.5H8"/><path d="M12 8v4.2l2.8 1.8"/>',
  gauge: '<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="M12 16l3.5-4.5"/><circle cx="12" cy="16" r="1.2"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  spark: '<path d="M12 3.5l1.9 5.4 5.6 1.6-4.6 3.4.2 5.6L12 16.4l-3.1 3.1.2-5.6-4.6-3.4 5.6-1.6z"/>',
  wave: '<path d="M4 10.5v3M8 7.5v9M12 4.5v15M16 7.5v9M20 10.5v3"/>',
  micoff: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M4 4l16 16"/>',
});

/* ───────── Home widgets ───────── */
const widgetsEl = el('section', { class: 'home-widgets', id: 'home-widgets', 'aria-label': 'Your activity' });
document.querySelector('.main').append(widgetsEl);

const DAY = 86_400_000;
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} minute${s < 120 ? '' : 's'} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${s < 7200 ? '' : 's'} ago`;
  const days = Math.floor(s / 86400);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return 'last month';
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return days < 730 ? 'last year' : `${Math.floor(days / 365)} years ago`;
}
const sw = (word) => el('span', { class: 'serif' }, word); // an Instrument Serif word in a title
const card = (cls, iconName, title, ...body) => el('article', { class: `w-card ${cls}` },
  el('h3', { class: 'w-head' }, icon(iconName), title), body);

// counts from the sessions on this account: messages you sent per day, and which models answered
function stats() {
  const perDay = new Map();
  const models = new Map();
  let messages = 0;
  for (const c of chats) {
    for (const m of c.messages || []) {
      if (m.role === 'user') { messages++; const k = dayKey(m.at || c.createdAt); perDay.set(k, (perDay.get(k) || 0) + 1); }
      else if (m.model) models.set(m.model, (models.get(m.model) || 0) + 1);
    }
  }
  const top = [...models].sort((a, b) => b[1] - a[1]);
  return { perDay, top, totalAnswers: top.reduce((n, [, v]) => n + v, 0), messages };
}

function activityCard(s) {
  const WEEKS = innerWidth < 640 ? 17 : 26;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - ((WEEKS - 1) * 7 + today.getDay()) * DAY); // a Sunday
  const counts = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const t = start.getTime() + i * DAY;
    counts.push(t > today.getTime() ? null : { t, n: s.perDay.get(dayKey(t)) || 0 });
  }
  const busy = counts.filter((x) => x?.n).map((x) => x.n).sort((a, b) => a - b);
  const q = (p) => busy[Math.min(busy.length - 1, Math.floor(p * busy.length))] || 1;
  const level = (n) => (!n ? 0 : n <= q(0.25) ? 1 : n <= q(0.5) ? 2 : n <= q(0.8) ? 3 : 4);
  const fmtDay = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const month = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short' });
  const grid = el('div', { class: 'act-grid', style: `--weeks:${WEEKS}`, role: 'img', 'aria-label': `Messages sent per day over the last ${WEEKS} weeks` },
    counts.map((x) => (x ? el('i', { class: `lv${level(x.n)}`, title: `${x.n} message${x.n === 1 ? '' : 's'} on ${fmtDay(x.t)}` }) : el('i', { class: 'future' }))));
  const fav = s.top[0] && modelById(s.top[0][0]);
  return card('w-activity', 'grid', ['Your ', sw('activity')], grid,
    el('div', { class: 'w-foot' },
      el('span', {}, `${chats.length.toLocaleString()} session${chats.length === 1 ? '' : 's'} · ${s.messages.toLocaleString()} message${s.messages === 1 ? '' : 's'}`,
        fav && el('span', { class: 'act-fav' }, ' · Most used: ', el('img', { src: BRANDS[fav.brand].logo, alt: '', width: '14', height: '14' }), fav.name)),
      el('span', { class: 'w-dim' }, `${month(start)} – ${month(today)}`)));
}

function recentCard() {
  const list = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const shown = list.slice(0, 3);
  return card('w-recent', 'history', ['Recent ', sw('sessions')],
    shown.length
      ? el('ul', { class: 'w-list' }, shown.map((c) => el('li', {},
          el('button', { type: 'button', class: 'w-session', onclick: () => openChat(c.id) },
            el('strong', {}, c.title || 'New session'), el('small', {}, ago(c.updatedAt))))))
      : el('p', { class: 'w-empty' }, 'Your sessions show up here.'),
    list.length > 3 && el('button', { type: 'button', class: 'w-more', onclick: () => $('search-btn')?.click() }, `${list.length - 3} more`));
}

function usageCard() {
  const u = typeof usageData !== 'undefined' ? usageData : null;
  const body = [];
  if (!u) body.push(el('p', { class: 'w-empty' }, 'Loading…'));
  else if (u.unlimited) body.push(el('p', { class: 'w-big' }, 'Unlimited'), el('small', { class: 'w-dim' }, `${PLAN_INFO[u.plan]?.name || 'Free'} plan · no limits`));
  else {
    const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
    const day = pct(u.spent.day, u.budgets.day);
    const week = pct(u.spent.week, u.budgets.week);
    body.push(el('p', { class: 'w-big' }, `${day}%`, el('span', {}, ' used today')),
      el('div', { class: `w-bar${day >= 100 ? ' full' : day >= 80 ? ' warn' : ''}` }, el('i', { style: `width:${day}%` })),
      el('small', { class: 'w-dim' }, `${week}% of this week · ${PLAN_INFO[u.plan]?.name || 'Free'} plan`));
  }
  return el('button', { type: 'button', class: 'w-card w-usage w-click', onclick: () => openSettings('usage') },
    el('h3', { class: 'w-head' }, icon('gauge'), 'Your ', sw('usage')), body);
}

function modelsCard(s) {
  const top = s.top.slice(0, 3);
  return card('w-models', 'spark', ['Top ', sw('models')],
    top.length
      ? el('ul', { class: 'w-list w-bars' }, top.map(([id, n]) => {
          const m = modelById(id);
          const share = Math.round((n / s.totalAnswers) * 100);
          return el('li', {},
            el('div', { class: 'w-row' }, m && el('img', { src: BRANDS[m.brand].logo, alt: '', width: '14', height: '14' }), el('span', { class: 'grow' }, m ? m.name : id), el('b', {}, `${share}%`)),
            el('div', { class: 'w-bar thin' }, el('i', { style: `width:${share}%` })));
        }))
      : el('p', { class: 'w-empty' }, 'Ask something and your favourite models show up here.'));
}

function monthCard() {
  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const inRange = (t, a, b) => t >= a && t < b;
  const sessions = (a, b) => chats.filter((c) => inRange(c.createdAt, a, b)).length;
  const msgs = (a, b) => chats.reduce((n, c) => n + (c.messages || []).filter((m) => m.role === 'user' && inRange(m.at || 0, a, b)).length, 0);
  const stat = (label, now, before) => {
    const diff = now - before;
    return el('div', { class: 'w-stat' }, el('small', {}, label),
      el('p', {}, el('b', {}, now.toLocaleString()), diff !== 0 && el('span', { class: diff > 0 ? 'up' : 'down' }, `${diff > 0 ? '+' : '−'}${Math.abs(diff).toLocaleString()}`)));
  };
  return card('w-month', 'cal', ['This ', sw('month')],
    stat('Sessions', sessions(thisStart, Infinity), sessions(lastStart, thisStart)),
    stat('Messages', msgs(thisStart, Infinity), msgs(lastStart, thisStart)));
}

let widgetsQueued = false;
function renderWidgets() {
  if (widgetsQueued) return;
  widgetsQueued = true;
  requestAnimationFrame(() => {
    widgetsQueued = false;
    if (app.classList.contains('has-messages')) return;
    const s = stats();
    fill(widgetsEl, activityCard(s), recentCard(), usageCard(), modelsCard(s), monthCard());
    if (typeof usageData !== 'undefined' && !usageData && signedIn()) loadUsage().then(renderWidgets).catch(() => {});
  });
}
renderWidgets();
addEventListener('resize', () => { if (!app.classList.contains('has-messages')) renderWidgets(); });

/* ───────── Voice mode (beta) ─────────
   Listen (the mic, with a simple silence detector) → turn speech into text (api/chat 'transcribe', like dictation)
   → send it as a normal message → read the answer aloud with the browser's voice → listen again. */
const voiceBtn = el('button', { type: 'button', class: 'mic voice-btn', id: 'voice-btn', 'aria-label': 'Voice mode (beta)', title: 'Voice mode (beta)' }, icon('wave'));
micBtn.after(voiceBtn);
let voice = null;

async function openVoice() {
  if (!window.eaAuth) { notice('Sign in to use voice mode.'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { notice('This browser can’t record audio.'); return; }
  if (modelById(choice.model)?.kind !== 'chat') { notice('Voice mode works with chat models. Pick one under the message bar first.'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch { notice('Allow microphone access to use voice mode.'); return; }
  const orb = el('canvas', { class: 'voice-orb', width: '360', height: '360', 'aria-hidden': 'true' });
  const status = el('p', { class: 'voice-status', role: 'status' }, 'Starting…');
  const title = el('h2', { class: 'voice-title' }, 'Just ', sw('talk'), '.');
  const heard = el('p', { class: 'voice-heard' });
  const said = el('p', { class: 'voice-said' });
  const muteBtn = el('button', { type: 'button', class: 'voice-ctl', 'aria-pressed': 'false', title: 'Mute the mic' }, icon('micoff'));
  const endBtn = el('button', { type: 'button', class: 'voice-ctl voice-end', title: 'End voice mode' }, icon('x'));
  const layer = el('div', { class: 'voice-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Voice mode' },
    el('div', { class: 'voice-card' },
      el('div', { class: 'voice-top' }, el('img', { src: '/assets/potion-orb-pfp-sky-bottle.png', alt: '', width: '22', height: '22' }), el('strong', {}, 'Voice ', sw('mode')), el('span', { class: 'voice-beta' }, 'Beta')),
      title,
      el('button', { type: 'button', class: 'voice-orb-btn', title: 'Tap to talk now', onclick: () => voice && interrupt() }, orb),
      status, heard, said,
      el('div', { class: 'voice-ctls' }, muteBtn, endBtn),
      el('small', { class: 'voice-note' }, `Talking to ${modelById(choice.model).name}. Answers are read aloud by your browser’s voice. Uses your plan’s usage.`)));
  document.body.append(layer);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  voice = { stream, ctx, analyser, buf: new Float32Array(analyser.fftSize), level: 0, state: 'idle', muted: false, layer, orb, status, heard, said, muteBtn, recorder: null, vad: null, raf: 0 };
  muteBtn.onclick = () => {
    voice.muted = !voice.muted;
    muteBtn.setAttribute('aria-pressed', String(voice.muted));
    muteBtn.title = voice.muted ? 'Unmute the mic' : 'Mute the mic';
    if (voice.muted) { stopListening(true); setVoice('paused', 'Mic muted. Unmute to keep talking.'); } else if (voice.state === 'paused') listen();
  };
  endBtn.onclick = closeVoice;
  layer.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVoice(); });
  endBtn.focus();
  drawOrb();
  listen();
}

function setVoice(state, text) {
  if (!voice) return;
  voice.state = state;
  voice.layer.dataset.state = state;
  voice.status.textContent = text;
}
function micLevel() {
  voice.analyser.getFloatTimeDomainData(voice.buf);
  let sum = 0;
  for (const v of voice.buf) sum += v * v;
  return Math.min(1, Math.sqrt(sum / voice.buf.length) * 5);
}
// The orb: a slowly turning 3D sphere of dots (dither style). Breathes when idle, swells and jitters with your voice
// (with pulse rings) while listening, spins fast while thinking, and ripples in waves while speaking.
const ORB_POINTS = (() => {
  const n = 520; const pts = []; const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2; const r = Math.sqrt(1 - y * y); const th = golden * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
})();
function drawOrb(now = performance.now()) {
  if (!voice) return;
  voice.level = voice.level * 0.72 + micLevel() * 0.28;
  const dt = Math.min(0.05, (now - (voice.last || now)) / 1000);
  voice.last = now;
  const t = now / 1000;
  const st = voice.state;
  const speed = st === 'thinking' ? 2.4 : st === 'speaking' ? 0.9 : st === 'listening' ? 0.45 + voice.level * 1.5 : 0.18;
  voice.rot = (voice.rot || 0) + speed * dt;
  const g = voice.orb.getContext('2d');
  const S = voice.orb.width; const c = S / 2;
  const breathe = 1 + Math.sin(t * 1.3) * 0.03;
  const swell = st === 'listening' ? voice.level * 0.32 : st === 'speaking' ? 0.05 + Math.abs(Math.sin(t * 4.2)) * 0.07 : st === 'thinking' ? 0.025 * Math.sin(t * 5) : 0;
  const R = S * 0.29 * (breathe + swell);
  g.clearRect(0, 0, S, S);
  // a soft glow behind
  const glow = g.createRadialGradient(c, c, R * 0.2, c, c, R * 1.55);
  glow.addColorStop(0, 'rgba(77, 147, 255, .28)');
  glow.addColorStop(1, 'rgba(77, 147, 255, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  // pulse rings while listening
  if (st === 'listening') {
    for (let k = 0; k < 2; k++) {
      const p = (t * 0.6 + k * 0.5) % 1;
      g.strokeStyle = `rgba(110, 170, 255, ${(1 - p) * (0.18 + voice.level * 0.5)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(c, c, R * (1.08 + p * 0.45), 0, Math.PI * 2); g.stroke();
    }
  }
  const a = voice.rot; const tilt = 0.35 + Math.sin(t * 0.4) * 0.12;
  const ca = Math.cos(a); const sa = Math.sin(a); const cb = Math.cos(tilt); const sb = Math.sin(tilt);
  const drawn = [];
  for (const [x, y, z] of ORB_POINTS) {
    const x1 = x * ca + z * sa; const z1 = -x * sa + z * ca;
    const y2 = y * cb - z1 * sb; const z2 = y * sb + z1 * cb;
    let r = 1;
    if (st === 'speaking') r += 0.09 * Math.sin(y2 * 7 - t * 9);
    else if (st === 'listening') r += voice.level * 0.16 * Math.sin(x1 * 6 + t * 12) * Math.cos(y2 * 5 - t * 7);
    else if (st === 'thinking') r += 0.04 * Math.sin((x1 + y2) * 9 + t * 14);
    drawn.push([c + x1 * R * r, c + y2 * R * r, (z2 + 1) / 2]);
  }
  drawn.sort((p, q) => p[2] - q[2]); // far dots first
  for (const [px, py, depth] of drawn) {
    const size = 1.3 + depth * 3;
    g.fillStyle = `rgba(${Math.round(60 + 190 * depth)}, ${Math.round(130 + 115 * depth)}, 255, ${0.12 + 0.88 * depth})`;
    g.fillRect(px - size / 2, py - size / 2, size, size);
  }
  voice.raf = requestAnimationFrame(drawOrb);
}

function listen() {
  if (!voice) return;
  if (voice.muted) { setVoice('paused', 'Mic muted. Unmute to keep talking.'); return; }
  setVoice('listening', 'Listening…');
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((x) => MediaRecorder.isTypeSupported?.(x)) || '';
  const recorder = new MediaRecorder(voice.stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  const started = Date.now();
  let spoke = false; let lastLoud = 0; let discard = false;
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    if (!voice || voice.recorder !== recorder) return;
    voice.recorder = null;
    if (discard || !spoke) { if (!voice.muted && voice.state === 'listening') listen(); return; }
    hear(new Blob(chunks, { type: (recorder.mimeType || 'audio/webm').split(';')[0] }));
  };
  recorder.start(250);
  voice.recorder = recorder;
  voice.discard = () => { discard = true; };
  clearInterval(voice.vad);
  voice.vad = setInterval(() => {
    if (!voice) return;
    const now = Date.now();
    if (voice.level > 0.12) { spoke = true; lastLoud = now; }
    if ((spoke && now - lastLoud > 1200) || now - started > 30_000) stopListening(false);
    else if (!spoke && now - started > 15_000) stopListening(true); // nothing said: start a fresh recording
  }, 100);
}
function stopListening(drop) {
  if (!voice) return;
  clearInterval(voice.vad);
  if (voice.recorder && voice.recorder.state !== 'inactive') {
    if (drop) voice.discard?.();
    voice.recorder.stop();
  }
}

async function hear(blob) {
  setVoice('thinking', 'Thinking…');
  try {
    if (blob.size < 1500) throw new Error('short');
    const b64 = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = bad; fr.readAsDataURL(blob); });
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await window.eaAuth.token()}` },
      body: JSON.stringify({ action: 'transcribe', audio: b64, type: blob.type }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Couldn’t understand that.');
    const text = (d.text || '').trim();
    if (!voice) return;
    if (!text) { listen(); return; }
    voice.heard.textContent = `“${text}”`;
    voice.said.textContent = '';
    await ask(text);
  } catch (err) {
    if (!voice) return;
    if (err.message !== 'short') voice.said.textContent = err.message;
    listen();
  }
}

async function ask(text) {
  if (replying) await waitForReply();
  input.value = text;
  autosize();
  composer.requestSubmit(); // sent like any message: it's saved in the session and counts toward usage
  await waitForReply();
  if (!voice) return;
  const last = current()?.messages.at(-1);
  const answer = last?.role === 'assistant' ? window.richSpeakable(last.text || '') : '';
  if (!answer) { voice.said.textContent = 'No answer came back.'; listen(); return; }
  speak(answer);
}
const waitForReply = () => new Promise((ok) => {
  const t = setInterval(() => { if (!replying) { clearInterval(t); ok(); } }, 150);
});
function speak(text) {
  voice.said.textContent = text.length > 280 ? `${text.slice(0, 277)}…` : text;
  if (!('speechSynthesis' in window)) { listen(); return; }
  setVoice('speaking', 'Speaking… tap the orb to interrupt');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = document.documentElement.lang || 'en';
  u.onend = u.onerror = () => { if (voice && voice.state === 'speaking') listen(); };
  speechSynthesis.speak(u);
}
function interrupt() {
  if (voice.state === 'speaking') { speechSynthesis.cancel(); listen(); }
}
function closeVoice() {
  if (!voice) return;
  const v = voice;
  voice = null;
  clearInterval(v.vad);
  cancelAnimationFrame(v.raf);
  try { if (v.recorder && v.recorder.state !== 'inactive') v.recorder.stop(); } catch {}
  v.stream.getTracks().forEach((t) => t.stop());
  v.ctx.close().catch(() => {});
  try { speechSynthesis.cancel(); } catch {}
  v.layer.classList.add('closing');
  setTimeout(() => v.layer.remove(), 200);
  voiceBtn.focus();
}
voiceBtn.addEventListener('click', () => (voice ? closeVoice() : openVoice()));
