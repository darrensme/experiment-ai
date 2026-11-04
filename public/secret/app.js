// Experiment AI app: sidebar (new chat, search, projects, saved chats), projects panel, message bar.
// Chats and projects are saved in this browser (localStorage) for now. No AI replies yet.

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
const clean = (kids) => kids.flat().filter((c) => c != null && c !== false && c !== '');
const fill = (node, ...kids) => node.replaceChildren(...clean(kids));
const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  file: '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/><path d="M14 3.5V8h4.5"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
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

/* ── Saved data (this browser) ── */
function load(key) {
  try { const v = JSON.parse(localStorage.getItem(key)); return Array.isArray(v) ? v : []; } catch { return []; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { notice("Couldn't save: this browser's storage is full or blocked."); }
}
let chats = load('ea.chats');       // { id, title, projectId, memory, createdAt, updatedAt, messages: [{ text, at, attachments, files }] }
let projects = load('ea.projects'); // { id, name, description, files: [{ name, path, size, type, addedAt }], createdAt, updatedAt }
const saveChats = () => save('ea.chats', chats);
const saveProjects = () => save('ea.projects', projects);
const projectById = (id) => projects.find((p) => p.id === id) || null;
const chatsIn = (projectId) => chats.filter((c) => c.projectId === projectId);
const byRecent = (a, b) => b.updatedAt - a.updatedAt;

/* ── Current chat ── */
let currentId = null;                          // null = the home screen
let draft = { projectId: null, memory: true }; // settings for a chat that hasn't started yet
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

  const [before, word, after] = GREETINGS[i];
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
  draft = { projectId, memory: true };
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

function renderMessage(m) {
  const li = el('li', { class: 'msg' });
  if (m.attachments?.length) {
    li.append(el('div', { class: 'msg-files' }, m.attachments.map((a) => el('span', { class: 'file-chip' },
      icon(a.kind === 'folder' ? 'folder' : 'file'),
      el('span', {}, a.kind === 'folder' ? `${a.name} · ${plural(a.count, 'file')}` : a.name)))));
  }
  if (m.text) li.append(el('div', { class: 'msg-text' }, m.text));
  return li;
}

/* ── Message bar ── */
function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  app.style.setProperty('--ch', composer.offsetHeight + 'px');
  send.disabled = !input.value.trim() && !attachments.length;
}
input.addEventListener('input', autosize);

input.addEventListener('keydown', (e) => {
  // Enter sends, Shift+Enter adds a line (not while an IME is composing)
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

let seenChips = new Set(); // chip labels already shown, so only new ones pop in
function chip(iconName, label, removeLabel, onRemove, cls = '') {
  return el('span', { class: `chip ${cls}${seenChips.has(cls + label) ? '' : ' new'}`, 'data-key': cls + label },
    iconName && icon(iconName),
    el('span', { class: 'chip-label' }, label),
    el('button', { type: 'button', class: 'chip-x', 'aria-label': removeLabel, title: removeLabel, onclick: onRemove }, icon('x')));
}

function renderChips() {
  const s = settings();
  const project = s.projectId && projectById(s.projectId);
  const items = [];
  if (project) {
    items.push(chip('folder', project.name, `Take this chat out of ${project.name}`, () => { s.projectId = null; persistSettings(); }, 'chip-project'));
  }
  if (!s.memory) {
    items.push(chip(null, 'Memory off', 'Save this chat to memory again', () => { s.memory = true; persistSettings(); }, 'chip-memory'));
  }
  attachments.forEach((a, i) => items.push(chip(
    a.kind === 'folder' ? 'folder' : 'file',
    a.kind === 'folder' ? `${a.name} · ${plural(a.files.length, 'file')}` : a.name,
    `Remove ${a.name}`,
    () => { attachments.splice(i, 1); renderChips(); },
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
  if (!text && !attachments.length) return;

  const now = Date.now();
  let chat = current();
  if (!chat) {
    chat = { id: uid(), title: titleFor(text, attachments), projectId: draft.projectId, memory: draft.memory, createdAt: now, updatedAt: now, messages: [] };
    chats.push(chat);
    currentId = chat.id;
  }
  const files = attachments.flatMap((a) => a.files);
  const msg = { text, at: now, model: choice.model, effort: choice.effort, attachments: attachments.map((a) => ({ kind: a.kind, name: a.name, count: a.files.length })), files };
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
});

/* ── Model and effort picker ── */
// Logos are the AIs' own marks (Claude, GPT, Gemini, Muse, Grok), not the companies'.
const AIS = {
  claude: { name: 'Claude', logo: '/assets/ai/claude-color.svg' },
  gpt: { name: 'GPT', logo: '/assets/ai/openai.svg' },
  gemini: { name: 'Gemini', logo: '/assets/ai/gemini-color.svg' },
  muse: { name: 'Muse', logo: '/assets/ai/muse-color.svg' },
  grok: { name: 'Grok', logo: '/assets/ai/grok.svg' },
};
// efforts: which effort levels the model offers (default Low / Medium / High)
const FLASH = ['low', 'high'];
const MODELS = [
  { id: 'claude-fable-5-1', ai: 'claude', name: 'Claude Fable 5.1', note: 'Most capable, for long-running work' },
  { id: 'claude-opus-5-5', ai: 'claude', name: 'Claude Opus 5.5', note: 'Deep reasoning and coding' },
  { id: 'claude-sonnet-5-5', ai: 'claude', name: 'Claude Sonnet 5.5', note: 'Smart and fast, a great everyday pick' },
  { id: 'claude-haiku-5-5', ai: 'claude', name: 'Claude Haiku 5.5', note: 'Fastest Claude' },
  { id: 'gpt-6-astra', ai: 'gpt', name: 'GPT-6 Astra', note: 'Complex reasoning and coding' },
  { id: 'gpt-6.1-sol', ai: 'gpt', name: 'GPT-6.1 Sol', note: 'Balances intelligence and cost' },
  { id: 'gpt-6.1-terra', ai: 'gpt', name: 'GPT-6.1 Terra', note: 'Fast, good at visuals and writing' },
  { id: 'gpt-6-luna', ai: 'gpt', name: 'GPT-6 Luna', note: 'Quick and low-cost' },
  { id: 'gemini-4-argon', ai: 'gemini', name: 'Gemini 4 Argon', note: "Google's newest flagship" },
  { id: 'gemini-3.1-pro-preview', ai: 'gemini', name: 'Gemini 3.1 Pro', note: 'Strong reasoning, long documents' },
  { id: 'gemini-3.8-flash', ai: 'gemini', name: 'Gemini 3.8 Flash', note: 'Fast and capable', efforts: FLASH },
  { id: 'gemini-3.5-flash-lite', ai: 'gemini', name: 'Gemini 3.5 Flash-Lite', note: 'Fastest, lowest cost', efforts: FLASH },
  { id: 'muse-wonder-1.0', ai: 'muse', name: 'Muse Wonder', note: "Meta's most capable" },
  { id: 'muse-spark-1.3', ai: 'muse', name: 'Muse Spark 1.3', note: 'Quick everyday model' },
  { id: 'grok-4.7', ai: 'grok', name: 'Grok 4.7', note: 'Coding, agents and knowledge work' },
  { id: 'grok-4.6', ai: 'grok', name: 'Grok 4.6', note: 'The previous Grok' },
];
const EFFORT_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };
const modelById = (id) => MODELS.find((m) => m.id === id) || null;
const effortsFor = (m) => m.efforts || ['low', 'medium', 'high'];
// keep the effort if this model has it, otherwise the closest one it does have
const fitEffort = (m, effort) => {
  const list = effortsFor(m);
  if (list.includes(effort)) return effort;
  return list.includes('medium') && effort !== 'max' ? 'medium' : 'high';
};
const shortName = (m) => m.name.replace(/^Claude /, '');
const modelMenu = $('model-menu');
const modelBtn = $('model-btn');

let choice = { model: 'claude-sonnet-5-5', effort: 'medium' };
try {
  const c = JSON.parse(localStorage.getItem('ea.model'));
  if (c && modelById(c.model)) choice = { model: c.model, effort: fitEffort(modelById(c.model), c.effort) };
} catch {}

function setChoice(next) {
  const merged = { ...choice, ...next };
  choice = { model: merged.model, effort: fitEffort(modelById(merged.model), merged.effort) };
  try { localStorage.setItem('ea.model', JSON.stringify(choice)); } catch {}
  renderModel();
}

function renderModel() {
  const m = modelById(choice.model);
  $('model-logo').src = AIS[m.ai].logo;
  $('model-name').textContent = shortName(m);
  $('model-effort').textContent = EFFORT_LABEL[choice.effort];
  modelBtn.title = `${m.name} · ${EFFORT_LABEL[choice.effort]} effort`;
  modelBtn.setAttribute('aria-label', `Model: ${modelBtn.title}`);
  if (!modelMenu.hidden) renderModelMenu();
}

function renderModelMenu() {
  const groups = Object.entries(AIS).map(([key, ai]) => el('div', { class: 'model-group', role: 'group', 'aria-label': ai.name },
    el('div', { class: 'model-group-head' }, el('img', { src: ai.logo, alt: '', width: '16', height: '16' }), ai.name),
    MODELS.filter((m) => m.ai === key).map((m) => el('button', {
      type: 'button', class: 'menu-item model-opt', role: 'menuitemradio', 'aria-checked': String(m.id === choice.model),
      title: m.note, onclick: () => setChoice({ model: m.id }),
    },
      el('span', { class: 'grow model-opt-name' }, m.name),
      m.id === choice.model && icon('check')))));
  fill($('model-groups'), groups);

  const levels = effortsFor(modelById(choice.model));
  $('effort-seg').style.setProperty('--n', levels.length);
  $('effort-seg').style.setProperty('--i', levels.indexOf(choice.effort)); // slides the highlight
  fill($('effort-seg'), levels.map((k) => el('button', {
    type: 'button', class: 'effort-opt', role: 'radio', 'aria-checked': String(k === choice.effort),
    onclick: () => setChoice({ effort: k }),
  }, EFFORT_LABEL[k])));
}

const modelMenuOpen = () => isShown(modelMenu);
function openModelMenu() {
  closeMenu();
  renderModelMenu();
  showPop(modelMenu);
  modelBtn.setAttribute('aria-expanded', 'true');
  placeMenu(modelMenu, 330); // compact: the list scrolls
  modelMenu.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest' });
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
// Settings, Usage and Upgrade plan don't do anything yet
accountMenu.querySelectorAll('[data-soon]').forEach((b) => b.addEventListener('click', closeAccount));
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

function pickedItems(list, folder) {
  const files = [...list].map((f) => ({ name: f.name, path: f.webkitRelativePath || f.name, size: f.size, type: f.type || '' }));
  if (!files.length) return [];
  if (folder) return [{ kind: 'folder', name: files[0].path.split('/')[0] || 'Folder', files }];
  return files.map((f) => ({ kind: 'file', name: f.name, files: [f] }));
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
    renderChips();
    input.focus();
  }
}
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
  if (menuOpen()) { closeMenu(); plusBtn.focus(); }
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
