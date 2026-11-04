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

function renderSidebar() {
  const sorted = [...chats].sort(byRecent);
  $('chat-list').replaceChildren(...sorted.map((c) => el('li', {},
    el('button', { type: 'button', class: 'chat-item', title: c.title, 'aria-current': c.id === currentId ? 'page' : null, onclick: () => openChat(c.id) }, c.title),
    el('button', { type: 'button', class: 'chat-del', 'aria-label': `Delete “${c.title}”`, title: 'Delete chat', onclick: () => deleteChat(c.id) }, icon('x')),
  )));
  $('chats-empty').hidden = chats.length > 0;
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

function chip(iconName, label, removeLabel, onRemove, cls = '') {
  return el('span', { class: `chip ${cls}` },
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
  const msg = { text, at: now, attachments: attachments.map((a) => ({ kind: a.kind, name: a.name, count: a.files.length })), files };
  chat.messages.push(msg);
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

/* ── + menu: upload files / a folder, add to a project, save to memory ── */
const menuOpen = () => !plusMenu.hidden;
function openMenu() {
  memoryToggle.checked = settings().memory;
  renderMenuProjects();
  $('menu-projects').hidden = true;
  $('menu-project-btn').setAttribute('aria-expanded', 'false');
  plusMenu.hidden = false;
  plusBtn.setAttribute('aria-expanded', 'true');
  placeMenu();
}
// open below the bar if it fits, otherwise above (whichever side has more room), and never off-screen
function placeMenu() {
  const r = composer.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 16;
  const above = r.top - 16;
  plusMenu.style.maxHeight = '';
  const h = plusMenu.scrollHeight;
  const down = below >= h || below >= above;
  plusMenu.classList.toggle('down', down);
  plusMenu.style.maxHeight = `${Math.max(160, Math.min(h, down ? below : above))}px`;
}
function closeMenu() {
  plusMenu.hidden = true;
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
  placeMenu();
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
const searchOpen = () => !searchLayer.hidden;
function openSearch() {
  closeMenu();
  searchLayer.hidden = false;
  searchInput.value = '';
  runSearch();
  searchInput.focus();
  if (phone.matches) setSidebar(false);
}
function closeSearch() { searchLayer.hidden = true; }
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
  else if (searchOpen()) closeSearch();
  else if (projectsOpen()) closeProjects();
  else if (phone.matches) setSidebar(false);
});

/* ── Start ── */
projectsEl.inert = true;
newGreeting();
renderSidebar();
renderChips();
if (!phone.matches) input.focus();
