// Experiment AI app: sidebar (new chat, search, projects, saved chats), projects panel, message bar.
// Chats and projects are saved in this browser (localStorage) for now. Replies come from api/chat.js.

const $ = (id) => document.getElementById(id);
const app = $('app');
const input = $('input');
const send = $('send');
const composer = $('composer');
const chipsEl = $('chips');
const messagesEl = $('messages');
const thread = $('thread');
const plusBtn = $('plus');
const plusMenu = $('plus-menu');
const fileInput = $('file-input');
const folderInput = $('folder-input');
const memoryToggle = $('memory-toggle');
const projectsEl = $('projects');
const projectsBody = $('projects-body');
const projectsBtn = $('projects-btn');
const searchLayer = $('search');
const searchInput = $('search-input');
const searchResults = $('search-results');
const phone = window.matchMedia('(max-width: 760px)');

/* ── Helpers ── */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...clean(children));
  return node;
}
// drop null/false/'' so `cond && el(...)` is safe as a child
const clean = (kids) => kids.flat(Infinity).filter((c) => c != null && c !== false && c !== '');
const fill = (node, ...kids) => node.replaceChildren(...clean(kids));
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  file: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  return svg;
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
// show/hide a popup with its open/close animation (CSS: .closing plays the exit, then it's hidden)
function showPop(node) {
  clearTimeout(node._closeTimer);
  node.classList.remove('closing');
  node.hidden = false;
}
function hidePop(node) {
  if (node.hidden || node.classList.contains('closing')) return;
  node.classList.add('closing');
  node._closeTimer = setTimeout(() => { node.hidden = true; node.classList.remove('closing'); }, 170);
}
const isShown = (node) => !node.hidden && !node.classList.contains('closing');
// restart an entrance animation class on a node
function replay(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

let noticeTimer;
function notice(text) {
  const n = $('notice');
  n.textContent = text;
  n.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => n.classList.remove('show'), 3200);
}

/* ── Preferences (Settings → Personalization): theme, text size, motion, send key, greetings, and what the AI
      knows about you. Kept here and in your account (settings.js syncs them); home.html applies the look early. ── */
const PREF_DEFAULTS = {
  theme: 'auto', textSize: 'default', reduceMotion: false, sendKey: 'enter', greetings: true,
  nickname: '', about: '', instructions: '', style: 'balanced', language: '',
};
let prefs = { ...PREF_DEFAULTS };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('ea.prefs')) || {}); } catch {}
function applyPrefs() {
  const root = document.documentElement;
  root.dataset.theme = prefs.theme;
  root.dataset.text = prefs.textSize;
  root.dataset.motion = prefs.reduceMotion ? 'reduce' : 'full';
  const night = prefs.theme === 'night' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', night ? '#0d1a33' : '#3a659b');
  if (typeof autosize === 'function' && input) requestAnimationFrame(autosize); // text size changes the bar's height
}
applyPrefs();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPrefs);

/* ── Connectors (Settings → Connectors connects them; the + menu turns them on for a chat) ── */
const CONNECTORS = [
  { id: 'google', name: 'Google Drive', logo: '/assets/tools/google-drive.svg', note: 'Pick files from your Drive to use in chats' },
  { id: 'notion', name: 'Notion', logo: '/assets/tools/notion.svg', note: 'Search and read the pages you share' },
  { id: 'github', name: 'GitHub', logo: '/assets/tools/github.svg', note: 'Read code, issues and pull requests' },
  { id: 'canva', name: 'Canva', logo: '/assets/tools/canva.svg', note: 'Find and create designs' },
];
let connectorList = null; // [{ tool, setUp, connected, account }] from api/connectors.js (settings.js loads it)

/* ── Saved data (this browser) ── */
function load(key) {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { notice("Couldn't save: this browser's storage is full or blocked."); }
}
let chats = load('ea.chats');       // { id, title, projectId, memory, createdAt, updatedAt, messages: [{ text, at, attachments, files }] }
let projects = load('ea.projects'); // { id, name, description, files: [{ name, path, size, type, addedAt }], createdAt, updatedAt }
// …and to your account when you're signed in (settings.js: queueSync)
const saveChats = () => { save('ea.chats', chats); if (typeof queueSync === 'function') queueSync(); };
const saveProjects = () => { save('ea.projects', projects); if (typeof queueSync === 'function') queueSync(); };
const projectById = (id) => projects.find((p) => p.id === id) || null;
const chatsIn = (projectId) => chats.filter((c) => c.projectId === projectId);
const byRecent = (a, b) => b.updatedAt - a.updatedAt;

/* ── Current chat ── */
let currentId = null;                          // null = the home screen
let draft = { projectId: null, memory: true, tools: [] }; // settings for a chat that hasn't started yet (tools = connectors on)
let attachments = [];                          // [{ kind: 'file' | 'folder', name, files: [...] }]
let projView = { mode: 'list', id: null };
let assignNewProject = false;                  // "New project…" from the + menu puts this chat in it
let fileTarget = null;                         // null = the message bar, or a project id
const current = () => chats.find((c) => c.id === currentId) || null;
const settings = () => current() || draft;
function persistSettings() {
  if (current()) saveChats();
  renderChips();
  renderSidebar();
  if (projectsOpen()) renderProjects();
}

/* ── Sidebar: hide/show (remembered on desktop; starts hidden on phones) ── */
let saved = null;
try { saved = localStorage.getItem('sidebar'); } catch {}

function setSidebar(open) {
  app.classList.toggle('side-hidden', !open);
  if (!phone.matches) {
    saved = open ? 'open' : 'hidden';
    try { localStorage.setItem('sidebar', saved); } catch {}
  }
}
const startOpen = () => !phone.matches && saved !== 'hidden';
app.classList.toggle('side-hidden', !startOpen());
phone.addEventListener('change', () => app.classList.toggle('side-hidden', !startOpen()));

$('side-close').addEventListener('click', () => setSidebar(false));
$('side-open').addEventListener('click', () => setSidebar(true));
$('scrim').addEventListener('click', () => setSidebar(false));

/* ── Sort chats (Recent / Newest / Oldest / A–Z), remembered ── */
const SORTS = [
  ['recent', 'Recent', 'Last active first'],
  ['newest', 'Newest', 'Newest chats first'],
  ['oldest', 'Oldest', 'Oldest chats first'],
  ['az', 'A–Z', 'By name'],
];
const SORTERS = {
  recent: byRecent,
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  az: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
};
let sortMode = 'recent';
try { const s = localStorage.getItem('ea.sort'); if (SORTERS[s]) sortMode = s; } catch {}
const sortMenu = $('sort-menu');
const sortBtn = $('sort-btn');
const sortOpen = () => isShown(sortMenu);

function setSort(mode) {
  sortMode = mode;
  try { localStorage.setItem('ea.sort', mode); } catch {}
  closeSort();
  seenChats = null; // re-order without the slide-in
  renderSidebar();
}
function renderSortMenu() {
  fill(sortMenu, SORTS.map(([key, label, hint]) => el('button', {
    type: 'button', class: 'menu-item sort-opt', role: 'menuitemradio', 'aria-checked': String(key === sortMode),
    title: hint, onclick: () => setSort(key),
  }, el('span', { class: 'grow' }, label), key === sortMode && icon('check'))));
}
function openSort() {
  renderSortMenu();
  showPop(sortMenu);
  sortBtn.setAttribute('aria-expanded', 'true');
}
function closeSort() {
  hidePop(sortMenu);
  sortBtn.setAttribute('aria-expanded', 'false');
}
sortBtn.addEventListener('click', () => (sortOpen() ? closeSort() : openSort()));
document.addEventListener('pointerdown', (e) => {
  if (sortOpen() && !sortMenu.contains(e.target) && !sortBtn.contains(e.target)) closeSort();
});

let seenChats = null; // chat ids already shown, so only new ones slide in
function renderSidebar() {
  const sorted = [...chats].sort(SORTERS[sortMode]);
  $('sort-label').textContent = SORTS.find(([k]) => k === sortMode)[1];
  const isNew = (id) => seenChats && !seenChats.has(id);
  $('chat-list').replaceChildren(...sorted.map((c) => el('li', { class: isNew(c.id) ? 'new' : null },
    el('button', { type: 'button', class: 'chat-item', title: c.title, 'aria-current': c.id === currentId ? 'page' : null, onclick: () => openChat(c.id) }, c.title),
    el('button', { type: 'button', class: 'chat-del', 'aria-label': `Delete “${c.title}”`, title: 'Delete chat', onclick: () => deleteChat(c.id) }, icon('x')),
  )));
  $('chats-empty').hidden = chats.length > 0;
  seenChats = new Set(chats.map((c) => c.id));
}

function deleteChat(id) {
  const chat = chats.find((c) => c.id === id);
  if (!chat || !confirm(`Delete “${chat.title}”? This can't be undone.`)) return;
  chats = chats.filter((c) => c.id !== id);
  saveChats();
  if (id === currentId) goHome();
  else renderSidebar();
  if (projectsOpen()) renderProjects();
}

/* ── Home greeting: a different one on every load and every return to the home screen ── */
// [before, italic word, after]
const GREETINGS = [
  ['What are we ', 'trying', ' today?'],
  ['What should we ', 'build', ' today?'],
  ['What are we ', 'brewing', ' today?'],
  ['Got an ', 'idea', ' brewing?'],
  ['Ready to ', 'experiment', '?'],
  ["What's on your ", 'mind', '?'],
  ["What's the next ", 'experiment', '?'],
  ['Where should we ', 'start', '?'],
  ['Something new to ', 'try', '?'],
  ['What are we ', 'figuring out', ' today?'],
  ["Let's make something ", 'wonderful', ''],
  ['What can I ', 'help', ' with?'],
];
const greetingText = $('greeting-text');
const greetingRow = greetingText.parentElement;

function newGreeting() {
  let last = -1;
  try { last = Number(sessionStorage.getItem('greeting') ?? -1); } catch {}
  let i;
  do { i = Math.floor(Math.random() * GREETINGS.length); } while (i === last && GREETINGS.length > 1);
  try { sessionStorage.setItem('greeting', String(i)); } catch {}

  const h = new Date().getHours();
  const plain = ['Good ', h < 5 ? 'evening' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening', '']; // greetings off
  const [before, word, after] = prefs.greetings ? GREETINGS[i] : plain;
  greetingText.replaceChildren(before, el('span', { class: 'serif' }, word), after);

  greetingRow.classList.remove('fresh');
  void greetingRow.offsetWidth; // restart the entrance animation
  greetingRow.classList.add('fresh');
}

/* ── Home ↔ chat ── */
let glideTimer;
function setChatting(on) {
  if (app.classList.contains('has-messages') === on) return;
  composer.classList.add('gliding');
  app.classList.toggle('has-messages', on);
  clearTimeout(glideTimer);
  glideTimer = setTimeout(() => composer.classList.remove('gliding'), 750);
}

function goHome({ projectId = null } = {}) {
  currentId = null;
  draft = { projectId, memory: true, tools: [] };
  attachments = [];
  messagesEl.replaceChildren();
  setChatting(false);
  newGreeting();
  renderSidebar();
  renderChips();
  if (projectsOpen()) renderProjects();
  if (phone.matches) setSidebar(false);
  input.focus();
}

function openChat(id) {
  const chat = chats.find((c) => c.id === id);
  if (!chat) return;
  currentId = id;
  attachments = [];
  closeMenu();
  closeModelMenu();
  // pick up where this chat left off
  if (modelById(chat.model)) setChoice({ model: chat.model, effort: chat.effort || choice.effort });
  messagesEl.replaceChildren(...chat.messages.map(renderMessage));
  setChatting(true);
  renderSidebar();
  renderChips();
  if (projectsOpen()) renderProjects();
  if (phone.matches) { setSidebar(false); closeProjects(); }
  requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
}

$('new-chat').addEventListener('click', () => goHome());

// Images and videos the AI made (stored in Blob); "?download=1" makes Blob send it as a download
const downloadUrl = (u) => `${u}${u.includes('?') ? '&' : '?'}download=1`;
function mediaBox(media) {
  return el('div', { class: 'msg-media-box' }, media.map((x) => el('figure', { class: 'msg-figure' },
    x.type === 'video'
      ? el('video', { class: 'msg-media', src: x.url, controls: true, playsinline: true, preload: 'metadata' })
      : el('a', { href: x.url, target: '_blank', rel: 'noopener', title: 'Open full size' }, el('img', { class: 'msg-media', src: x.url, alt: 'Image made by Experiment AI', loading: 'lazy' })),
    el('a', { class: 'mini media-save', href: downloadUrl(x.url), rel: 'noopener' }, 'Download'))));
}
const jobBox = (job) => el('div', { class: `video-job${job.status === 'error' ? ' failed' : ''}`, 'data-job': job.id },
  job.status === 'error'
    ? (job.error || 'The video couldn’t be made. Your usage for it was given back.')
    : [el('span', { class: 'spinner' }), 'Making your video… this usually takes a minute or two. You can keep chatting.']);

// pictures from image search: a grid of thumbnails, each opening its page
const foundBox = (items) => el('div', { class: 'found-grid' }, items.map((x) => el('a', {
  class: 'found-item', href: x.page, target: '_blank', rel: 'noopener noreferrer', title: `${x.title} · ${x.source}`,
}, el('img', { src: x.thumb, alt: x.title, loading: 'lazy', referrerpolicy: 'no-referrer' }), el('span', {}, x.source))));

/* ── Buttons under messages: Copy, Read aloud, Retry, thumbs (replies); Copy, Edit (yours) ── */
Object.assign(ICONS, {
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  speak: '<path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  stopsq: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
  retry: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  up: '<path d="M7.5 10.5v9h-3v-9zM7.5 10.5l4-7a2 2 0 0 1 2.6 2.4l-1 3.6h5.4a2 2 0 0 1 2 2.4l-1.4 6.5a2 2 0 0 1-2 1.6H7.5"/>',
  down: '<path d="M7.5 13.5v-9h-3v9zM7.5 13.5l4 7a2 2 0 0 0 2.6-2.4l-1-3.6h5.4a2 2 0 0 0 2-2.4l-1.4-6.5a2 2 0 0 0-2-1.6H7.5"/>',
  edit: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M12.5 7.5l4 4"/>',
  pair: '<rect x="3.5" y="5" width="7" height="14" rx="2"/><rect x="13.5" y="5" width="7" height="14" rx="2"/>',
});
const chatOf = (m) => chats.find((c) => c.messages.includes(m));
const actBtn = (name, label, onclick, extra = {}) => el('button', { type: 'button', class: 'act', title: label, 'aria-label': label, onclick, ...extra }, icon(name));
function copyAct(getText) {
  const b = actBtn('copy', 'Copy', async () => {
    try { await navigator.clipboard.writeText(getText()); } catch { notice('Couldn’t copy. Your browser blocked it.'); return; }
    b.replaceChildren(icon('check'));
    b.classList.add('done');
    setTimeout(() => { b.replaceChildren(icon('copy')); b.classList.remove('done'); }, 1500);
  });
  return b;
}
// Read aloud with the browser's own voice (free, nothing sent anywhere); one message at a time
let speaking = null; // the button that's speaking
function speakAct(m) {
  const b = actBtn('speak', 'Read aloud', () => {
    const was = speaking;
    speechSynthesis.cancel();
    if (was) { was.replaceChildren(icon('speak')); was.title = 'Read aloud'; speaking = null; }
    if (was === b) return;
    const u = new SpeechSynthesisUtterance(window.richSpeakable(m.text));
    u.lang = document.documentElement.lang || 'en';
    u.onend = u.onerror = () => { if (speaking === b) { b.replaceChildren(icon('speak')); b.title = 'Read aloud'; speaking = null; } };
    speaking = b;
    b.replaceChildren(icon('stopsq'));
    b.title = 'Stop reading';
    speechSynthesis.speak(u);
  });
  if (!('speechSynthesis' in window)) b.hidden = true;
  return b;
}
function rateAct(m, kind) {
  const b = actBtn(kind, kind === 'up' ? 'Good reply' : 'Bad reply', () => {
    const chat = chatOf(m);
    m.rating = m.rating === kind ? undefined : kind;
    if (chat) saveChats();
    b.parentElement.querySelectorAll('[data-rate]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.rate === m.rating)));
  }, { 'data-rate': kind, 'aria-pressed': String(m.rating === kind) });
  return b;
}
// Retry: ask again from that point, with the model (and side by side choice) picked under the bar now
function retryFrom(m) {
  const chat = chatOf(m);
  if (!chat || replying) return;
  chat.messages.length = chat.messages.indexOf(m);
  rerun(chat);
}
// re-draw this chat and get a new answer to its last message
function rerun(chat) {
  speechSynthesis?.cancel?.();
  chat.model = choice.model;
  chat.effort = choice.effort;
  chat.updatedAt = Date.now();
  saveChats();
  messagesEl.replaceChildren(...chat.messages.map(renderMessage));
  renderSidebar();
  answer(chat);
}
// Edit one of your messages: change it and send again (everything after it is replaced)
function editMessage(m, li) {
  if (replying) { notice('Wait for the answer to finish first.'); return; }
  const box = el('textarea', { class: 'edit-box', rows: '3', 'aria-label': 'Edit your message' });
  box.value = m.text || '';
  const done = () => li.replaceWith(renderMessage(m));
  const save = () => {
    const text = box.value.trim();
    const chat = chatOf(m);
    if (!chat || (!text && !m.attachments?.length)) return;
    m.text = text;
    chat.messages.length = chat.messages.indexOf(m) + 1;
    rerun(chat);
  };
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') done();
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); save(); }
  });
  li.classList.add('editing');
  fill(li, el('div', { class: 'msg edit-card' }, box, el('div', { class: 'edit-actions' },
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: done }, 'Cancel'),
    el('button', { type: 'button', class: 'btn btn-sm', onclick: save }, 'Send'))));
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}
const richBody = (text) => el('div', { class: 'msg-text rich' }, window.richText(text));

// Side by side: two answers next to each other; "Keep this one" makes it the reply
function pairBox(m) {
  return el('div', { class: 'pair' }, m.pair.map((p, i) => {
    const mod = modelById(p.model);
    return el('div', { class: 'pair-col' },
      el('div', { class: 'pair-head' },
        mod && el('img', { src: BRANDS[mod.brand].logo, alt: '', width: '16', height: '16' }),
        el('strong', {}, mod ? mod.name : p.model)),
      p.error ? el('div', { class: 'msg-error' }, p.error) : richBody(p.text),
      !p.error && el('div', { class: 'pair-foot' },
        copyAct(() => p.text),
        el('button', { type: 'button', class: 'mini pair-keep', onclick: () => keepPair(m, i) }, 'Keep this one')));
  }));
}
function keepPair(m, i) {
  const chat = chatOf(m);
  const p = m.pair[i];
  m.text = p.text;
  m.model = p.model;
  delete m.pair;
  if (chat) { chat.updatedAt = Date.now(); saveChats(); }
  const li = [...messagesEl.children].find((x) => x._msg === m);
  if (li) li.replaceWith(renderMessage(m));
}

function renderMessage(m) {
  if (m.role === 'assistant') {
    const used = modelById(m.model);
    const li = el('li', { class: `msg msg-ai${m.pair ? ' msg-pair' : ''}` },
      m.steps?.length && el('div', { class: 'msg-steps' }, m.steps.map((s) => el('div', { class: 'msg-step done' }, icon('check'), s))),
      m.media?.length && mediaBox(m.media),
      m.job && jobBox(m.job),
      m.pair ? pairBox(m) : m.text && richBody(m.text),
      m.found?.length && foundBox(m.found),
      (m.text || m.pair) && el('div', { class: 'msg-acts' },
        !m.pair && copyAct(() => m.text),
        !m.pair && speakAct(m),
        actBtn('retry', 'Retry with the model picked below', () => retryFrom(m)),
        !m.pair && rateAct(m, 'up'),
        !m.pair && rateAct(m, 'down'),
        used && !m.pair && el('span', { class: 'act-model' }, used.name)));
    li._msg = m;
    return li;
  }
  const li = el('div', { class: 'msg' });
  const pics = (m.attachments || []).filter((a) => a.url && /^image\//.test(a.type));
  if (pics.length) li.append(el('div', { class: 'msg-pics' }, pics.map((a) => el('a', { href: a.url, target: '_blank', rel: 'noopener' }, el('img', { src: a.url, alt: a.name, loading: 'lazy' })))));
  const others = (m.attachments || []).filter((a) => !pics.includes(a));
  if (others.length) {
    li.append(el('div', { class: 'msg-files' }, others.map((a) => el('span', { class: 'file-chip' },
      a.kind === 'drive' ? el('img', { src: '/assets/tools/google-drive.svg', alt: '', width: '16', height: '16' }) : icon(a.kind === 'folder' ? 'folder' : 'file'),
      el('span', {}, a.kind === 'folder' ? `${a.name} · ${plural(a.count, 'file')}` : a.name)))));
  }
  if (m.text) li.append(el('div', { class: 'msg-text' }, m.text));
  const wrap = el('li', { class: 'msg-wrap' }, li, el('div', { class: 'msg-acts mine' },
    m.text && copyAct(() => m.text),
    actBtn('edit', 'Edit', () => editMessage(m, wrap))));
  wrap._msg = m;
  return wrap;
}

/* ── Message bar ── */
function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  app.style.setProperty('--ch', composer.offsetHeight + 'px');
  send.disabled = replying || (typeof uploadsPending === 'function' && uploadsPending()) || (!input.value.trim() && !attachments.length);
}
input.addEventListener('input', autosize);

input.addEventListener('keydown', (e) => {
  // Enter sends and Shift+Enter adds a line, or (Settings) ⌘/Ctrl+Enter sends and Enter adds a line.
  // Never while an IME is composing.
  if (e.key !== 'Enter' || e.isComposing) return;
  const mod = e.metaKey || e.ctrlKey;
  if (prefs.sendKey === 'mod-enter' ? mod : !e.shiftKey) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

/* ── Dictation: the mic records you; api/chat.js (action 'transcribe') turns it into text in the message box ── */
const micBtn = $('mic');
let rec = null; // { recorder, stream, started, timer }
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
async function startDictation() {
  if (!window.eaAuth) { notice('Sign in to use dictation.'); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { notice('This browser can’t record audio.'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { notice('Allow microphone access to dictate.'); return; }
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
  const recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => finishDictation(chunks, recorder.mimeType);
  recorder.start(1000);
  rec = { recorder, stream, started: Date.now() };
  rec.timer = setInterval(tickDictation, 250);
  micBtn.classList.add('recording');
  micBtn.setAttribute('aria-label', 'Stop dictating');
  micBtn.title = 'Stop dictating';
  tickDictation();
}
function tickDictation() {
  if (!rec) return;
  const s = Math.floor((Date.now() - rec.started) / 1000);
  input.placeholder = `Listening… ${clock(s)} · tap the mic to stop`;
  if (s >= 180) stopDictation(); // 3 minutes at most
}
function stopDictation() {
  if (!rec || rec.recorder.state === 'inactive') return;
  clearInterval(rec.timer);
  rec.recorder.stop();
  rec.stream.getTracks().forEach((t) => t.stop());
}
async function finishDictation(chunks, mime) {
  rec = null;
  micBtn.classList.remove('recording');
  micBtn.classList.add('busy');
  micBtn.setAttribute('aria-label', 'Dictate');
  micBtn.title = 'Dictate';
  input.placeholder = 'Turning your voice into text…';
  try {
    const blob = new Blob(chunks, { type: (mime || 'audio/webm').split(';')[0] });
    if (blob.size < 1500) throw new Error('Didn’t catch that. Try again.');
    const b64 = await new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = bad; fr.readAsDataURL(blob); });
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await window.eaAuth.token()}` },
      body: JSON.stringify({ action: 'transcribe', audio: b64, type: blob.type }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Couldn’t turn that into text.');
    if (d.text) {
      input.value = (input.value.trim() ? `${input.value.trimEnd()} ` : '') + d.text;
      autosize();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    } else notice('Didn’t catch any words. Try again.');
  } catch (err) {
    notice(err.message || 'Couldn’t turn that into text.');
  }
  micBtn.classList.remove('busy');
  renderModel(); // puts the normal placeholder back
}
micBtn.addEventListener('click', () => {
  if (rec) stopDictation();
  else if (!micBtn.classList.contains('busy')) startDictation();
});

let seenChips = new Set(); // chip labels already shown, so only new ones pop in
function chip(iconName, label, removeLabel, onRemove, cls = '') {
  return el('span', { class: `chip ${cls}${seenChips.has(cls + label) ? '' : ' new'}`, 'data-key': cls + label },
    iconName && (typeof iconName === 'string' ? icon(iconName) : iconName), // a name, or an <img> (connector logos)
    el('span', { class: 'chip-label' }, label),
    el('button', { type: 'button', class: 'chip-x', 'aria-label': removeLabel, title: removeLabel, onclick: onRemove }, icon('x')));
}

// Side by side: a second chat model that answers next to the main one (null = off). Kept in this browser.
var compareWith; // eslint-disable-line no-var -- read before this line runs on first load
function getCompare() {
  if (compareWith === undefined) { try { compareWith = localStorage.getItem('ea.compare') || null; } catch { compareWith = null; } }
  const b = modelById(compareWith);
  return b && b.kind === 'chat' ? b : null;
}
function setCompare(id) {
  compareWith = id || null;
  try { id ? localStorage.setItem('ea.compare', id) : localStorage.removeItem('ea.compare'); } catch {}
  renderChips();
}
function renderChips() {
  const s = settings();
  const project = s.projectId && projectById(s.projectId);
  const items = [];
  const pairWith = getCompare();
  if (pairWith && modelById(choice.model)?.kind === 'chat') {
    items.push(chip('pair', `Side by side · ${pairWith.id === choice.model ? 'pick another model' : `vs ${pairWith.name}`}`, 'Turn off side by side', () => setCompare(null), 'chip-pair'));
  }
  if (project) {
    items.push(chip('folder', project.name, `Take this chat out of ${project.name}`, () => { s.projectId = null; persistSettings(); }, 'chip-project'));
  }
  if (!s.memory) {
    items.push(chip(null, 'Memory off', 'Save this chat to memory again', () => { s.memory = true; persistSettings(); }, 'chip-memory'));
  }
  // connectors switched on for this chat (only ones still connected, once we know)
  (s.tools || []).forEach((t) => {
    const c = CONNECTORS.find((x) => x.id === t);
    const st = connectorList?.find((x) => x.tool === t);
    if (!c || (st && !st.connected)) return;
    items.push(chip(el('img', { src: c.logo, alt: '', width: '14', height: '14' }), c.name, `Stop using ${c.name} in this chat`,
      () => { s.tools = s.tools.filter((x) => x !== t); persistSettings(); }, 'chip-tool'));
  });
  attachments.forEach((a, i) => items.push(chip(
    a.uploading ? el('span', { class: 'spinner chip-spin', title: 'Uploading…' })
      : a.kind === 'drive' ? el('img', { src: '/assets/tools/google-drive.svg', alt: '', width: '14', height: '14' })
        : a.kind === 'file' && a.url && /^image\//.test(a.type) ? el('img', { class: 'chip-thumb', src: a.url, alt: '' })
          : a.kind === 'folder' ? 'folder' : 'file',
    a.kind === 'folder' ? `${a.name} · ${plural(a.files.length, 'file')}` : a.name,
    `Remove ${a.name}`,
    () => { attachments.splice(i, 1); renderChips(); },
    a.failed ? 'chip-failed' : '',
  )));
  chipsEl.replaceChildren(...items);
  seenChips = new Set(items.map((i) => i.dataset.key));
  autosize();
}

function titleFor(text, atts) {
  const t = norm(text.split('\n')[0]);
  if (t) return t.length > 48 ? t.slice(0, 47) + '…' : t;
  return atts[0]?.name || 'New chat';
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (replying || (!text && !attachments.length)) return;
  if (uploadsPending()) { notice('Wait a moment, your files are still uploading.'); return; }

  const now = Date.now();
  let chat = current();
  if (!chat) {
    chat = { id: uid(), title: titleFor(text, attachments), projectId: draft.projectId, memory: draft.memory, tools: [...(draft.tools || [])], createdAt: now, updatedAt: now, messages: [] };
    chats.push(chat);
    currentId = chat.id;
  }
  const files = attachments.flatMap((a) => a.files);
  const usedModel = modelById(choice.model);
  const msg = { text, at: now, model: choice.model, kind: usedModel.kind, effort: usedModel.kind === 'chat' ? choice.effort : null, attachments: attachments.map((a) => ({
    kind: a.kind, name: a.name, count: a.files.length, ...(a.id && { id: a.id }),
    ...(a.url && { url: a.url, type: a.type, size: a.size }), ...(a.uploads?.length && { uploads: a.uploads }),
  })), files };
  chat.messages.push(msg);
  chat.model = choice.model;
  chat.effort = choice.effort;
  chat.updatedAt = now;
  if (chat.projectId && files.length) addFilesToProject(chat.projectId, files);
  saveChats();

  attachments = [];
  closeMenu();
  messagesEl.append(renderMessage(msg));
  setChatting(true);
  input.value = '';
  renderChips();
  renderSidebar();
  if (projectsOpen()) renderProjects();
  thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  input.focus();
  answer(chat);
});

/* ── AI replies: api/chat.js streams JSON lines ({ type: 'text' | 'error' | 'done' }). It uses your Settings
      (name, style, language, about you, how to respond) and counts toward Settings → Usage. ── */
let replying = false;
const nearBottom = () => thread.scrollHeight - thread.scrollTop - thread.clientHeight < 120;
// uploaded files in a message (single files and the readable part of folders), for the AI to read
const uploadsOf = (m) => (m.attachments || []).flatMap((a) => (a.url ? [{ url: a.url, name: a.name, type: a.type }] : a.uploads || []));
function toApi(chat) {
  return chat.messages.map((m) => {
    if (m.role === 'assistant') {
      const made = m.media?.length ? `[Made ${m.media[0].type === 'video' ? 'a video' : 'an image'} for this]` : m.job ? '[Started making a video]' : '';
      return { role: 'assistant', content: [made, m.text].filter(Boolean).join('\n') };
    }
    const files = uploadsOf(m);
    return {
      role: 'user',
      content: [m.text, m.attachments?.length && `[Attached: ${m.attachments.map((a) => (a.kind === 'drive' ? `Google Drive file “${a.name}”` : a.name)).join(', ')}]`].filter(Boolean).join('\n\n'),
      ...(files.length && { files }),
    };
  }).filter((m) => m.content.trim());
}
// every Google Drive file picked in this chat, so the AI can read them
const driveFilesIn = (chat) => [...new Map(chat.messages.flatMap((m) => (m.attachments || []).filter((a) => a.kind === 'drive' && a.id)).map((a) => [a.id, { id: a.id, name: a.name }])).values()];
// One streamed answer from api/chat.js for `model`; calls on(ev) for each JSON line. Throws on a failed request.
async function streamChat(chat, model, on) {
  if (!window.eaAuth) throw new Error('Sign in to get answers.');
  const r = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await window.eaAuth.token()}` },
    body: JSON.stringify({
      model, effort: chat.effort, memory: chat.memory, tools: chat.tools || [], driveFiles: driveFilesIn(chat), messages: toApi(chat),
      clock: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, // so "tonight" means your tonight
    }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (d.banned && typeof showBanned === 'function') showBanned(d.banned);
    throw new Error(d.error || 'Something went wrong. Please try again.');
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      on(ev);
    }
  }
}
// draws streamed Markdown at most once a frame
function streamPainter(body) {
  let queued = false;
  let text = '';
  return (t) => {
    text = t;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const stick = nearBottom();
      fill(body, window.richText(text, { streaming: true }));
      if (stick) thread.scrollTop = thread.scrollHeight;
    });
  };
}
// a new answer to the chat's last message: side by side when it's on (chat models only)
function answer(chat) {
  const b = getCompare();
  const a = modelById(chat.model);
  return b && a?.kind === 'chat' && b.id !== a.id ? replyPair(chat, [a.id, b.id]) : reply(chat);
}

async function reply(chat) {
  const li = el('li', { class: 'msg msg-ai thinking', 'aria-label': 'Experiment AI is answering' },
    el('span', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')));
  messagesEl.append(li);
  thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  const body = el('div', { class: 'msg-text rich' });
  const paint = streamPainter(body);
  const stepsBox = el('div', { class: 'msg-steps' });
  const steps = []; // connector steps ("Searching Notion for …"), kept with the reply
  const open = () => { if (li.classList.contains('thinking')) { li.classList.remove('thinking'); li.removeAttribute('aria-label'); fill(li, stepsBox, body, foundSlot); } };
  const stepsDone = () => stepsBox.querySelectorAll('.msg-step:not(.done)').forEach((s) => { s.classList.add('done'); s.firstChild.replaceWith(icon('check')); });
  let text = '';
  let error = null;
  const media = []; // images it made
  let job = null; // a video being made
  const found = []; // pictures from image search
  const foundSlot = el('div');
  const used = modelById(chat.model);
  if (used && used.kind !== 'chat') li.append(el('span', { class: 'making' }, used.kind === 'video' ? 'Starting your video…' : 'Making your image…'));
  replying = true;
  autosize();
  try {
    await streamChat(chat, chat.model, (ev) => {
      if (ev.type === 'tool') {
        const stick = nearBottom();
        open();
        stepsDone();
        steps.push(ev.label);
        stepsBox.append(el('div', { class: 'msg-step' }, el('span', { class: 'spinner' }), ev.label));
        if (stick) thread.scrollTop = thread.scrollHeight;
      } else if (ev.type === 'text') {
        open();
        stepsDone();
        text += ev.text;
        paint(text);
      } else if (ev.type === 'found' && Array.isArray(ev.items)) {
        open();
        found.push(...ev.items);
        fill(foundSlot, foundBox(found));
      } else if (ev.type === 'image' && ev.url) media.push({ type: 'image', url: ev.url });
      else if (ev.type === 'video-job' && ev.jobId) job = { id: ev.jobId, status: 'pending' };
      else if (ev.type === 'error') error = ev.error;
      else if (ev.type === 'done' && typeof refreshUsageSoon === 'function') refreshUsageSoon(); // Usage shows the new numbers
    });
    if (!text && !media.length && !job && !error) error = 'No answer came back. Please try again.';
  } catch (err) {
    error = err.message || 'Something went wrong. Please try again.';
  }
  replying = false;
  autosize();
  stepsDone();
  if (text || media.length || job) {
    const m = { role: 'assistant', text, at: Date.now(), model: chat.model, ...(steps.length && { steps }), ...(media.length && { media }), ...(job && { job }), ...(found.length && { found }) };
    chat.messages.push(m);
    chat.updatedAt = Date.now();
    saveChats();
    // show it the same way it shows after a reload (with its buttons)
    const stick = nearBottom();
    const shown = renderMessage(m);
    li.replaceWith(shown);
    if (error) shown.append(el('div', { class: 'msg-error' }, error));
    if (stick || media.length || job) requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
    if (job) pollVideos();
    return;
  }
  if (error) {
    if (!text && !steps.length) fill(li);
    li.classList.remove('thinking');
    li.append(el('div', { class: 'msg-error' }, error));
  }
}

// Side by side: the same question to two models at once, answers in two columns
async function replyPair(chat, models) {
  const cols = models.map((id) => {
    const mod = modelById(id);
    const body = el('div', { class: 'msg-text rich' }, el('span', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')));
    return { id, body, text: '', error: null, paint: streamPainter(body),
      node: el('div', { class: 'pair-col' }, el('div', { class: 'pair-head' }, el('img', { src: BRANDS[mod.brand].logo, alt: '', width: '16', height: '16' }), el('strong', {}, mod.name)), body) };
  });
  const li = el('li', { class: 'msg msg-ai msg-pair', 'aria-label': 'Two AIs are answering' }, el('div', { class: 'pair' }, cols.map((c) => c.node)));
  messagesEl.append(li);
  thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  replying = true;
  autosize();
  await Promise.all(cols.map(async (c) => {
    try {
      await streamChat(chat, c.id, (ev) => {
        if (ev.type === 'text') { c.text += ev.text; c.paint(c.text); }
        else if (ev.type === 'error') c.error = ev.error;
        else if (ev.type === 'done' && typeof refreshUsageSoon === 'function') refreshUsageSoon();
      });
      if (!c.text && !c.error) c.error = 'No answer came back.';
    } catch (err) {
      c.error = err.message || 'Something went wrong. Please try again.';
    }
  }));
  replying = false;
  autosize();
  const ok = cols.find((c) => c.text);
  if (!ok) {
    li.classList.remove('msg-pair');
    fill(li, el('div', { class: 'msg-error' }, cols[0].error));
    return;
  }
  const m = { role: 'assistant', text: ok.text, model: ok.id, at: Date.now(), pair: cols.map((c) => ({ model: c.id, text: c.text, ...(!c.text && { error: c.error }) })) };
  chat.messages.push(m);
  chat.updatedAt = Date.now();
  saveChats();
  const stick = nearBottom();
  li.replaceWith(renderMessage(m));
  if (stick) requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });
}

/* ── Videos being made: check every few seconds while the app is open (also after a reload) ── */
let pollTimer = null;
function pollVideos() {
  clearTimeout(pollTimer);
  const pending = () => chats.flatMap((c) => c.messages.filter((m) => m.job?.status === 'pending').map((m) => [c, m]));
  if (!pending().length || !window.eaAuth) return;
  pollTimer = setTimeout(async () => {
    let changed = false;
    for (const [c, m] of pending()) {
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await window.eaAuth.token()}` },
          body: JSON.stringify({ action: 'video-status', jobId: m.job.id }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok && r.status !== 404) continue; // try again next time
        if (d.status === 'completed' && d.url) { m.media = [{ type: 'video', url: d.url }]; delete m.job; }
        else if (d.status === 'error' || r.status === 404) m.job = { ...m.job, status: 'error', error: d.error || 'The video couldn’t be made. Your usage for it was given back.' };
        else continue;
        changed = true;
        c.updatedAt = Date.now();
        const shown = messagesEl.querySelector(`[data-job="${CSS.escape(m.job?.id || '')}"]`) || [...messagesEl.querySelectorAll('[data-job]')].find((x) => x.dataset.job && !c.messages.some((y) => y.job?.id === x.dataset.job));
        shown?.closest('li')?.replaceWith(renderMessage(m));
        if (m.media && c.id !== currentId) notice(`Your video in “${c.title}” is ready`);
      } catch {}
    }
    if (changed) { saveChats(); if (typeof refreshUsageSoon === 'function') refreshUsageSoon(); }
    pollVideos();
  }, 6000);
}

/* ── Model and effort picker ── */
// Five brands only, each shown with its AI's own mark (not the company's). Ids are Vercel AI Gateway ids.
const BRANDS = {
  claude: { name: 'Claude', logo: '/assets/ai/claude-color.svg' },
  gpt: { name: 'GPT', logo: '/assets/ai/openai.svg' },
  gemini: { name: 'Gemini', logo: '/assets/ai/gemini-color.svg' },
  muse: { name: 'Muse', logo: '/assets/ai/muse-color.svg' },
  grok: { name: 'Grok', logo: '/assets/ai/grok.svg' },
};
const KINDS = [['chat', 'Chat'], ['image', 'Image'], ['video', 'Video']];
// efforts (chat only): which effort levels the model offers (default Low / Medium / High)
const FLASH = ['low', 'high'];
const MODELS = [
  // chat
  { id: 'anthropic/claude-fable-5.1', brand: 'claude', kind: 'chat', name: 'Claude Fable 5.1', note: 'Most capable, for long-running work' },
  { id: 'anthropic/claude-opus-5.5', brand: 'claude', kind: 'chat', name: 'Claude Opus 5.5', note: 'Deep reasoning and coding' },
  { id: 'anthropic/claude-sonnet-5.5', brand: 'claude', kind: 'chat', name: 'Claude Sonnet 5.5', note: 'Smart and fast, a great everyday pick' },
  { id: 'anthropic/claude-haiku-5.5', brand: 'claude', kind: 'chat', name: 'Claude Haiku 5.5', note: 'Fastest Claude' },
  { id: 'openai/gpt-6-astra', brand: 'gpt', kind: 'chat', name: 'GPT-6 Astra', note: 'Complex reasoning and coding' },
  { id: 'openai/gpt-6.1-sol', brand: 'gpt', kind: 'chat', name: 'GPT-6.1 Sol', note: 'Balances intelligence and cost' },
  { id: 'openai/gpt-6.1-terra', brand: 'gpt', kind: 'chat', name: 'GPT-6.1 Terra', note: 'Fast, good at visuals and writing' },
  { id: 'openai/gpt-6-luna', brand: 'gpt', kind: 'chat', name: 'GPT-6 Luna', note: 'Quick and low-cost' },
  { id: 'google/gemini-4-argon', brand: 'gemini', kind: 'chat', name: 'Gemini 4 Argon', note: "Google's newest flagship" },
  { id: 'google/gemini-3.1-pro-preview', brand: 'gemini', kind: 'chat', name: 'Gemini 3.1 Pro', note: 'Strong reasoning, long documents' },
  { id: 'google/gemini-3.8-flash', brand: 'gemini', kind: 'chat', name: 'Gemini 3.8 Flash', note: 'Fast and capable', efforts: FLASH },
  { id: 'google/gemini-3.5-flash-lite', brand: 'gemini', kind: 'chat', name: 'Gemini 3.5 Flash-Lite', note: 'Fastest, lowest cost', efforts: FLASH },
  { id: 'meta/muse-wonder-1.0', brand: 'muse', kind: 'chat', name: 'Muse Wonder', note: "Meta's most capable" },
  { id: 'meta/muse-spark-1.3', brand: 'muse', kind: 'chat', name: 'Muse Spark 1.3', note: 'Quick everyday model' },
  { id: 'spacexai/grok-4.7', brand: 'grok', kind: 'chat', name: 'Grok 4.7', note: 'Coding, agents and knowledge work' },
  { id: 'spacexai/grok-4.6', brand: 'grok', kind: 'chat', name: 'Grok 4.6', note: 'The previous Grok' },
  // image
  { id: 'openai/gpt-image-2.5-flare', brand: 'gpt', kind: 'image', name: 'GPT Image 2.5 Flare', note: 'Fast, high-quality everyday images' },
  { id: 'openai/gpt-image-2.5-sunburst', brand: 'gpt', kind: 'image', name: 'GPT Image 2.5 Sunburst', note: 'Precise image editing' },
  { id: 'openai/gpt-image-2', brand: 'gpt', kind: 'image', name: 'GPT Image 2', note: 'Fast, high-quality generation and editing' },
  { id: 'openai/gpt-image-1.5', brand: 'gpt', kind: 'image', name: 'GPT Image 1.5', note: 'Follows instructions closely' },
  { id: 'google/gemini-nano-banana-2.1', brand: 'gemini', kind: 'image', name: 'Nano Banana 2.1', note: 'Balance of price and quality' },
  { id: 'google/gemini-3.1-flash-image', brand: 'gemini', kind: 'image', name: 'Nano Banana 2', note: 'Image understanding and generation' },
  { id: 'google/gemini-3.1-flash-lite-image', brand: 'gemini', kind: 'image', name: 'Nano Banana 2 Lite', note: "Google's fastest image model" },
  { id: 'meta/muse-image-1.0', brand: 'muse', kind: 'image', name: 'Muse Image', note: 'Reasons before it draws' },
  { id: 'spacexai/grok-imagine-image-2.0', brand: 'grok', kind: 'image', name: 'Grok Imagine Image 2.0', note: 'Newest Grok images' },
  { id: 'spacexai/grok-imagine-image', brand: 'grok', kind: 'image', name: 'Grok Imagine Image', note: 'High-quality images from text' },
  // video
  { id: 'google/veo-3.1-generate-001', brand: 'gemini', kind: 'video', name: 'Veo 3.1', note: 'High-fidelity video up to 4K' },
  { id: 'google/veo-3.1-fast-generate-001', brand: 'gemini', kind: 'video', name: 'Veo 3.1 Fast', note: 'Faster Veo' },
  { id: 'google/veo-3.1-lite-generate-001', brand: 'gemini', kind: 'video', name: 'Veo 3.1 Lite', note: 'Efficient, lower cost' },
  { id: 'spacexai/grok-imagine-video-1.5', brand: 'grok', kind: 'video', name: 'Grok Imagine Video 1.5', note: 'Newest Grok video' },
  { id: 'spacexai/grok-imagine-video-1.5-lite', brand: 'grok', kind: 'video', name: 'Grok Imagine Video 1.5 Lite', note: 'Lightweight, text or image to video' },
];
const EFFORT_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
const KIND_LABEL = Object.fromEntries(KINDS);
const PLACEHOLDER = { chat: 'Message Experiment AI', image: 'Describe an image to make', video: 'Describe a video to make' };
const modelById = (id) => MODELS.find((m) => m.id === id) || null;
const modelsFor = (kind, brand) => MODELS.filter((m) => m.kind === kind && (!brand || m.brand === brand));
const effortsFor = (m) => (m.kind === 'chat' ? m.efforts || ['low', 'medium', 'high'] : []);
// keep the effort if this model has it, otherwise the closest one it does have (image/video keep it for later)
const fitEffort = (m, effort) => {
  const list = effortsFor(m);
  if (!list.length || list.includes(effort)) return effort;
  return list.includes('medium') && effort !== 'max' ? 'medium' : 'high';
};
const shortName = (m) => m.name.replace(/^Claude /, '');
const modelMenu = $('model-menu');
const modelBtn = $('model-btn');

let choice = { model: 'anthropic/claude-sonnet-5.5', effort: 'medium' };
try {
  const c = JSON.parse(localStorage.getItem('ea.model'));
  if (c && modelById(c.model)) choice = { model: c.model, effort: fitEffort(modelById(c.model), c.effort) };
} catch {}
// which brand the menu has open (null = the list of 5 brands)
let menuBrand = null;

function setChoice(next) {
  const merged = { ...choice, ...next };
  choice = { model: merged.model, effort: fitEffort(modelById(merged.model), merged.effort) };
  try { localStorage.setItem('ea.model', JSON.stringify(choice)); } catch {}
  renderModel();
}

function renderModel() {
  const m = modelById(choice.model);
  const chat = m.kind === 'chat';
  $('model-logo').src = BRANDS[m.brand].logo;
  $('model-name').textContent = shortName(m);
  $('model-effort').textContent = chat ? EFFORT_LABEL[choice.effort] : KIND_LABEL[m.kind];
  input.placeholder = PLACEHOLDER[m.kind];
  modelBtn.title = chat ? `${m.name} · ${EFFORT_LABEL[choice.effort]} effort` : `${m.name} · ${KIND_LABEL[m.kind]}`;
  modelBtn.setAttribute('aria-label', `Model: ${modelBtn.title}`);
  if (!modelMenu.hidden) renderModelMenu();
}

function showBrand(brand) {
  menuBrand = brand;
  renderModelMenu();
  replay($('model-view'), brand ? 'slide-fwd' : 'slide-back');
  placeMenu(modelMenu, 380);
}

function renderModelMenu() {
  const m = modelById(choice.model);
  const view = $('model-view');

  if (!menuBrand) {
    // the 5 brands
    fill(view, Object.keys(BRANDS).map((b) => el('button', {
      type: 'button', class: 'menu-item brand-row', 'aria-haspopup': 'true', onclick: () => showBrand(b),
    },
      el('img', { src: BRANDS[b].logo, alt: '', width: '18', height: '18' }),
      el('span', { class: 'grow' }, BRANDS[b].name),
      m.brand === b && el('span', { class: 'brand-current' }, shortName(m)),
      icon('chevron'))));
  } else {
    // one brand: chat models, then image models, then video models, each under a labelled divider
    const sections = KINDS.map(([k, label]) => [label, modelsFor(k, menuBrand)]).filter(([, list]) => list.length);
    fill(view,
      el('button', { type: 'button', class: 'back model-back', onclick: () => showBrand(null) },
        icon('back'), el('img', { src: BRANDS[menuBrand].logo, alt: '', width: '16', height: '16' }), BRANDS[menuBrand].name),
      sections.map(([label, list], i) => [
        el('div', { class: `model-sep-label${i ? '' : ' first'}`, role: 'separator', 'aria-label': label }, el('span', {}, label)),
        list.map((x) => el('button', {
          type: 'button', class: 'menu-item model-opt', role: 'menuitemradio', 'aria-checked': String(x.id === choice.model),
          title: x.note, onclick: () => setChoice({ model: x.id }),
        },
          el('span', { class: 'grow model-opt-name' }, x.name),
          x.id === choice.model && icon('check'))),
      ]),
    );
  }

  // effort: only for chat models
  const levels = effortsFor(m);
  $('effort-box').hidden = !levels.length;
  $('effort-seg').style.setProperty('--n', levels.length || 1);
  $('effort-seg').style.setProperty('--i', Math.max(0, levels.indexOf(choice.effort))); // slides the highlight
  fill($('effort-seg'), levels.map((k) => el('button', {
    type: 'button', class: 'effort-opt', role: 'radio', 'aria-checked': String(k === choice.effort),
    onclick: () => setChoice({ effort: k }),
  }, EFFORT_LABEL[k])));
}

const modelMenuOpen = () => isShown(modelMenu);
function openModelMenu() {
  closeMenu();
  menuBrand = null; // always opens on the 5 brands
  renderModelMenu();
  showPop(modelMenu);
  modelBtn.setAttribute('aria-expanded', 'true');
  placeMenu(modelMenu, 380);
}
function closeModelMenu() {
  hidePop(modelMenu);
  modelBtn.setAttribute('aria-expanded', 'false');
}
modelBtn.addEventListener('click', () => (modelMenuOpen() ? closeModelMenu() : openModelMenu()));
document.addEventListener('pointerdown', (e) => {
  if (modelMenuOpen() && !modelMenu.contains(e.target) && !modelBtn.contains(e.target)) closeModelMenu();
});

/* ── Account (bottom of the sidebar): Settings, Usage, Upgrade plan, Learn more ── */
const accountMenu = $('account-menu');
const accountBtn = $('account-btn');
const accountOpen = () => isShown(accountMenu);
function openAccount() {
  closeMenu();
  closeModelMenu();
  $('learn-links').hidden = true;
  $('learn-btn').setAttribute('aria-expanded', 'false');
  showPop(accountMenu);
  accountBtn.setAttribute('aria-expanded', 'true');
}
function closeAccount() {
  hidePop(accountMenu);
  accountBtn.setAttribute('aria-expanded', 'false');
}
accountBtn.addEventListener('click', () => (accountOpen() ? closeAccount() : openAccount()));
document.addEventListener('pointerdown', (e) => {
  if (accountOpen() && !accountMenu.contains(e.target) && !accountBtn.contains(e.target)) closeAccount();
});
// Called by auth-app.js once sign-in is known: your real name and picture (null = local preview, stays "Guest")
let account = null; // { name, email, photo, providers }
function setAccount(user) {
  account = user;
  if (user) {
    $('account-name').textContent = user.name;
    accountBtn.title = user.email;
    const pfp = $('account-pfp');
    pfp.onerror = () => { pfp.onerror = null; pfp.src = '/assets/potion-orb-icon-pfp.png'; }; // fall back if the photo won't load
    if (user.photo) pfp.src = user.photo;
    afterSignIn(); // settings.js: your saved settings, picture and plan
  }
  document.documentElement.classList.remove('auth-pending');
}
// Settings opens on Account, Usage on Settings → Usage, Upgrade plan on Settings → Billing
accountMenu.querySelectorAll('[data-settings]').forEach((b) => b.addEventListener('click', () => openSettings(b.dataset.settings)));
$('learn-btn').addEventListener('click', () => {
  const links = $('learn-links');
  links.hidden = !links.hidden;
  $('learn-btn').setAttribute('aria-expanded', String(!links.hidden));
});
accountMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeAccount));

/* ── + menu: upload files / a folder, add to a project, save to memory ── */
const menuOpen = () => isShown(plusMenu);
function openMenu() {
  closeModelMenu();
  memoryToggle.checked = settings().memory;
  renderMenuProjects();
  $('menu-projects').hidden = true;
  $('menu-project-btn').setAttribute('aria-expanded', 'false');
  $('menu-tools').hidden = true;
  $('menu-tools-btn').setAttribute('aria-expanded', 'false');
  renderMenuTools();
  if (window.eaAuth) loadConnectors().then(() => { if (menuOpen()) renderMenuTools(); }).catch(() => {});
  showPop(plusMenu);
  plusBtn.setAttribute('aria-expanded', 'true');
  placeMenu(plusMenu);
}
// open below the bar if it fits, otherwise above (whichever side has more room), and never off-screen
function placeMenu(menu, cap = Infinity) {
  const r = composer.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 16 - 28; // 28 = the model text under the bar
  const above = r.top - 16;
  menu.style.maxHeight = '';
  const h = Math.min(menu.scrollHeight, cap);
  const down = below >= h || below >= above;
  menu.classList.toggle('down', down);
  menu.style.maxHeight = `${Math.max(160, Math.min(h, down ? below : above))}px`;
}
function closeMenu() {
  hidePop(plusMenu);
  plusBtn.setAttribute('aria-expanded', 'false');
}
plusBtn.addEventListener('click', () => (menuOpen() ? closeMenu() : openMenu()));
document.addEventListener('pointerdown', (e) => {
  if (menuOpen() && !plusMenu.contains(e.target) && !plusBtn.contains(e.target)) closeMenu();
});

function pickFiles(folder, target = null) {
  fileTarget = target;
  (folder ? folderInput : fileInput).click();
}
$('menu-files').addEventListener('click', () => { closeMenu(); pickFiles(false); });
$('menu-folder').addEventListener('click', () => { closeMenu(); pickFiles(true); });
$('menu-project-btn').addEventListener('click', () => {
  const list = $('menu-projects');
  list.hidden = !list.hidden;
  $('menu-project-btn').setAttribute('aria-expanded', String(!list.hidden));
  placeMenu(plusMenu);
});
memoryToggle.addEventListener('change', () => {
  settings().memory = memoryToggle.checked;
  persistSettings();
});

function renderMenuProjects() {
  const s = settings();
  const option = (label, id) => el('button', {
    type: 'button', class: 'menu-item menu-option', role: 'menuitemradio', 'aria-checked': String(s.projectId === id),
    onclick: () => { s.projectId = id; closeMenu(); persistSettings(); },
  }, el('span', { class: 'grow' }, label), s.projectId === id && icon('check'));

  $('menu-projects').replaceChildren(
    option('No project', null),
    ...[...projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => option(p.name, p.id)),
    el('button', {
      type: 'button', class: 'menu-item menu-new', role: 'menuitem',
      onclick: () => { closeMenu(); openProjects('create'); assignNewProject = true; },
    }, icon('plus'), 'New project…'),
  );
}

// + menu → Connectors: switch each connected tool on or off for this chat, connect the others, pick Drive files
function renderMenuTools() {
  const s = settings();
  const on = s.tools || [];
  const box = $('menu-tools');
  const count = $('menu-tools-count');
  const active = on.filter((t) => !connectorList || connectorList.find((x) => x.tool === t)?.connected);
  count.hidden = !active.length;
  count.textContent = active.length;
  if (!window.eaAuth) { fill(box, el('p', { class: 'menu-note' }, 'Sign in to use your connectors.')); return; }
  if (!connectorList) {
    fill(box, el('p', { class: 'menu-note' }, 'Loading…'));
    loadConnectors().then(() => { if (menuOpen()) { renderMenuTools(); placeMenu(plusMenu); } }).catch((err) => fill(box, el('p', { class: 'menu-note' }, err.message)));
    return;
  }
  const manage = () => { closeMenu(); openSettings('connectors'); };
  fill(box,
    CONNECTORS.map((c) => {
      const st = connectorList.find((x) => x.tool === c.id) || {};
      const logo = el('img', { src: c.logo, alt: '', width: '18', height: '18' });
      if (!st.connected) {
        return el('button', { type: 'button', class: 'menu-item tool-row', role: 'menuitem', onclick: manage },
          logo, el('span', { class: 'grow' }, c.name), el('span', { class: 'tool-connect' }, 'Connect'));
      }
      return el('label', { class: 'menu-switch tool-row' },
        logo,
        el('span', { class: 'grow' }, el('strong', {}, c.name), st.account && el('small', {}, st.account)),
        el('input', {
          type: 'checkbox', class: 'toggle', role: 'switch', 'aria-label': `Use ${c.name} in this chat`, checked: on.includes(c.id),
          onchange: (e) => {
            s.tools = e.target.checked ? [...new Set([...on, c.id])] : on.filter((t) => t !== c.id);
            persistSettings();
            renderMenuTools();
          },
        }));
    }),
    connectorList.find((x) => x.tool === 'google')?.connected && el('button', {
      type: 'button', class: 'menu-item menu-new', role: 'menuitem', onclick: () => pickDrive(),
    }, icon('plus'), 'Pick files from Google Drive…'),
    el('button', { type: 'button', class: 'menu-item menu-option', role: 'menuitem', onclick: manage }, el('span', { class: 'grow' }, 'Manage connectors')),
  );
}
$('menu-tools-btn').addEventListener('click', () => {
  const list = $('menu-tools');
  list.hidden = !list.hidden;
  $('menu-tools-btn').setAttribute('aria-expanded', String(!list.hidden));
  if (!list.hidden) renderMenuTools();
  placeMenu(plusMenu);
});

/* ── + menu › Side by side: pick a second AI to answer next to the one under the bar ── */
const pairCount = el('span', { class: 'menu-count pair-pick', hidden: true });
const pairItem = el('button', { type: 'button', class: 'menu-item', role: 'menuitem', 'aria-expanded': 'false', 'aria-controls': 'menu-pair' },
  icon('pair'), el('span', { class: 'grow' }, 'Side by side'), pairCount, icon('chevron'));
pairItem.lastChild.classList.add('chev');
const pairList = el('div', { class: 'menu-projects menu-pair', id: 'menu-pair', hidden: true });
$('menu-tools').after(pairItem, pairList);
function renderPairMenu() {
  const b = getCompare();
  pairCount.hidden = !b;
  pairCount.textContent = b ? shortName(b) : '';
  if (pairList.hidden) return;
  const main = modelById(choice.model);
  const opt = (id, label, logo) => el('button', {
    type: 'button', class: 'menu-item menu-option', role: 'menuitemradio', 'aria-checked': String((b?.id || null) === id),
    disabled: id && id === main.id, title: id && id === main.id ? 'Already answering: it’s the model under the bar' : null,
    onclick: () => { setCompare(id); closeMenu(); if (id) notice(`Side by side is on: ${modelById(id).name} answers next to ${main.name}`); },
  }, logo ? el('img', { src: logo, alt: '', width: '16', height: '16' }) : icon('x'), el('span', { class: 'grow' }, label), (b?.id || null) === id && icon('check'));
  fill(pairList,
    el('p', { class: 'menu-note' }, main.kind === 'chat' ? `Ask once and get a second answer next to ${main.name}. Keep the one you like.` : 'Side by side works with chat models. Pick one under the bar first.'),
    main.kind === 'chat' && [
      opt(null, 'Off'),
      Object.keys(BRANDS).map((br) => {
        const list = modelsFor('chat', br);
        return list.length && [el('div', { class: 'model-sep-label' }, el('span', {}, BRANDS[br].name)), list.map((x) => opt(x.id, x.name, BRANDS[br].logo))];
      }),
    ]);
}
pairItem.addEventListener('click', () => {
  pairList.hidden = !pairList.hidden;
  pairItem.setAttribute('aria-expanded', String(!pairList.hidden));
  renderPairMenu();
  placeMenu(plusMenu);
});
plusBtn.addEventListener('click', () => { pairList.hidden = true; pairItem.setAttribute('aria-expanded', 'false'); renderPairMenu(); });

function pickedItems(list, folder) {
  const raw = [...list];
  const files = raw.map((f) => ({ name: f.name, path: f.webkitRelativePath || f.name, size: f.size, type: f.type || '' }));
  if (!files.length) return [];
  if (folder) return [{ kind: 'folder', name: files[0].path.split('/')[0] || 'Folder', files, raw }];
  return files.map((f, i) => ({ kind: 'file', name: f.name, files: [f], raw: [raw[i]] }));
}
function onPicked(e, folder) {
  const items = pickedItems(e.target.files, folder);
  e.target.value = '';
  if (!items.length) return;
  if (fileTarget) {
    const p = projectById(fileTarget);
    const added = addFilesToProject(fileTarget, items.flatMap((a) => a.files));
    renderProjects();
    if (p) notice(added ? `Added ${plural(added, 'file')} to ${p.name}` : `Those files are already in ${p.name}`);
  } else {
    attachments.push(...items);
    items.forEach(uploadAttachment);
    renderChips();
    input.focus();
  }
}

/* ── Uploads: files you attach are saved to your account's storage (api/chats.js?upload) so the AI can read them:
      pictures it can see, PDFs, and text or code files. Big photos are shrunk first; up to 4 MB each. ── */
const UPLOAD_MAX = 4 * 1024 * 1024;
const READABLE = (f) => /^image\/(png|jpe?g|webp|gif|heic|heif)$/.test(f.type) || f.type === 'application/pdf'
  || /^text\/|json|xml|javascript|csv|markdown|yaml/.test(f.type)
  || /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|ya?ml|toml|ini|sql|log|svg)$/i.test(f.name);
// photos: at most 2048 px on the long side, as JPEG (keeps uploads small and the AI's view sharp enough)
async function shrinkImage(file) {
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type) || (file.size < 1.5 * 1048576 && !/heic|heif/.test(file.type))) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
async function uploadOne(file) {
  const f = await shrinkImage(file);
  if (f.size > UPLOAD_MAX) throw new Error(`${file.name} is over 4 MB, so the AI only sees its name.`);
  const q = new URLSearchParams({ upload: '1', name: f.name, type: f.type || '' });
  const r = await fetch(`/api/chats?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await window.eaAuth.token()}`, 'Content-Type': 'application/octet-stream' },
    body: f,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `${file.name} couldn’t be uploaded.`);
  return { url: d.url, name: f.name, type: d.type, size: d.size };
}
async function uploadAttachment(a) {
  if (!window.eaAuth || a.kind === 'drive') return;
  const raw = (a.raw || []).filter(READABLE);
  if (!raw.length) return;
  a.uploading = true;
  renderChips();
  try {
    if (a.kind === 'file') Object.assign(a, await uploadOne(raw[0]));
    else { // a folder: up to 20 readable files
      a.uploads = [];
      for (const f of raw.slice(0, 20)) {
        try { a.uploads.push(await uploadOne(f)); } catch {}
      }
      if (raw.length > 20) notice(`The AI can read 20 files from a folder; the rest go by name.`);
    }
  } catch (err) {
    a.failed = true;
    notice(err.message);
  }
  a.uploading = false;
  delete a.raw;
  renderChips();
}
const uploadsPending = () => attachments.some((a) => a.uploading);
fileInput.addEventListener('change', (e) => onPicked(e, false));
folderInput.addEventListener('change', (e) => onPicked(e, true));

function addFilesToProject(id, files) {
  const p = projectById(id);
  if (!p) return 0;
  const seen = new Set(p.files.map((f) => `${f.path}|${f.size}`));
  let added = 0;
  for (const f of files) {
    const key = `${f.path}|${f.size}`;
    if (seen.has(key)) continue;
    seen.add(key);
    p.files.push({ ...f, addedAt: Date.now() });
    added++;
  }
  if (added) { p.updatedAt = Date.now(); saveProjects(); }
  return added;
}

/* ── Projects panel (right) ── */
const projectsOpen = () => app.classList.contains('projects-open');
function openProjects(mode = 'list', id = null) {
  projView = { mode, id };
  assignNewProject = false;
  app.classList.add('projects-open');
  projectsEl.inert = false;
  projectsBtn.setAttribute('aria-expanded', 'true');
  renderProjects();
  if (phone.matches) setSidebar(false);
}
function closeProjects() {
  app.classList.remove('projects-open');
  projectsEl.inert = true;
  projectsBtn.setAttribute('aria-expanded', 'false');
  assignNewProject = false;
}
projectsBtn.addEventListener('click', () => (projectsOpen() ? closeProjects() : openProjects()));
$('projects-close').addEventListener('click', closeProjects);

function showView(mode, id = null) {
  if (mode !== 'create') assignNewProject = false;
  projView = { mode, id };
  renderProjects();
  projectsBody.scrollTop = 0;
  replay(projectsBody, 'view-in');
}
const backButton = () => el('button', { type: 'button', class: 'back', onclick: () => showView('list') }, icon('back'), 'All projects');

function renderProjects() {
  const p = projView.mode === 'detail' && projectById(projView.id);
  if (projView.mode === 'create') renderCreate();
  else if (p) renderDetail(p);
  else { projView = { mode: 'list', id: null }; renderList(); }
}

function renderList() {
  const sorted = [...projects].sort(byRecent);
  projectsBody.replaceChildren(
    el('button', { type: 'button', class: 'btn btn-block', onclick: () => showView('create') }, icon('plus'), 'New project'),
    sorted.length
      ? el('ul', { class: 'proj-list' }, sorted.map((p) => el('li', {},
          el('button', { type: 'button', class: 'proj-card', onclick: () => showView('detail', p.id) },
            el('div', { class: 'proj-name' }, p.name),
            p.description && el('div', { class: 'proj-desc' }, p.description),
            el('div', { class: 'proj-meta' }, `${plural(chatsIn(p.id).length, 'chat')} · ${plural(p.files.length, 'file')}`)))))
      : el('p', { class: 'panel-empty' }, 'No projects yet. A project keeps related chats and files together.'),
  );
}

function renderCreate() {
  const name = el('input', { class: 'field', id: 'proj-name', maxlength: '80', required: true, placeholder: 'e.g. Science fair' });
  const desc = el('textarea', { class: 'field', id: 'proj-desc', rows: '3', maxlength: '500', placeholder: 'What is this project about? (optional)' });
  const form = el('form', {
    class: 'form',
    onsubmit: (e) => {
      e.preventDefault();
      const n = norm(name.value);
      if (!n) { name.focus(); return; }
      const now = Date.now();
      const p = { id: uid(), name: n, description: desc.value.trim(), files: [], createdAt: now, updatedAt: now };
      projects.push(p);
      saveProjects();
      if (assignNewProject) {
        settings().projectId = p.id;
        assignNewProject = false;
        persistSettings();
      }
      showView('detail', p.id);
    },
  },
    el('label', { class: 'field-label', for: 'proj-name' }, 'Name'), name,
    el('label', { class: 'field-label', for: 'proj-desc' }, 'Description'), desc,
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => showView('list') }, 'Cancel'),
      el('button', { type: 'submit', class: 'btn' }, 'Create project')),
  );
  projectsBody.replaceChildren(backButton(), el('h3', { class: 'detail-title' }, 'New project'), form);
  setTimeout(() => name.focus(), 60);
}

function renderDetail(p) {
  const pchats = chatsIn(p.id).sort(byRecent);
  const shown = p.files.slice(0, 200);
  fill(projectsBody,
    backButton(),
    el('h3', { class: 'detail-title' }, p.name),
    p.description && el('p', { class: 'detail-desc' }, p.description),
    el('button', {
      type: 'button', class: 'btn btn-block',
      onclick: () => { goHome({ projectId: p.id }); if (phone.matches) closeProjects(); },
    }, icon('plus'), 'New chat in this project'),

    el('div', { class: 'section-head' },
      el('h4', {}, `Files · ${p.files.length}`),
      el('div', { class: 'mini-actions' },
        el('button', { type: 'button', class: 'mini', onclick: () => pickFiles(false, p.id) }, 'Add files'),
        el('button', { type: 'button', class: 'mini', onclick: () => pickFiles(true, p.id) }, 'Add folder'))),
    p.files.length
      ? el('ul', { class: 'file-list' },
          shown.map((f) => el('li', { class: 'file-row', title: f.path },
            icon('file'),
            el('span', { class: 'name' }, f.path),
            el('span', { class: 'size' }, fmtSize(f.size)),
            el('button', {
              type: 'button', class: 'chip-x', 'aria-label': `Remove ${f.path}`, title: 'Remove',
              onclick: () => { p.files = p.files.filter((x) => x !== f); saveProjects(); renderProjects(); },
            }, icon('x')))),
          p.files.length > shown.length && el('li', { class: 'muted' }, `+ ${p.files.length - shown.length} more`))
      : el('p', { class: 'muted' }, 'No files yet. Files you attach in this project’s chats are added here too.'),

    el('div', { class: 'section-head' }, el('h4', {}, `Chats · ${pchats.length}`)),
    pchats.length
      ? el('ul', { class: 'proj-chats' }, pchats.map((c) => el('li', {},
          el('button', { type: 'button', class: 'chat-item', title: c.title, 'aria-current': c.id === currentId ? 'page' : null, onclick: () => openChat(c.id) }, c.title))))
      : el('p', { class: 'muted' }, 'No chats yet.'),

    el('button', { type: 'button', class: 'btn btn-danger', onclick: () => deleteProject(p.id) }, 'Delete project'),
  );
}

function deleteProject(id) {
  const p = projectById(id);
  if (!p || !confirm(`Delete the project “${p.name}”? Its chats are kept, just without the project.`)) return;
  projects = projects.filter((x) => x.id !== id);
  saveProjects();
  chats.forEach((c) => { if (c.projectId === id) c.projectId = null; });
  saveChats();
  if (draft.projectId === id) draft.projectId = null;
  showView('list');
  renderChips();
}

/* ── Search: titles, messages and attached file names in every chat ── */
let results = [];
let active = 0;
const searchOpen = () => isShown(searchLayer);
function openSearch() {
  closeMenu();
  closeModelMenu();
  showPop(searchLayer);
  searchInput.value = '';
  runSearch();
  searchInput.focus();
  if (phone.matches) setSidebar(false);
}
function closeSearch() { hidePop(searchLayer); }
$('search-btn').addEventListener('click', openSearch);
searchLayer.addEventListener('pointerdown', (e) => { if (e.target === searchLayer) closeSearch(); });
searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!results.length) return;
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    markActive(true);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const r = results[active];
    if (r) { closeSearch(); openChat(r.chat.id); }
  }
});

function searchChats(q) {
  const sorted = [...chats].sort(byRecent);
  if (!q) return sorted.slice(0, 8).map((chat) => ({ chat, snippet: null }));
  const out = [];
  for (const chat of sorted) {
    const project = chat.projectId && projectById(chat.projectId);
    const sources = [
      ...chat.messages.map((m) => m.text),
      ...chat.messages.flatMap((m) => (m.files || []).map((f) => f.path)),
      ...chat.messages.flatMap((m) => (m.attachments || []).map((a) => a.name)),
      project ? `Project: ${project.name}` : '',
    ];
    let snippet = sources.find((s) => s && norm(s).toLowerCase().includes(q)) ?? null;
    const inTitle = chat.title.toLowerCase().includes(q);
    // don't repeat the title as the snippet (the title is the first message's first line)
    if (inTitle && snippet && norm(snippet).startsWith(chat.title.replace(/…$/, ''))) snippet = null;
    if (snippet || inTitle) out.push({ chat, snippet });
  }
  return out;
}

function highlight(text, q) {
  const flat = norm(text);
  const i = q ? flat.toLowerCase().indexOf(q) : -1;
  if (i < 0) return flat.length > 120 ? flat.slice(0, 119) + '…' : flat;
  const start = i > 40 ? i - 40 : 0;
  return [(start ? '…' : '') + flat.slice(start, i), el('mark', {}, flat.slice(i, i + q.length)), flat.slice(i + q.length, i + q.length + 90)];
}

function runSearch() {
  const q = norm(searchInput.value).toLowerCase();
  results = searchChats(q);
  active = 0;
  if (!results.length) {
    searchResults.replaceChildren(el('li', { class: 'search-empty' },
      chats.length ? `Nothing found for “${norm(searchInput.value)}”` : 'No chats yet. Start one and it will show up here.'));
    return;
  }
  fill(searchResults,
    !q && el('li', { class: 'search-head' }, 'Recent chats'),
    ...results.map((r, i) => el('li', {},
      el('button', {
        type: 'button', class: 'result',
        onclick: () => { closeSearch(); openChat(r.chat.id); },
        onpointermove: () => { if (active !== i) { active = i; markActive(); } },
      },
        el('div', { class: 'result-title' }, highlight(r.chat.title, q)),
        r.snippet && el('div', { class: 'result-snippet' }, highlight(r.snippet, q))))),
  );
  markActive();
}
function markActive(scroll = false) {
  searchResults.querySelectorAll('.result').forEach((b, i) => {
    b.classList.toggle('active', i === active);
    if (scroll && i === active) b.scrollIntoView({ block: 'nearest' });
  });
}
$('search-kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘K' : 'Ctrl K';

/* ── Keyboard ── */
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (searchOpen()) closeSearch(); else openSearch();
    return;
  }
  if (e.key !== 'Escape') return;
  const party = document.querySelector('.celebrate:not(.closing)');
  if (party) party.querySelector('.btn')?.click();
  else if (plansOpen()) closePlans();
  else if (settingsOpen()) closeSettings();
  else if (menuOpen()) { closeMenu(); plusBtn.focus(); }
  else if (modelMenuOpen()) { closeModelMenu(); modelBtn.focus(); }
  else if (accountOpen()) { closeAccount(); accountBtn.focus(); }
  else if (sortOpen()) { closeSort(); sortBtn.focus(); }
  else if (searchOpen()) closeSearch();
  else if (projectsOpen()) closeProjects();
  else if (phone.matches) setSidebar(false);
});

/* ── Start ── */
projectsEl.inert = true;
newGreeting();
renderSidebar();
renderModel();
renderChips();
if (!phone.matches) input.focus();
