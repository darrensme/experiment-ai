// Home screen widgets (Activity, Recent sessions, Usage, Top models, This month), Report a bug and Voice mode (beta).
// Plain script, loaded after app.js and settings.js, sharing their globals (chats, el, icon, usageData, openChat …).

Object.assign(ICONS, {
  grid: '<path d="M240,128a8,8,0,0,1-8,8H204.94l-37.78,75.58A8,8,0,0,1,160,216h-.4a8,8,0,0,1-7.08-5.14L95.35,60.76,63.28,131.31A8,8,0,0,1,56,136H24a8,8,0,0,1,0-16H50.85L88.72,36.69a8,8,0,0,1,14.76.46l57.51,151,31.85-63.71A8,8,0,0,1,200,120h32A8,8,0,0,1,240,128Z"/>',
  history: '<path d="M136,80v43.47l36.12,21.67a8,8,0,0,1-8.24,13.72l-40-24A8,8,0,0,1,120,128V80a8,8,0,0,1,16,0Zm-8-48A95.44,95.44,0,0,0,60.08,60.15C52.81,67.51,46.35,74.59,40,82V64a8,8,0,0,0-16,0v40a8,8,0,0,0,8,8H72a8,8,0,0,0,0-16H49c7.15-8.42,14.27-16.35,22.39-24.57a80,80,0,1,1,1.66,114.75,8,8,0,1,0-11,11.64A96,96,0,1,0,128,32Z"/>',
  gauge: '<path d="M207.06,72.67A111.24,111.24,0,0,0,128,40h-.4C66.07,40.21,16,91,16,153.13V176a16,16,0,0,0,16,16H224a16,16,0,0,0,16-16V152A111.25,111.25,0,0,0,207.06,72.67ZM224,176H119.71l54.76-75.3a8,8,0,0,0-12.94-9.42L99.92,176H32V153.13c0-3.08.15-6.12.43-9.13H56a8,8,0,0,0,0-16H35.27c10.32-38.86,44-68.24,84.73-71.66V80a8,8,0,0,0,16,0V56.33A96.14,96.14,0,0,1,221,128H200a8,8,0,0,0,0,16h23.67c.21,2.65.33,5.31.33,8Z"/>',
  cal: '<path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z"/>',
  trophy: '<path d="M232,64H208V48a8,8,0,0,0-8-8H56a8,8,0,0,0-8,8V64H24A16,16,0,0,0,8,80V96a40,40,0,0,0,40,40h3.65A80.13,80.13,0,0,0,120,191.61V216H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V191.58c31.94-3.23,58.44-25.64,68.08-55.58H208a40,40,0,0,0,40-40V80A16,16,0,0,0,232,64ZM48,120A24,24,0,0,1,24,96V80H48v32q0,4,.39,8Zm144-8.9c0,35.52-29,64.64-64,64.9a64,64,0,0,1-64-64V56H192ZM232,96a24,24,0,0,1-24,24h-.5a81.81,81.81,0,0,0,.5-8.9V80h24Z"/>',
  wave: '<path d="M56,96v64a8,8,0,0,1-16,0V96a8,8,0,0,1,16,0ZM88,24a8,8,0,0,0-8,8V224a8,8,0,0,0,16,0V32A8,8,0,0,0,88,24Zm40,32a8,8,0,0,0-8,8V192a8,8,0,0,0,16,0V64A8,8,0,0,0,128,56Zm40,32a8,8,0,0,0-8,8v64a8,8,0,0,0,16,0V96A8,8,0,0,0,168,88Zm40-16a8,8,0,0,0-8,8v96a8,8,0,0,0,16,0V80A8,8,0,0,0,208,72Z"/>',
  bug: '<path d="M144,92a12,12,0,1,1,12,12A12,12,0,0,1,144,92ZM100,80a12,12,0,1,0,12,12A12,12,0,0,0,100,80Zm116,64A87.76,87.76,0,0,1,213,167l22.24,9.72A8,8,0,0,1,232,192a7.89,7.89,0,0,1-3.2-.67L207.38,182a88,88,0,0,1-158.76,0L27.2,191.33A7.89,7.89,0,0,1,24,192a8,8,0,0,1-3.2-15.33L43,167A87.76,87.76,0,0,1,40,144v-8H16a8,8,0,0,1,0-16H40v-8a87.76,87.76,0,0,1,3-23L20.8,79.33a8,8,0,1,1,6.4-14.66L48.62,74a88,88,0,0,1,158.76,0l21.42-9.36a8,8,0,0,1,6.4,14.66L213,89.05a87.76,87.76,0,0,1,3,23v8h24a8,8,0,0,1,0,16H216ZM56,120H200v-8a72,72,0,0,0-144,0Zm64,95.54V136H56v8A72.08,72.08,0,0,0,120,215.54ZM200,144v-8H136v79.54A72.08,72.08,0,0,0,200,144Z"/>',
  micoff: '<path d="M213.92,218.62l-160-176A8,8,0,0,0,42.08,53.38L80,95.09V128a48,48,0,0,0,69.11,43.12l11.1,12.2A63.41,63.41,0,0,1,128,192a64.07,64.07,0,0,1-64-64,8,8,0,0,0-16,0,80.11,80.11,0,0,0,72,79.6V240a8,8,0,0,0,16,0V207.59a78.83,78.83,0,0,0,35.16-12.22l30.92,34a8,8,0,1,0,11.84-10.76ZM128,160a32,32,0,0,1-32-32V112.69l41.66,45.82A32,32,0,0,1,128,160Zm57.52-3.91A63.32,63.32,0,0,0,192,128a8,8,0,0,1,16,0,79.16,79.16,0,0,1-8.11,35.12,8,8,0,0,1-7.19,4.49,7.88,7.88,0,0,1-3.51-.82A8,8,0,0,1,185.52,156.09ZM84,44.87A48,48,0,0,1,176,64v64a49.19,49.19,0,0,1-.26,5,8,8,0,0,1-8,7.17,8.13,8.13,0,0,1-.84,0,8,8,0,0,1-7.12-8.79c.11-1.1.17-2.24.17-3.36V64A32,32,0,0,0,98.64,51.25,8,8,0,1,1,84,44.87Z"/>',
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
  const WEEKS = innerWidth < 640 ? 17 : widgetsEl.clientWidth >= 900 ? 40 : 26; // wide: more weeks, not bigger squares
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
          el('button', { type: 'button', class: 'w-session', 'data-id': c.id, onclick: () => openChat(c.id) },
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
  return card('w-models', 'trophy', ['Top ', sw('models')],
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

// This runs often (every sync and usage update), so only cards that really changed are replaced. Rebuilding them all
// would blink the row and restart the gold on each refresh.
let widgetsQueued = false;
function renderWidgets() {
  if (widgetsQueued) return;
  widgetsQueued = true;
  requestAnimationFrame(() => {
    widgetsQueued = false;
    if (app.classList.contains('has-messages')) return;
    const s = stats();
    const cards = [activityCard(s), recentCard(), usageCard(), modelsCard(s), monthCard()];
    if (!widgetsEl.children.length) {
      widgetsEl.classList.add('first'); // the cards pop in once, on first load
      fill(widgetsEl, cards);
      setTimeout(() => widgetsEl.classList.remove('first'), 700);
    } else {
      let changed = false;
      cards.forEach((c, i) => {
        const old = widgetsEl.children[i];
        if (!c.isEqualNode(old)) { old.replaceWith(c); changed = true; }
      });
      if (changed) document.getAnimations().forEach((a) => { if (a.animationName === 'shimmer') a.startTime = 0; }); // new words join the others
    }
    if (typeof usageData !== 'undefined' && !usageData && signedIn()) loadUsage().then(renderWidgets).catch(() => {});
  });
}
renderWidgets();
addEventListener('resize', () => { if (!app.classList.contains('has-messages')) renderWidgets(); });

// the bar is taller on home than in a session: keep --ch right whenever its height changes
new ResizeObserver(() => app.style.setProperty('--ch', `${composer.offsetHeight}px`)).observe(composer);

/* ───────── Report a bug ─────────
   Saved through api/chats 'bug'; admins read them in Settings › Admin › Bug reports. Session content is never attached. */
document.querySelector('.main').append(
  el('button', { type: 'button', class: 'bug-btn', id: 'bug-btn', title: 'Report a bug', 'aria-label': 'Report a bug', onclick: openBugReport }, icon('bug'), el('span', {}, 'Report a bug')));

function openBugReport() {
  if (!signedIn()) { notice('Sign in to report a bug.'); return; }
  const text = el('textarea', { class: 'field', id: 'bug-text', rows: '5', maxlength: '2000', required: true, placeholder: 'What did you do, what happened, and what did you expect?' });
  const error = el('p', { class: 'bug-error', role: 'alert', hidden: true });
  const submit = el('button', { type: 'submit', class: 'btn' }, 'Send report');
  const dialog = el('dialog', {
    class: 'bug-dialog', 'aria-labelledby': 'bug-title',
    onclose: () => dialog.remove(),
    onclick: (e) => { if (e.target === dialog && !text.value.trim()) dialog.close(); }, // a click outside, unless they've typed something
  }, el('form', {
    class: 'form',
    onsubmit: async (e) => {
      e.preventDefault();
      const body = text.value.trim();
      if (!body) { text.focus(); return; }
      submit.disabled = true;
      error.hidden = true;
      try {
        await api('/api/chats', { action: 'bug', text: body, model: choice.model, screen: `${innerWidth}×${innerHeight}`, inSession: Boolean(current()) });
        dialog.close();
        notice('Thanks. Your bug report was sent.');
      } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
        submit.disabled = false;
      }
    },
  },
    el('h2', { id: 'bug-title' }, 'Report a ', sw('bug')),
    el('label', { class: 'field-label', for: 'bug-text' }, 'What went wrong?'), text,
    el('p', { class: 'bug-note' }, 'We also get your email, browser, screen size and selected model, so we can look into it. Nothing from your sessions is sent unless you type it here.'),
    error,
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => dialog.close() }, 'Cancel'),
      submit)));
  document.body.append(dialog);
  dialog.showModal();
  text.focus();
}

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
// The orb: a circle drawn exactly like the background (ordered-dither dots), with a streak of light that flows and
// turns through it. Breathes when idle, brightens and swells with your voice, churns while thinking, pulses while speaking.
const ORB = (() => {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y); const u = x - xi; const v = y - yi;
    const su = u * u * (3 - 2 * u); const sv = v * v * (3 - 2 * v);
    const a = hash(xi, yi); const b = hash(xi + 1, yi); const c = hash(xi, yi + 1); const d = hash(xi + 1, yi + 1);
    return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  };
  const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return {
    fbm: (x, y) => noise(x, y) * 0.6 + noise(x * 2.2, y * 2.2) * 0.4,
    bayer: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16),
    dark: ['#0d1c3c', '#11295c', '#163a86', '#1d50b4', '#2a6fe0', '#4d93ff', '#8fc0ff', '#d6eaff', '#f4faff'].map(toRgb),
    light: ['#dfe8f6', '#c6d7f2', '#a8c3ee', '#86aae8', '#628fe2', '#4479dc', '#3a70dd', '#2f62c4', '#1f4ea8'].map(toRgb),
  };
})();
function drawOrb(now = performance.now()) {
  if (!voice) return;
  voice.level = voice.level * 0.72 + micLevel() * 0.28;
  const dt = Math.min(0.05, (now - (voice.last || now)) / 1000);
  voice.last = now;
  const t = now / 1000;
  const st = voice.state;
  const flow = st === 'thinking' ? 1.6 : st === 'speaking' ? 0.8 : st === 'listening' ? 0.35 + voice.level * 1.8 : 0.15;
  voice.flowT = (voice.flowT || 0) + flow * dt;
  voice.turn = (voice.turn || 0) + (st === 'thinking' ? 0.9 : 0.18) * dt;
  const g = voice.orb.getContext('2d');
  const S = voice.orb.width; const c = S / 2; const CELL = 4;
  const night = document.documentElement.dataset.theme === 'night' || (document.documentElement.dataset.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const pal = night ? ORB.dark : ORB.light; const top = pal.length - 1;
  const breathe = 1 + Math.sin(t * 1.3) * 0.03;
  const swell = st === 'listening' ? voice.level * 0.22 : st === 'speaking' ? 0.04 + Math.abs(Math.sin(t * 4.2)) * 0.06 : 0;
  const R = S * 0.36 * (breathe + swell);
  const boost = st === 'listening' ? voice.level * 0.5 : st === 'speaking' ? 0.12 + Math.abs(Math.sin(t * 4.2)) * 0.18 : 0;
  const ang = voice.turn; const nx = -Math.sin(ang); const ny = Math.cos(ang); const tx = Math.cos(ang); const ty = Math.sin(ang);
  g.clearRect(0, 0, S, S);
  for (let y = CELL / 2, r = 0; y < S; y += CELL, r++) {
    for (let x = CELL / 2, col = 0; x < S; x += CELL, col++) {
      const dx = x - c; const dy = y - c;
      const dist = Math.hypot(dx, dy);
      if (dist > R) continue;
      const along = dx * tx + dy * ty; const across = dx * nx + dy * ny;
      const w = R * (across < 0 ? 0.5 : 0.28); // wide glow on one side, tight on the other, like the background
      let v = Math.exp(-(across * across) / (w * w));
      v *= 0.5 + 0.9 * ORB.fbm(along / 38 - voice.flowT * 2, across / 16 + 3); // wisps flowing along the streak
      v += 0.14 + boost;
      v *= 0.45 + 0.55 * Math.sqrt(1 - (dist / R) ** 2); // rounder: dimmer toward the rim
      if (v <= 0) continue;
      if (v > 1) v = 1;
      const level = v * top;
      let idx = Math.floor(level) + (level - Math.floor(level) > ORB.bayer[(r & 3) * 4 + (col & 3)] ? 1 : 0);
      if (idx <= 0) continue;
      if (idx > top) idx = top;
      const [R0, G0, B0] = pal[idx];
      g.fillStyle = `rgb(${R0},${G0},${B0})`;
      g.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
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
