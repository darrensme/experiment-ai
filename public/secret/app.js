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
// Icons: Phosphor (phosphoricons.com, MIT license), one consistent set across the app
const ICONS = {
  plus: '<path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/>',
  x: '<path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/>',
  file: '<path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>',
  folder: '<path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72ZM40,56H92.69l16,16H40ZM216,200H40V88H216Z"/>',
  back: '<path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"/>',
  chevron: '<path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>',
  check: '<path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/>',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 256 256');
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
  theme: 'night', textSize: 'default', reduceMotion: false, sendKey: 'enter', greetings: true,
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
  { id: 'google', name: 'Google Drive', logo: '/assets/tools/google-drive.svg', note: 'Pick files from your Drive to use in sessions' },
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
  ['newest', 'Newest', 'Newest sessions first'],
  ['oldest', 'Oldest', 'Oldest sessions first'],
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
  if (typeof renderWidgets === 'function') renderWidgets(); // home widgets follow the sessions list (home.js)
  const sorted = [...chats].sort(SORTERS[sortMode]);
  $('sort-label').textContent = SORTS.find(([k]) => k === sortMode)[1];
  const isNew = (id) => seenChats && !seenChats.has(id);
  $('chat-list').replaceChildren(...sorted.map((c) => el('li', { class: isNew(c.id) ? 'new' : null },
    el('button', { type: 'button', class: 'chat-item', title: c.title, 'aria-current': c.id === currentId ? 'page' : null, onclick: () => openChat(c.id) }, c.title),
    el('button', { type: 'button', class: 'chat-del', 'aria-label': `Delete “${c.title}”`, title: 'Delete session', onclick: () => deleteChat(c.id) }, icon('x')),
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
  void before; void word; void after; // the home shows the brand now (home.html), not a greeting

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
  if (!on && typeof renderWidgets === 'function') renderWidgets();
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
  copy: '<path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z"/>',
  speak: '<path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM32,96H72v64H32ZM144,207.64,88,164.09V91.91l56-43.55Zm54-106.08a40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,0,1,12-10.58ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z"/>',
  stopsq: '<path d="M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z"/>',
  retry: '<path d="M224,128a96,96,0,0,1-94.71,96H128A95.38,95.38,0,0,1,62.1,197.8a8,8,0,0,1,11-11.63A80,80,0,1,0,71.43,71.39a3.07,3.07,0,0,1-.26.25L44.59,96H72a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V56a8,8,0,0,1,16,0V85.8L60.25,60A96,96,0,0,1,224,128Z"/>',
  up: '<path d="M234,80.12A24,24,0,0,0,216,72H160V56a40,40,0,0,0-40-40,8,8,0,0,0-7.16,4.42L75.06,96H32a16,16,0,0,0-16,16v88a16,16,0,0,0,16,16H204a24,24,0,0,0,23.82-21l12-96A24,24,0,0,0,234,80.12ZM32,112H72v88H32ZM223.94,97l-12,96a8,8,0,0,1-7.94,7H88V105.89l36.71-73.43A24,24,0,0,1,144,56V80a8,8,0,0,0,8,8h64a8,8,0,0,1,7.94,9Z"/>',
  down: '<path d="M239.82,157l-12-96A24,24,0,0,0,204,40H32A16,16,0,0,0,16,56v88a16,16,0,0,0,16,16H75.06l37.78,75.58A8,8,0,0,0,120,240a40,40,0,0,0,40-40V184h56a24,24,0,0,0,23.82-27ZM72,144H32V56H72Zm150,21.29a7.88,7.88,0,0,1-6,2.71H152a8,8,0,0,0-8,8v24a24,24,0,0,1-19.29,23.54L88,150.11V56H204a8,8,0,0,1,7.94,7l12,96A7.87,7.87,0,0,1,222,165.29Z"/>',
  edit: '<path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120ZM192,108.68,147.31,64l24-24L216,84.68Z"/>',
  pair: '<path d="M104,32H64A16,16,0,0,0,48,48V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,104,32Zm0,176H64V48h40ZM192,32H152a16,16,0,0,0-16,16V208a16,16,0,0,0,16,16h40a16,16,0,0,0,16-16V48A16,16,0,0,0,192,32Zm0,176H152V48h40Z"/>',
});
const chatOf = (m) => chats.find((c) => c.messages.includes(m));
// thumbs go to the admins' Reply feedback list
async function sendRating(chat, m) {
  if (!window.eaAuth || !chat) return;
  try {
    await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await window.eaAuth.token()}` },
      body: JSON.stringify({ action: 'rate', chatId: chat.id, at: m.at, model: m.model, rating: m.rating || null, reply: String(m.text || '').slice(0, 400) }),
    });
  } catch {}
}
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
    if (chat) { saveChats(); sendRating(chat, m); }
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

// Side by side: two answers next to each other. Both stay visible; "Use this one" picks which the session
// continues from (it's what the AI sees next time).
function pairBox(m) {
  const picked = m.picked ?? (m.pair.findIndex((p) => p.text) || 0);
  return el('div', { class: 'pair' }, m.pair.map((p, i) => {
    const mod = modelById(p.model);
    return el('div', { class: `pair-col${i === picked ? ' picked' : ''}` },
      el('div', { class: 'pair-head' },
        mod && el('img', { src: BRANDS[mod.brand].logo, alt: '', width: '16', height: '16' }),
        el('strong', {}, mod ? mod.name : p.model),
        p.effort && el('span', { class: 'pair-effort' }, EFFORT_LABEL[p.effort])),
      p.error ? el('div', { class: 'msg-error' }, p.error) : richBody(p.text),
      !p.error && el('div', { class: 'pair-foot' },
        copyAct(() => p.text),
        i === picked
          ? el('span', { class: 'pair-using' }, icon('check'), 'Using this one')
          : el('button', { type: 'button', class: 'mini pair-keep', onclick: () => keepPair(m, i) }, 'Use this one')));
  }));
}
function keepPair(m, i) {
  const chat = chatOf(m);
  const p = m.pair[i];
  m.text = p.text;
  m.model = p.model;
  m.picked = i;
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
      m.stopped && el('div', { class: 'msg-stopped' }, 'Stopped'),
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
  // while an answer streams, Send becomes Stop
  send.disabled = !replying && ((typeof uploadsPending === 'function' && uploadsPending()) || (!input.value.trim() && !attachments.length));
  send.classList.toggle('stop', replying);
  send.title = replying ? 'Stop' : 'Send';
  send.setAttribute('aria-label', send.title);
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

// Side by side: a second chat model that answers next to the main one (null = off).
// Each session remembers its own (chat.compare), so a side-by-side session stays side by side, even after reopening,
// until the second model is removed. New sessions start with the last choice (kept in this browser).
var compareWith; // eslint-disable-line no-var -- read before this line runs on first load
function getCompare() {
  if (compareWith === undefined) { try { compareWith = localStorage.getItem('ea.compare') || null; } catch { compareWith = null; } }
  const chat = current();
  const b = modelById(chat ? chat.compare : compareWith);
  return b && b.kind === 'chat' ? b : null;
}
function setCompare(id) {
  compareWith = id || null;
  try { id ? localStorage.setItem('ea.compare', id) : localStorage.removeItem('ea.compare'); } catch {}
  const chat = current();
  if (chat) {
    if (id) chat.compare = id; else delete chat.compare;
    saveChats();
  }
  renderChips();
}
// the second model's own effort (per session; new sessions start with the last choice)
function getCompareEffort() {
  const b = getCompare();
  if (!b) return choice.effort;
  let e = current()?.compareEffort;
  if (!e) { try { e = localStorage.getItem('ea.compareEffort'); } catch {} }
  return fitEffort(b, e || choice.effort);
}
function setCompareEffort(k) {
  const chat = current();
  if (chat) { chat.compareEffort = k; saveChats(); }
  try { localStorage.setItem('ea.compareEffort', k); } catch {}
  renderSecond();
}
function renderChips() {
  const s = settings();
  const project = s.projectId && projectById(s.projectId);
  const items = [];
  if (project) {
    items.push(chip('folder', project.name, `Take this session out of ${project.name}`, () => { s.projectId = null; persistSettings(); }, 'chip-project'));
  }
  // connectors switched on for this chat (only ones still connected, once we know)
  (s.tools || []).forEach((t) => {
    const c = CONNECTORS.find((x) => x.id === t);
    const st = connectorList?.find((x) => x.tool === t);
    if (!c || (st && !st.connected)) return;
    items.push(chip(el('img', { src: c.logo, alt: '', width: '14', height: '14' }), c.name, `Stop using ${c.name} in this session`,
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
  renderSecond(); // the second model picker follows the session (side by side)
  seenChips = new Set(items.map((i) => i.dataset.key));
  autosize();
}

function titleFor(text, atts) {
  const t = norm(text.split('\n')[0]);
  if (t) return t.length > 48 ? t.slice(0, 47) + '…' : t;
  return atts[0]?.name || 'New session';
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
    const pairWith = getCompare(); // home: the last side-by-side choice carries into the new session
    if (pairWith) { chat.compare = pairWith.id; chat.compareEffort = getCompareEffort(); }
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
let aborter = null; // stops the answer that's streaming (the server then stops the model too)
const stopReply = () => aborter?.abort();
const isAbort = (err) => err?.name === 'AbortError';
send.append(el('span', { class: 'stop-ico', 'aria-hidden': 'true' }));
send.addEventListener('click', (e) => { if (replying) { e.preventDefault(); stopReply(); } });
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
async function streamChat(chat, model, on, signal, effort = chat.effort) {
  if (!window.eaAuth) throw new Error('Sign in to get answers.');
  const r = await fetch('/api/chat', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await window.eaAuth.token()}` },
    body: JSON.stringify({
      model, effort, memory: true, tools: chat.tools || [], driveFiles: driveFilesIn(chat), messages: toApi(chat),
      clock: { tz: Intl.DateTimeFormat().resolvedOptions().timeZone }, // so "tonight" means your tonight
    }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    if (d.banned && typeof showBanned === 'function') showBanned(d.banned);
    if (d.needBirthday && typeof askBirthday === 'function') askBirthday();
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
  let stopped = false;
  aborter = new AbortController();
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
    }, aborter.signal);
    if (!text && !media.length && !job && !error) error = 'No answer came back. Please try again.';
  } catch (err) {
    if (isAbort(err)) stopped = true;
    else error = err.message || 'Something went wrong. Please try again.';
  }
  aborter = null;
  replying = false;
  autosize();
  stepsDone();
  if (stopped && typeof refreshUsageSoon === 'function') refreshUsageSoon();
  if (text || media.length || job) {
    const m = { role: 'assistant', text, at: Date.now(), model: chat.model, ...(stopped && { stopped }), ...(steps.length && { steps }), ...(media.length && { media }), ...(job && { job }), ...(found.length && { found }) };
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
  if (stopped) { // stopped before any words came back
    if (!steps.length) fill(li);
    li.classList.remove('thinking');
    li.append(el('div', { class: 'msg-stopped' }, 'You stopped this answer.'));
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
  const efforts = [chat.effort, getCompareEffort()]; // each model has its own effort
  const cols = models.map((id, i) => {
    const mod = modelById(id);
    const effort = efforts[i];
    const body = el('div', { class: 'msg-text rich' }, el('span', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')));
    return { id, effort, body, text: '', error: null, paint: streamPainter(body),
      node: el('div', { class: 'pair-col' }, el('div', { class: 'pair-head' }, el('img', { src: BRANDS[mod.brand].logo, alt: '', width: '16', height: '16' }), el('strong', {}, mod.name), el('span', { class: 'pair-effort' }, EFFORT_LABEL[effort])), body) };
  });
  const li = el('li', { class: 'msg msg-ai msg-pair', 'aria-label': 'Two AIs are answering' }, el('div', { class: 'pair' }, cols.map((c) => c.node)));
  messagesEl.append(li);
  thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  aborter = new AbortController();
  const signal = aborter.signal;
  replying = true;
  autosize();
  await Promise.all(cols.map(async (c) => {
    try {
      await streamChat(chat, c.id, (ev) => {
        if (ev.type === 'text') { c.text += ev.text; c.paint(c.text); }
        else if (ev.type === 'error') c.error = ev.error;
        else if (ev.type === 'done' && typeof refreshUsageSoon === 'function') refreshUsageSoon();
      }, signal, c.effort);
      if (!c.text && !c.error) c.error = 'No answer came back.';
    } catch (err) {
      c.error = isAbort(err) ? 'Stopped.' : err.message || 'Something went wrong. Please try again.';
    }
  }));
  const stopped = signal.aborted;
  aborter = null;
  replying = false;
  autosize();
  if (stopped && typeof refreshUsageSoon === 'function') refreshUsageSoon();
  const ok = cols.find((c) => c.text);
  if (!ok) {
    li.classList.remove('msg-pair');
    fill(li, el('div', { class: stopped ? 'msg-stopped' : 'msg-error' }, stopped ? 'You stopped this answer.' : cols[0].error));
    return;
  }
  const m = { role: 'assistant', text: ok.text, model: ok.id, at: Date.now(), ...(stopped && { stopped }), pair: cols.map((c) => ({ model: c.id, effort: c.effort, text: c.text, ...(!c.text && { error: c.error }) })) };
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
  if (typeof renderSecond === 'function') renderSecond();
  if (!modelMenu.hidden) renderModelMenu();
}

/* ── Side by side: a second model picker in the message bar, with its own model and effort ── */
var model2Btn = el('button', { type: 'button', class: 'model-btn model2-btn', id: 'model2-btn', hidden: true, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'model-menu' },
  el('span', { class: 'model-vs' }, 'vs'), el('img', { class: 'model-logo', alt: '', width: '16', height: '16' }),
  el('span', { class: 'model-name' }), el('span', { class: 'model-effort' }), icon('chevron'));
model2Btn.lastChild.classList.add('chev-down');
model2Btn.lastChild.innerHTML = '<path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"/>'; // caret-down, like the main picker
var model2X = el('button', { type: 'button', class: 'model2-x', hidden: true, title: 'Turn off side by side', 'aria-label': 'Turn off side by side', onclick: () => setCompare(null) }, icon('x'));
modelBtn.after(model2Btn, model2X);
function renderSecond() {
  if (!model2Btn) return; // not built yet (first load)
  const b = modelById(choice.model)?.kind === 'chat' ? getCompare() : null;
  model2Btn.hidden = model2X.hidden = !b;
  composer.classList.toggle('pairing', Boolean(b));
  if (!b) return;
  const effort = getCompareEffort();
  model2Btn.querySelector('.model-logo').src = BRANDS[b.brand].logo;
  model2Btn.querySelector('.model-name').textContent = shortName(b);
  model2Btn.querySelector('.model-effort').textContent = EFFORT_LABEL[effort];
  model2Btn.title = `Side by side with ${b.name} · ${EFFORT_LABEL[effort]} effort`;
  model2Btn.setAttribute('aria-label', model2Btn.title);
}

function showBrand(brand) {
  menuBrand = brand;
  renderModelMenu();
  replay($('model-view'), brand ? 'slide-fwd' : 'slide-back');
  placeMenu(modelMenu, 380);
}

// the menu picks for the main model, or for the second one (side by side)
let menuFor = 'main';
const pickState = () => (menuFor === 'second' ? { model: getCompare()?.id || null, effort: getCompareEffort() } : choice);
function pickModel(id) {
  if (menuFor === 'second') { setCompare(id); renderModelMenu(); } else setChoice({ model: id });
}
function pickEffort(k) {
  if (menuFor === 'second') { setCompareEffort(k); renderModelMenu(); } else setChoice({ effort: k });
}

function renderModelMenu() {
  const st = pickState();
  const second = menuFor === 'second';
  const m = modelById(st.model) || modelById(choice.model);
  const view = $('model-view');
  const head = second && el('p', { class: 'menu-note model-for' }, icon('pair'), 'Second model: answers next to ', el('strong', {}, modelById(choice.model).name));

  if (!menuBrand) {
    // the 5 brands (+ compare)
    fill(view, head, Object.keys(BRANDS).filter((b) => !second || modelsFor('chat', b).length).map((b) => el('button', {
      type: 'button', class: 'menu-item brand-row', 'aria-haspopup': 'true', onclick: () => showBrand(b),
    },
      el('img', { src: BRANDS[b].logo, alt: '', width: '18', height: '18' }),
      el('span', { class: 'grow' }, BRANDS[b].name),
      st.model && m.brand === b && el('span', { class: 'brand-current' }, shortName(m)),
      icon('chevron'))),
      !second && m.kind === 'chat' && [
        el('div', { class: 'menu-sep model-sep', role: 'separator' }),
        el('button', { type: 'button', class: 'menu-item brand-row', onclick: () => openModelMenu('second') },
          icon('pair'), el('span', { class: 'grow' }, getCompare() ? 'Side by side' : 'Compare with another model'),
          getCompare() && el('span', { class: 'brand-current' }, `vs ${shortName(getCompare())}`),
          icon('chevron')),
      ],
      second && st.model && [
        el('div', { class: 'menu-sep model-sep', role: 'separator' }),
        el('button', { type: 'button', class: 'menu-item brand-row', onclick: () => { setCompare(null); closeModelMenu(); } }, icon('x'), el('span', { class: 'grow' }, 'Turn off side by side')),
      ]);
  } else {
    // one brand: chat models, then image models, then video models, each under a labelled divider (second: chat only)
    const sections = KINDS.filter(([k]) => !second || k === 'chat').map(([k, label]) => [label, modelsFor(k, menuBrand)]).filter(([, list]) => list.length);
    fill(view,
      head,
      el('button', { type: 'button', class: 'back model-back', onclick: () => showBrand(null) },
        icon('back'), el('img', { src: BRANDS[menuBrand].logo, alt: '', width: '16', height: '16' }), BRANDS[menuBrand].name),
      sections.map(([label, list], i) => [
        el('div', { class: `model-sep-label${i ? '' : ' first'}`, role: 'separator', 'aria-label': label }, el('span', {}, label)),
        list.map((x) => {
          const taken = second && x.id === choice.model;
          return el('button', {
            type: 'button', class: 'menu-item model-opt', role: 'menuitemradio', 'aria-checked': String(x.id === st.model),
            disabled: taken, title: taken ? 'Already your main model' : x.note, onclick: () => pickModel(x.id),
          },
            el('span', { class: 'grow model-opt-name' }, x.name),
            x.id === st.model && icon('check'));
        }),
      ]),
    );
  }

  // effort: only for chat models (the second model has its own)
  const levels = st.model ? effortsFor(m) : [];
  $('effort-box').hidden = !levels.length;
  $('effort-seg').style.setProperty('--n', levels.length || 1);
  $('effort-seg').style.setProperty('--i', Math.max(0, levels.indexOf(st.effort))); // slides the highlight
  fill($('effort-seg'), levels.map((k) => el('button', {
    type: 'button', class: 'effort-opt', role: 'radio', 'aria-checked': String(k === st.effort),
    onclick: () => pickEffort(k),
  }, EFFORT_LABEL[k])));
}

const modelMenuOpen = () => isShown(modelMenu);
function openModelMenu(mode = 'main') {
  closeMenu();
  menuFor = mode;
  menuBrand = null; // always opens on the 5 brands
  renderModelMenu();
  showPop(modelMenu);
  modelBtn.setAttribute('aria-expanded', String(mode === 'main'));
  model2Btn.setAttribute('aria-expanded', String(mode === 'second'));
  placeMenu(modelMenu, 380);
}
function closeModelMenu() {
  hidePop(modelMenu);
  modelBtn.setAttribute('aria-expanded', 'false');
  model2Btn.setAttribute('aria-expanded', 'false');
}
modelBtn.addEventListener('click', () => (modelMenuOpen() && menuFor === 'main' ? closeModelMenu() : openModelMenu('main')));
model2Btn.addEventListener('click', () => (modelMenuOpen() && menuFor === 'second' ? closeModelMenu() : openModelMenu('second')));
document.addEventListener('pointerdown', (e) => {
  if (modelMenuOpen() && !modelMenu.contains(e.target) && !modelBtn.contains(e.target) && !model2Btn.contains(e.target)) closeModelMenu();
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
  const below = window.innerHeight - r.bottom - 16;
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
memoryToggle?.addEventListener('change', () => {
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
          type: 'checkbox', class: 'toggle', role: 'switch', 'aria-label': `Use ${c.name} in this session`, checked: on.includes(c.id),
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
// photos: EVERY photo is redrawn before upload, which strips its hidden metadata (EXIF: GPS location, camera,
// time taken). At most 2048 px on the long side. PNG/WebP stay PNG (keeps transparency) unless that's too big;
// JPEG/HEIC become JPEG. GIFs are left alone (they'd lose their animation).
async function shrinkImage(file) {
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file); // applies the photo's rotation, so it still looks right
    const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d');
    const encode = (type, q) => new Promise((ok) => c.toBlob(ok, type, q));
    const name = (ext) => file.name.replace(/\.\w+$/, '') + ext;
    if (/png|webp/.test(file.type)) {
      g.drawImage(bmp, 0, 0, c.width, c.height);
      const png = await encode('image/png');
      if (png && png.size <= 3 * 1048576) return new File([png], name('.png'), { type: 'image/png' });
    }
    g.fillStyle = '#fff'; // JPEG has no transparency: put it on white, not black
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const jpg = await encode('image/jpeg', 0.88);
    if (jpg) return new File([jpg], name('.jpg'), { type: 'image/jpeg' });
  } catch {}
  // couldn't redraw it (e.g. HEIC outside Safari): don't upload the original with its location data
  throw new Error(`${file.name} couldn’t be prepared safely, so it wasn’t uploaded. Try a JPEG or PNG.`);
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
            el('div', { class: 'proj-meta' }, `${plural(chatsIn(p.id).length, 'session')} · ${plural(p.files.length, 'file')}`)))))
      : el('p', { class: 'panel-empty' }, 'No projects yet. A project keeps related sessions and files together.'),
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
    }, icon('plus'), 'New session in this project'),

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
      : el('p', { class: 'muted' }, 'No files yet. Files you attach in this project’s sessions are added here too.'),

    el('div', { class: 'section-head' }, el('h4', {}, `Sessions · ${pchats.length}`)),
    pchats.length
      ? el('ul', { class: 'proj-chats' }, pchats.map((c) => el('li', {},
          el('button', { type: 'button', class: 'chat-item', title: c.title, 'aria-current': c.id === currentId ? 'page' : null, onclick: () => openChat(c.id) }, c.title))))
      : el('p', { class: 'muted' }, 'No sessions yet.'),

    el('button', { type: 'button', class: 'btn btn-danger', onclick: () => deleteProject(p.id) }, 'Delete project'),
  );
}

function deleteProject(id) {
  const p = projectById(id);
  if (!p || !confirm(`Delete the project “${p.name}”? Its sessions are kept, just without the project.`)) return;
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
      chats.length ? `Nothing found for “${norm(searchInput.value)}”` : 'No sessions yet. Start one and it will show up here.'));
    return;
  }
  fill(searchResults,
    !q && el('li', { class: 'search-head' }, 'Recent sessions'),
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
