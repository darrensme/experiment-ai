// Experiment AI app (/home): signed-in only. Greeting, sidebar with saved chats (sortable), projects and profile, the
// chat itself, and Settings (profile, appearance, chat & models, memory, usage, billing, account, data, …).
import { auth, db } from './firebase.js';
import {
  onAuthStateChanged, sendPasswordResetEmail, signOut, updateProfile, verifyBeforeUpdateEmail,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = document.body;

// Google already verifies its emails; email + password accounts verify with our code (same rule as the website).
const isVerified = (user) => user.emailVerified || user.providerData.some((p) => p.providerId === 'google.com');

/* ── Your settings (Settings panel). Saved on the server (api/settings.js); the look-and-feel ones are also kept in
      this browser so the page opens with them (the script in <head> applies theme, text size and reduced motion). ── */
const PREFS_KEY = 'experimentai.prefs';
const DEFAULT_PREFS = {
  nickname: '', about: '', instructions: '', style: 'balanced', language: '', defaultModel: '', defaultEffort: '',
  memoryDefault: true, theme: 'auto', textSize: 'default', sendKey: 'enter', reduceMotion: false, greetings: true,
};
let prefs = { ...DEFAULT_PREFS };
try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); } catch {}
let avatarUrl = null; // your uploaded picture (a data URL), if any
let memories = []; // [{ id, text, at }]
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
$$('[data-mod-key]').forEach((el) => { if (!el.textContent.trim() || el.textContent.trim() === ',') el.prepend(isMac ? '⌘' : 'Ctrl'); });

/* ── Greeting: the logo, then a line picked once per visit: by time of day, by weekday, or just for fun.
      "How are you today, Darren?", "Welcome back, Darren", "Up late, Darren?"… Off in Settings → plain "Good evening". ── */
const partOfDay = (h) => (h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late');
const bucketOf = (h) => (h < 5 ? 'late' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'late');
const firstName = (user) => (user.displayName || '').trim().split(/\s+/)[0] || '';
const callName = (user) => (prefs.nickname || '').trim() || firstName(user);
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// [before the name, after the name]; the name (if any) goes between, after a comma.
const GREETINGS = {
  any: [['How are you today', '?'], ['Welcome back', ''], ['Good to see you', ''], ['Ready to experiment', '?'],
    ['What are we making today', '?'], ['Let’s brew something good', ''], ['Back for more', '?'], ['What’s on your mind', '?'],
    ['Five AIs, standing by', ''], ['Hey there', '']],
  morning: [['Good morning', ''], ['Rise and shine', ''], ['Morning', '. Coffee first?']],
  afternoon: [['Good afternoon', ''], ['How’s the day going', '?'], ['Afternoon', '. What’s next?']],
  evening: [['Good evening', ''], ['Evening', '. What are we building?'], ['Winding down', '?']],
  late: [['Up late', '?'], ['Burning the midnight oil', '?'], ['Hey, night owl', '']],
};
const SUBLINES = [
  'Claude, ChatGPT, Gemini, Grok and Muse are ready when you are.', 'Ask anything. Pick any model.',
  'One question, five brilliant minds.', 'Your ideas, every AI.', 'Start typing. We’ll handle the rest.',
];
const pick = (list) => list[Math.floor(Math.random() * list.length)];
let greeting = null; // { bucket, parts, sub }, kept for the visit so it doesn't change every minute
function greet(user) {
  const now = new Date();
  const bucket = bucketOf(now.getHours());
  if (!greeting || greeting.bucket !== bucket) {
    const day = DAYS[now.getDay()];
    const pool = [...GREETINGS.any, ...GREETINGS[bucket], ...GREETINGS[bucket], [`Happy ${day}`, '']];
    if (day === 'Friday') pool.push(['Almost the weekend', '!']);
    if (day === 'Monday') pool.push(['New week, new ideas', '']);
    greeting = { bucket, parts: pick(pool), sub: pick(SUBLINES) };
  }
  const [before, after] = prefs.greetings ? greeting.parts : [partOfDay(now.getHours()), ''];
  const name = callName(user);
  $('.greet-a').textContent = before;
  $('.greet-name').textContent = name;
  $('.greet-name-wrap').hidden = !name;
  $('.greet-b').textContent = after;
  $('.greet-sub').textContent = prefs.greetings ? greeting.sub : '';
}

/* ── Profile, pinned to the bottom of the sidebar (and the big one in Settings → Profile) ── */
function showProfile(user) {
  const name = (user.displayName || '').trim() || user.email?.split('@')[0] || 'You';
  $('.profile-name').textContent = name;
  $('.profile-email').textContent = user.email || '';
  const photo = avatarUrl || user.photoURL || '';
  $$('.avatar').forEach((box) => {
    $('.avatar-initial', box).textContent = name[0].toUpperCase();
    const img = $('img', box);
    img.onload = () => { img.hidden = false; };
    img.onerror = () => { img.hidden = true; };
    if (photo) img.src = photo;
    else { img.hidden = true; img.removeAttribute('src'); }
  });
  $('[data-avatar-remove]').hidden = !avatarUrl;
}

const profileBtn = $('.profile-btn');
const profileMenu = $('.profile-menu');
const learnMore = $('.learn-more');
const learnList = $('#learn-list');
const setLearn = (open) => {
  learnList.hidden = !open;
  learnMore.setAttribute('aria-expanded', String(open));
};
const setMenu = (open) => {
  profileMenu.hidden = !open;
  profileBtn.setAttribute('aria-expanded', String(open));
  if (!open) setLearn(false);
};
profileBtn.addEventListener('click', () => setMenu(profileMenu.hidden));
learnMore.addEventListener('click', () => setLearn(learnList.hidden));
document.addEventListener('click', (e) => { if (!e.target.closest('.profile')) setMenu(false); });
$$('[data-signout]').forEach((b) => b.addEventListener('click', async () => {
  await signOut(auth);
  location.replace('/');
}));

/* ── Chats: saved in this browser (per account) after every reply, listed in the sidebar. Sort them (recent, newest,
      oldest, A–Z, Z–A, longest; pinned ones stay on top), search titles and text, and use ⋯ to pin, rename or delete. ── */
const CHAT_LIMIT = 200;
const SORT_KEY = 'experimentai.chatSort';
let chats = []; // [{ id, title, messages: [{ role, content }], createdAt, updatedAt, pinned, model }]
let chatsKey = '';
let currentChatId = null;
const searchBtn = $('[data-search]');
const searchBox = $('.side-search');
const searchInput = $('#chat-search');
const sortSelect = $('.chat-sort');
try { if (localStorage.getItem(SORT_KEY)) sortSelect.value = localStorage.getItem(SORT_KEY); } catch {}
if (!sortSelect.value) sortSelect.value = 'recent';

const titleFrom = (text) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t || 'New chat';
};
function loadChats(uid) {
  chatsKey = `experimentai.chats.${uid}`;
  try { chats = JSON.parse(localStorage.getItem(chatsKey) || '[]').filter((c) => c?.id && Array.isArray(c.messages)); } catch { chats = []; }
  renderChats();
}
// Save; if the browser's storage is full, let go of the oldest unpinned chats until it fits.
function saveChats() {
  for (;;) {
    try { localStorage.setItem(chatsKey, JSON.stringify(chats)); return; } catch {
      const victim = chats.filter((c) => !c.pinned && c.id !== currentChatId).sort((a, b) => a.updatedAt - b.updatedAt)[0];
      if (!victim) return;
      chats = chats.filter((c) => c !== victim);
    }
  }
}
// The open chat (chat = its messages, kept below) goes into the list: new on the first reply, updated after that.
function persistChat() {
  if (!chatsKey || !chat.length) return;
  const now = Date.now();
  let c = chats.find((x) => x.id === currentChatId);
  if (!c) {
    c = { id: crypto.randomUUID(), title: titleFrom(chat[0].content), messages: [], createdAt: now, pinned: false };
    chats.unshift(c);
    currentChatId = c.id;
    history.replaceState(null, '', `/home?c=${encodeURIComponent(c.id)}`);
  }
  c.messages = chat.map(({ role, content }) => ({ role, content }));
  c.updatedAt = now;
  c.model = choice.model;
  const unpinned = chats.filter((x) => !x.pinned).sort((a, b) => b.updatedAt - a.updatedAt);
  if (chats.length > CHAT_LIMIT) chats = chats.filter((x) => x.pinned || unpinned.indexOf(x) < CHAT_LIMIT);
  saveChats();
  renderChats();
}
function openChat(id) {
  const c = chats.find((x) => x.id === id);
  if (!c || streaming) return;
  closeChatMenu();
  currentChatId = id;
  chat.length = 0;
  c.messages.forEach((m) => chat.push({ role: m.role, content: m.content }));
  thread.replaceChildren();
  c.messages.forEach((m) => bubble(m.role, m.content));
  setChatting(true);
  history.replaceState(null, '', `/home?c=${encodeURIComponent(id)}`);
  note.textContent = '';
  renderChats();
  scrollDown();
  if (phone.matches) setSidebar(false);
}

const SORTS = {
  recent: (a, b) => b.updatedAt - a.updatedAt,
  newest: (a, b) => b.createdAt - a.createdAt,
  oldest: (a, b) => a.createdAt - b.createdAt,
  az: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }),
  za: (a, b) => b.title.localeCompare(a.title, undefined, { sensitivity: 'base', numeric: true }),
  longest: (a, b) => b.messages.length - a.messages.length || b.updatedAt - a.updatedAt,
};
function renderChats() {
  const q = searchInput.value.trim().toLowerCase();
  const sort = SORTS[sortSelect.value] || SORTS.recent;
  const shown = chats
    .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || sort(a, b));
  $('.chat-list').replaceChildren(...shown.map(chatRow));
  $('.chat-empty').hidden = shown.length > 0;
  $('.chat-empty').textContent = chats.length ? 'No chats match your search.' : 'No chats yet. Start one and it’ll show up here.';
  $('.chat-sort-wrap').hidden = chats.length < 2;
}
function chatRow(c) {
  const row = document.createElement('div');
  row.className = `chat-item${c.id === currentChatId ? ' is-current' : ''}`;
  const a = document.createElement('a');
  a.href = `/home?c=${encodeURIComponent(c.id)}`;
  a.textContent = c.title;
  a.title = c.title;
  if (c.id === currentChatId) a.setAttribute('aria-current', 'page');
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; // new tab etc. still works
    e.preventDefault();
    openChat(c.id);
  });
  row.append(a);
  if (c.pinned) row.append(Object.assign(document.createElement('span'), { className: 'pin-mark', textContent: 'Pinned' }));
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'chat-more';
  more.textContent = '⋯';
  more.setAttribute('aria-label', `More for “${c.title}”`);
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', 'false');
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = openChatMenu?.row === row;
    closeChatMenu();
    if (!wasOpen) showChatMenu(c, row, more);
  });
  row.append(more);
  return row;
}
let openChatMenu = null;
function closeChatMenu() {
  if (!openChatMenu) return;
  openChatMenu.menu.remove();
  openChatMenu.button.setAttribute('aria-expanded', 'false');
  openChatMenu = null;
}
function showChatMenu(c, row, button) {
  const menu = document.createElement('div');
  menu.className = 'chat-menu glass';
  menu.setAttribute('role', 'menu');
  const item = (label, fn, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', (e) => { e.stopPropagation(); closeChatMenu(); fn(); });
    return b;
  };
  menu.append(
    item(c.pinned ? 'Unpin' : 'Pin to top', () => { c.pinned = !c.pinned; saveChats(); renderChats(); }),
    item('Rename', () => renameChat(c)),
    item('Delete', () => deleteChat(c), 'danger'),
  );
  row.append(menu);
  button.setAttribute('aria-expanded', 'true');
  openChatMenu = { row, menu, button };
  menu.firstChild.focus();
}
function renameChat(c) {
  const row = [...$('.chat-list').children].find((r) => $('a', r)?.textContent === c.title);
  if (!row) return;
  const input = Object.assign(document.createElement('input'), { className: 'chat-rename', value: c.title, maxLength: 80 });
  input.setAttribute('aria-label', 'Chat name');
  row.replaceChildren(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const v = input.value.trim();
    if (save && v) { c.title = v.slice(0, 80); saveChats(); }
    renderChats();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}
function deleteChat(c) {
  if (!confirm(`Delete “${c.title}”? This can’t be undone.`)) return;
  chats = chats.filter((x) => x !== c);
  saveChats();
  if (c.id === currentChatId) $('[data-new-chat]').click();
  else renderChats();
}
document.addEventListener('click', (e) => { if (openChatMenu && !openChatMenu.row.contains(e.target)) closeChatMenu(); });
sortSelect.addEventListener('change', () => {
  try { localStorage.setItem(SORT_KEY, sortSelect.value); } catch {}
  renderChats();
});

const setSearch = (open) => {
  searchBox.hidden = !open;
  searchBtn.setAttribute('aria-expanded', String(open));
  if (open) searchInput.focus();
  else { searchInput.value = ''; renderChats(); }
};
searchBtn.addEventListener('click', () => setSearch(searchBox.hidden));
searchInput.addEventListener('input', renderChats);

/* ── Message bar. Sending goes to /api/chat (see "Chat" below). ── */
const composer = $('.composer');
const field = $('textarea', composer);
const sendBtn = $('.send', composer);
const note = $('.composer-note');
const fit = () => {
  field.style.height = 'auto';
  field.style.height = `${Math.min(field.scrollHeight, 200)}px`;
  sendBtn.disabled = !field.value.trim() && !attached.length;
};

/* ── Files of any kind, or whole folders: the + menu, drag and drop, or paste. Kept in the browser until the AI is connected.
      A folder counts as one item; its files together must fit the size limit. ── */
const MAX_ITEMS = 8;
const MAX_MB = 500;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MAX_FOLDER_FILES = 1000;
const JUNK = /^(\.DS_Store|Thumbs\.db|desktop\.ini)$|^\._/; // files the OS adds to folders on its own
const attached = []; // { id, file, url } or { id, folder: { name, items: [{ file, path }], bytes } }
const fileInput = $('.file-input', composer);
const folderInput = $('.folder-input', composer);
const list = $('.attachments', composer);
const X_GLYPH = '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="10.3" y="2" width="3.4" height="20" rx="1.7" transform="rotate(45 12 12)" /><rect x="10.3" y="2" width="3.4" height="20" rx="1.7" transform="rotate(-45 12 12)" /></svg>';
const ext = (name) => (name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE');
const size = (n) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

function renderFiles() {
  list.hidden = !attached.length;
  list.replaceChildren(...attached.map((a) => {
    const { id, file, url, folder } = a;
    const name = folder ? folder.name : file.name;
    const li = document.createElement('li');
    const chip = () => {
      const box = document.createElement('div');
      box.className = 'att-file';
      box.innerHTML = '<span class="att-icon"></span><span class="att-text"><span class="att-name"></span><span class="att-size"></span></span>';
      if (folder) {
        $('.att-icon', box).classList.add('is-folder');
        $('.att-icon', box).textContent = folder.items.length > 999 ? '1k' : String(folder.items.length);
        $('.att-size', box).textContent = `${folder.items.length} file${folder.items.length === 1 ? '' : 's'} · ${size(folder.bytes)}`;
      } else {
        $('.att-icon', box).textContent = ext(file.name);
        $('.att-size', box).textContent = size(file.size);
      }
      $('.att-name', box).textContent = name;
      return box;
    };
    if (url) {
      const img = document.createElement('img');
      img.className = 'att-thumb';
      img.alt = file.name;
      // Photos the browser can't draw (HEIC from iPhones in Chrome, RAW…) still attach; they just show as a chip.
      img.onerror = () => {
        URL.revokeObjectURL(url);
        a.url = '';
        img.replaceWith(chip());
      };
      img.src = url;
      li.append(img);
    } else li.append(chip());
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'att-remove';
    x.setAttribute('aria-label', `Remove ${name}`);
    x.innerHTML = X_GLYPH;
    x.addEventListener('click', () => removeFile(id));
    li.append(x);
    return li;
  }));
  fit();
}

// files: File[]; folders: [{ name, items: [{ file, path }] }]
function addItems(files = [], folders = []) {
  const skipped = [];
  let full = false;
  const room = () => {
    if (attached.length < MAX_ITEMS) return true;
    if (!full) skipped.push(`you can add up to ${MAX_ITEMS} files or folders`);
    full = true;
    return false;
  };
  for (const { name, items: all } of folders) {
    if (!room()) break;
    const items = all.filter(({ file }) => !JUNK.test(file.name));
    const bytes = items.reduce((n, { file }) => n + file.size, 0);
    if (!items.length) { skipped.push(`${name} is empty`); continue; }
    if (items.length > MAX_FOLDER_FILES) { skipped.push(`${name} has over ${MAX_FOLDER_FILES} files`); continue; }
    if (bytes > MAX_BYTES) { skipped.push(`${name} is over ${MAX_MB} MB`); continue; }
    attached.push({ id: crypto.randomUUID(), url: '', folder: { name, items, bytes } });
  }
  for (const file of files) {
    if (!room()) break;
    if (file.size > MAX_BYTES) { skipped.push(`${file.name} is over ${MAX_MB} MB`); continue; }
    const url = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
    attached.push({ id: crypto.randomUUID(), file, url });
  }
  note.textContent = skipped.length ? `Not added: ${skipped.join('; ')}.` : '';
  renderFiles();
}

// a folder picked with the folder chooser arrives as a flat list; group it by its top-level folder
function foldersFromInput(files) {
  const byName = new Map();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const top = path.split('/')[0];
    if (!byName.has(top)) byName.set(top, []);
    byName.get(top).push({ file, path });
  }
  return [...byName].map(([name, items]) => ({ name, items }));
}

// a dropped folder: walk it (readEntries returns at most ~100 entries per call, so keep reading)
async function readFolder(entry) {
  const items = [];
  const walk = async (e) => {
    if (e.isFile) {
      items.push({ file: await new Promise((res, rej) => e.file(res, rej)), path: e.fullPath.replace(/^\//, '') });
      return;
    }
    const reader = e.createReader();
    for (;;) {
      const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) {
        if (items.length > MAX_FOLDER_FILES) return; // too big anyway; addItems will say so
        await walk(child);
      }
    }
  };
  await walk(entry);
  return { name: entry.name, items };
}

function removeFile(id) {
  const i = attached.findIndex((a) => a.id === id);
  if (i < 0) return;
  if (attached[i].url) URL.revokeObjectURL(attached[i].url);
  attached.splice(i, 1);
  renderFiles();
  field.focus();
}

function clearFiles() {
  attached.forEach((a) => a.url && URL.revokeObjectURL(a.url));
  attached.length = 0;
  renderFiles();
}

// the + opens a small menu: upload files, or a whole folder
const attachBtn = $('.attach', composer);
const attachMenu = $('.attach-menu', composer);
const pickers = { file: fileInput, folder: folderInput };
const setAttachMenu = (open) => {
  attachMenu.hidden = !open;
  attachBtn.setAttribute('aria-expanded', String(open));
  if (open) $('button', attachMenu).focus();
};
attachBtn.addEventListener('click', () => setAttachMenu(attachMenu.hidden));
$$('[data-pick]', attachMenu).forEach((b) => b.addEventListener('click', () => {
  setAttachMenu(false);
  pickers[b.dataset.pick].click();
}));
document.addEventListener('click', (e) => { if (!e.target.closest('.attach-wrap')) setAttachMenu(false); });
Object.entries(pickers).forEach(([kind, input]) => input.addEventListener('change', () => {
  const files = [...input.files];
  if (kind === 'folder') addItems([], foldersFromInput(files));
  else addItems(files);
  input.value = ''; // so picking the same thing again still fires
  field.focus();
}));
/* ── Modes, switched in the + menu: Research (deep research) and Memory (on by default on paid plans).
      Both apply to the current chat and reset on New chat. ── */
// Your plan comes from the server (/api/usage). The last one seen is kept in this browser so the page opens with it;
// if the server says otherwise, the page reloads once with the new plan. On localhost, ?plan=light|pro|max-5x|max-10x
// previews a plan. The server checks the plan on every message, so changing this in the browser unlocks nothing.
const PLANS = ['free', 'light', 'pro', 'max-5x', 'max-10x'];
const PLAN_KEY = 'experimentai.plan';
const planPreview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('plan');
const cachedPlan = (() => { try { return localStorage.getItem(PLAN_KEY); } catch { return null; } })();
const plan = planPreview || (PLANS.includes(cachedPlan) ? cachedPlan : 'free');
const rank = PLANS.includes(plan) ? PLANS.indexOf(plan) : 2; // an unknown preview value counts as Pro
// Unlimited accounts (the server says so) get every feature and model whatever their plan; their plan still shows
// as it is. Kept in this browser like the plan, so the page opens with it.
const UNLIMITED_KEY = 'experimentai.unlimited';
const unlimited = !planPreview && (() => { try { return localStorage.getItem(UNLIMITED_KEY) === '1'; } catch { return false; } })();
const featureRank = unlimited ? PLANS.length - 1 : rank;
const paid = featureRank >= 1; // Light and up: every model, Memory
const hasProjects = featureRank >= 2; // Pro and up
const modes = { research: false, memory: paid && prefs.memoryDefault !== false }; // Settings → Memory sets the default
const modesRow = $('.modes', composer);

function renderModes() {
  $$('[data-toggle]', attachMenu).forEach((b) => b.setAttribute('aria-checked', String(modes[b.dataset.toggle])));
  const memoryBtn = $('[data-toggle="memory"]', attachMenu);
  memoryBtn.disabled = !paid;
  $('.memory-hint', attachMenu).textContent = paid ? 'Remember this chat' : 'Light plan and up';
  field.placeholder = modes.research ? 'What should I research?' : 'Ask anything';

  const tags = [];
  const project = projects.find((p) => p.id === activeProject);
  if (project) tags.push({ key: 'project', label: project.name, muted: true, aria: `Leave project ${project.name}` });
  if (modes.research) tags.push({ key: 'research', label: 'Research', muted: false, aria: 'Turn off Research' });
  if (paid && !modes.memory) tags.push({ key: 'memory', label: 'Memory off', muted: true, aria: 'Turn Memory back on' });
  modesRow.hidden = !tags.length;
  modesRow.replaceChildren(...tags.map(({ key, label, muted, aria }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mode-tag${muted ? ' muted' : ''}`;
    b.setAttribute('aria-label', aria);
    b.innerHTML = `<span></span>${X_GLYPH}`;
    b.firstChild.textContent = label;
    b.addEventListener('click', () => {
      if (key === 'project') setProject(null);
      else modes[key] = key === 'memory'; // research → off, memory → back on
      renderModes();
      field.focus();
    });
    return b;
  }));
}

$$('[data-toggle]', attachMenu).forEach((b) => b.addEventListener('click', () => {
  modes[b.dataset.toggle] = !modes[b.dataset.toggle];
  renderModes(); // the menu stays open so both can be set
}));

function resetModes() {
  modes.research = false;
  modes.memory = paid && prefs.memoryDefault !== false;
  renderModes();
}

/* ── Projects (Pro and up): chats that share files and instructions. Kept in this browser until accounts
      can store them; picking one shows it as a tag under the message box. ── */
let projects = [];
let activeProject = null;
let projectsKey = '';
const projectList = $('.project-list');
const projectForm = $('.project-form');
const projectInput = $('input', projectForm);
const projectsEmpty = $('.projects-empty');
const newProjectBtn = $('[data-new-project]');

function loadProjects(uid) {
  projectsKey = `experimentai.projects.${uid}`;
  try { projects = JSON.parse(localStorage.getItem(projectsKey) || '[]'); } catch { projects = []; }
  renderProjects();
}
function saveProjects() {
  try { localStorage.setItem(projectsKey, JSON.stringify(projects)); } catch {}
}
function renderProjects() {
  newProjectBtn.hidden = !hasProjects;
  projectList.replaceChildren(...(hasProjects ? projects : []).map((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span class="project-dot" aria-hidden="true"></span><span></span>';
    b.lastChild.textContent = p.name;
    b.setAttribute('aria-current', String(p.id === activeProject));
    b.addEventListener('click', () => {
      setProject(p.id === activeProject ? null : p.id);
      if (phone.matches) setSidebar(false);
      field.focus();
    });
    return b;
  }));
  if (!hasProjects) projectsEmpty.innerHTML = 'Projects come with Pro. <button type="button" class="link-inline" data-open-plans>See plans</button>';
  else projectsEmpty.textContent = projects.length ? '' : 'Group chats that share files and instructions.';
  projectsEmpty.hidden = !projectsEmpty.textContent;
}
function setProject(id) {
  activeProject = id;
  renderProjects();
  renderModes();
}
const setProjectForm = (open) => {
  projectForm.hidden = !open;
  if (open) projectInput.focus();
  else projectInput.value = '';
};
newProjectBtn.addEventListener('click', () => setProjectForm(projectForm.hidden));
projectForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = projectInput.value.trim();
  if (!name) return;
  const p = { id: crypto.randomUUID(), name, createdAt: Date.now() };
  projects.unshift(p);
  saveProjects();
  setProjectForm(false);
  setProject(p.id);
});
projectInput.addEventListener('blur', () => { if (!projectInput.value.trim()) setProjectForm(false); });
renderModes();

/* ── Model + effort: a picker under the message bar. It shows Effort, then each AI; pick an AI to see its models.
      Effort is Low, Medium or High for every AI (Free: Low and Medium). Free has a few fast models; Light and up has all. ── */
const EFFORTS = ['Low', 'Medium', 'High'];
const canUseEffort = (e) => EFFORTS.includes(e) && (paid || e !== 'High');
const MODELS = [
  { group: 'Claude', logo: 'claude-color.svg', items: [['anthropic/claude-opus-5.5', 'Opus 5.5', 1], ['anthropic/claude-sonnet-5.5', 'Sonnet 5.5', 1], ['anthropic/claude-haiku-5.5', 'Haiku 5.5', 0]] },
  { group: 'ChatGPT', logo: 'openai.svg', items: [['openai/gpt-6.1-sol', 'GPT-6.1 Sol', 1], ['openai/gpt-6.1-terra', 'GPT-6.1 Terra', 1], ['openai/gpt-6-luna', 'GPT-6 Luna', 0]] },
  { group: 'Gemini', logo: 'gemini-color.svg', items: [['google/gemini-4-argon', 'Gemini 4 Argon', 1], ['google/gemini-3.8-flash', 'Gemini 3.8 Flash', 0], ['google/gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite', 0]] },
  { group: 'Grok', logo: 'grok.svg', items: [['spacexai/grok-4.7', 'Grok 4.7', 1], ['spacexai/grok-4.6', 'Grok 4.6', 1]] },
  { group: 'Meta Muse', logo: 'meta-color.svg', items: [['meta/muse-wonder-1.0', 'Muse Wonder', 1], ['meta/muse-spark-1.3', 'Muse Spark 1.3', 1]] },
].map(({ group, logo, items }) => {
  const g = { group, logo: `/assets/ai/${logo}` };
  g.items = items.map(([id, name, minRank]) => ({ id, name, minRank, group: g }));
  return g;
});
const ALL_MODELS = MODELS.flatMap((g) => g.items);
const MODEL_KEY = 'experimentai.model';
const modelBtn = $('.model-btn');
const modelMenu = $('.model-menu');
const allowedModel = (id) => ALL_MODELS.some((m) => m.id === id && m.minRank <= featureRank);
const choice = { model: paid ? 'anthropic/claude-sonnet-5.5' : 'anthropic/claude-haiku-5.5', effort: 'Medium' };
try {
  const saved = JSON.parse(localStorage.getItem(MODEL_KEY) || '{}');
  if (allowedModel(saved.model)) choice.model = saved.model;
  if (canUseEffort(saved.effort)) choice.effort = saved.effort;
} catch {}
// Settings → Chat & models: the default model and effort win whenever the app opens.
const effortName = (e) => (e ? e[0].toUpperCase() + e.slice(1) : '');
function applyModelDefaults() {
  if (allowedModel(prefs.defaultModel)) choice.model = prefs.defaultModel;
  if (canUseEffort(effortName(prefs.defaultEffort))) choice.effort = effortName(prefs.defaultEffort);
}
applyModelDefaults();
let menuView = null; // null: Effort + the AIs; otherwise the AI whose models are showing
const NEXT = '<span class="chev chev-right" aria-hidden="true"></span>';
const BACK = '<span class="chev chev-left" aria-hidden="true"></span>';
const textEl = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });

function renderModel() {
  const current = ALL_MODELS.find((m) => m.id === choice.model);
  if (!canUseEffort(choice.effort)) choice.effort = 'Medium'; // e.g. High saved, now on Free
  $('.model-logo', modelBtn).src = current.group.logo;
  $('.model-name', modelBtn).textContent = current.name;
  $('.model-effort', modelBtn).textContent = choice.effort;

  const view = MODELS.find((g) => g.group === menuView);
  modelMenu.replaceChildren();
  if (!view) {
    modelMenu.insertAdjacentHTML('beforeend', `<p class="model-label">Effort</p><div class="effort" role="radiogroup" aria-label="Effort">${EFFORTS.map((e) => canUseEffort(e)
      ? `<button type="button" role="radio" aria-checked="${e === choice.effort}" data-effort="${e}">${e}</button>`
      : `<button type="button" role="radio" aria-checked="false" data-effort="${e}" disabled title="${e} effort comes with Light and up">${e}</button>`).join('')}</div><div class="menu-sep" role="separator"></div>`);
    for (const g of MODELS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ai-row';
      b.dataset.ai = g.group;
      b.setAttribute('aria-label', `${g.group} models`);
      b.innerHTML = `<img src="${g.logo}" alt="" width="18" height="18" />`;
      b.append(textEl('span', 'ai-name', g.group), textEl('span', 'ai-current', g === current.group ? current.name : ''));
      b.insertAdjacentHTML('beforeend', NEXT);
      modelMenu.append(b);
    }
    return;
  }
  // "‹ Claude" goes back to all the AIs
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'menu-back';
  back.dataset.back = '';
  back.setAttribute('aria-label', `Back to all AIs, from ${view.group}`);
  back.innerHTML = `${BACK}<img src="${view.logo}" alt="" width="18" height="18" />`;
  back.append(textEl('span', '', view.group));
  const sep = Object.assign(document.createElement('div'), { className: 'menu-sep' });
  modelMenu.append(back, sep, ...view.items.map((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `model-item${m.id === choice.model ? ' is-current' : ''}`;
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(m.id === choice.model));
    b.disabled = m.minRank > featureRank;
    b.dataset.model = m.id;
    b.append(textEl('span', '', m.name));
    if (m.id === choice.model) b.insertAdjacentHTML('beforeend', '<span class="tick" aria-hidden="true">✓</span>');
    else if (b.disabled) b.insertAdjacentHTML('beforeend', '<span class="lock">Light+</span>');
    return b;
  }));
}
const focusMenu = () => {
  const target = menuView
    ? $('.model-item[aria-checked="true"]', modelMenu) || $('.model-item:not(:disabled)', modelMenu) || $('[data-back]', modelMenu)
    : $('.effort [aria-checked="true"]', modelMenu);
  target?.focus();
};
const setModelMenu = (open) => {
  menuView = null;
  if (open) renderModel();
  modelMenu.hidden = !open;
  modelBtn.setAttribute('aria-expanded', String(open));
  if (open) focusMenu();
};
modelBtn.addEventListener('click', () => setModelMenu(modelMenu.hidden));
modelMenu.addEventListener('click', (e) => {
  const ai = e.target.closest('[data-ai]');
  const back = e.target.closest('[data-back]');
  const effort = e.target.closest('[data-effort]');
  const model = e.target.closest('[data-model]');
  if (ai || back) {
    const from = menuView;
    menuView = ai ? ai.dataset.ai : null;
    renderModel();
    if (back) $(`[data-ai="${from}"]`, modelMenu)?.focus();
    else focusMenu();
    return;
  }
  if (effort) choice.effort = effort.dataset.effort; // effort keeps the menu open
  else if (model && !model.disabled) choice.model = model.dataset.model;
  else return;
  renderModel();
  try { localStorage.setItem(MODEL_KEY, JSON.stringify(choice)); } catch {}
  if (model) { setModelMenu(false); field.focus(); }
  else $(`[data-effort="${choice.effort}"]`, modelMenu).focus();
});
// composedPath, not target.closest: clicking a choice re-renders the menu, so the clicked button is already detached
document.addEventListener('click', (e) => {
  if (!e.composedPath().some((el) => el.classList?.contains('model-wrap'))) setModelMenu(false);
});
renderModel();

/* ── Dictate: speech typed into the message box (where the browser supports it) ── */
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const mic = $('.mic', composer);
let recognizer = null;
const setListening = (on) => {
  mic.setAttribute('aria-pressed', String(on));
  mic.setAttribute('aria-label', on ? 'Stop dictating' : 'Dictate');
  mic.title = on ? 'Stop dictating' : 'Dictate';
  if (!on) renderModes(); // restores the placeholder
  else field.placeholder = 'Listening…';
};
function stopDictation() { recognizer?.stop(); }
if (Recognition) {
  mic.hidden = false;
  mic.addEventListener('click', () => {
    if (recognizer) return stopDictation();
    const before = field.value && !/\s$/.test(field.value) ? `${field.value} ` : field.value;
    recognizer = new Recognition();
    recognizer.lang = navigator.language || 'en-US';
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onresult = (e) => {
      let heard = '';
      for (const result of e.results) heard += result[0].transcript;
      field.value = before + heard.trimStart();
      fit();
    };
    recognizer.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') note.textContent = 'Allow microphone access in your browser to dictate.';
      else if (e.error !== 'no-speech' && e.error !== 'aborted') note.textContent = 'Dictation stopped. Try again.';
    };
    recognizer.onend = () => {
      recognizer = null;
      setListening(false);
      field.focus();
    };
    note.textContent = '';
    recognizer.start();
    setListening(true);
  });
}

field.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length) return;
  e.preventDefault();
  addItems(files);
});

// drag files anywhere over the page
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  app.classList.add('dragging');
});
addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) app.classList.remove('dragging');
});
addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  app.classList.remove('dragging');
  // the drop's item list only lasts for this event, so grab the entries before awaiting anything
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  const dropped = [...e.dataTransfer.files];
  if (!entries.length) addItems(dropped);
  else {
    const dirs = entries.filter((en) => en.isDirectory);
    const files = dropped.filter((f) => !dirs.some((d) => d.name === f.name));
    if (dirs.length) note.textContent = 'Reading folder…';
    addItems(files, await Promise.all(dirs.map(readFolder)));
  }
  field.focus();
});
field.addEventListener('input', () => { fit(); note.textContent = ''; });
// Enter sends (Shift+Enter: new line), or ⌘/Ctrl+Enter sends if that's chosen in Settings → Chat & models.
field.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const mod = e.metaKey || e.ctrlKey;
  const send = prefs.sendKey === 'mod-enter' ? mod : !e.shiftKey && !mod;
  if (send) {
    e.preventDefault();
    composer.requestSubmit();
  }
});
/* ── Chat: your message and the chat so far go to /api/chat, which streams the chosen model's reply back. The chat is
      saved after each reply (see Chats above). With Memory on, the server adds your memories. Files and Research aren't
      sent yet. ── */
const thread = $('.thread');
const chat = []; // { role: 'user' | 'assistant', content }
let streaming = null; // an AbortController while a reply is coming in

function bubble(role, text) {
  const el = document.createElement('div');
  el.className = `msg msg-${role}`;
  el.textContent = text;
  if (role === 'user' && paid) {
    // "Remember": put this message in your Memory (Settings → Memory), Light and up
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'msg-remember', textContent: 'Remember' });
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await addMemory(text);
        b.textContent = 'Remembered ✓';
        b.classList.add('done');
      } catch (err) {
        b.disabled = false;
        note.textContent = err.message;
      }
    });
    el.append(b);
  }
  thread.append(el);
  return el;
}
const scrollDown = () => { thread.scrollTop = thread.scrollHeight; };
const setChatting = (on) => {
  app.classList.toggle('chatting', on);
  thread.hidden = !on;
};

async function sendChat(text) {
  const user = auth.currentUser;
  if (!user || streaming) return;
  chat.push({ role: 'user', content: text });
  setChatting(true);
  const mine = bubble('user', text);
  const reply = bubble('assistant', '');
  reply.classList.add('pending');
  reply.setAttribute('aria-label', 'Thinking…');
  scrollDown();
  streaming = new AbortController();
  composer.classList.add('busy');
  let answer = '';
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      signal: streaming.signal,
      headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: choice.model, effort: choice.effort.toLowerCase(), memory: modes.memory, messages: chat }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'text') {
          answer += event.text;
          reply.textContent = answer;
          reply.classList.remove('pending');
          reply.removeAttribute('aria-label');
          scrollDown();
        } else if (event.type === 'error') note.textContent = event.error;
        else if (event.type === 'done') {
          Object.assign(spent, event.spent);
          Object.assign(budget, event.budgets);
          renderUsage();
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') note.textContent = err.message;
  } finally {
    streaming = null;
    composer.classList.remove('busy');
    reply.classList.remove('pending');
    if (answer) {
      chat.push({ role: 'assistant', content: answer });
      persistChat();
    } else {
      // nothing came back: take the message out again and put it back in the box to retry
      reply.remove();
      mine.remove();
      chat.pop();
      if (!field.value.trim()) { field.value = text; fit(); }
      if (!chat.length) setChatting(false);
    }
  }
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  stopDictation();
  if (streaming) return;
  const text = field.value.trim();
  if (!text) {
    if (attached.length) note.textContent = 'Add a message. Files aren’t sent to the AI yet.';
    return;
  }
  note.textContent = attached.length ? 'Files aren’t sent to the AI yet, only your message.' : '';
  field.value = '';
  clearFiles();
  fit();
  sendChat(text);
});

/* ── New chat: back to an empty message bar ── */
$('[data-new-chat]').addEventListener('click', () => {
  streaming?.abort();
  chat.length = 0;
  currentChatId = null;
  renderChats();
  thread.replaceChildren();
  setChatting(false);
  history.replaceState(null, '', '/home');
  setSearch(false);
  stopDictation();
  setModelMenu(false);
  field.value = '';
  clearFiles();
  resetModes();
  note.textContent = '';
  if (phone.matches) setSidebar(false);
  field.focus();
});

/* ── Sidebar: on desktop it can be hidden (remembered); on phones it slides in over the page ── */
const phone = matchMedia('(max-width: 820px)');
const HIDDEN_KEY = 'experimentai.sidebarHidden';
const remember = (hidden) => { try { localStorage.setItem(HIDDEN_KEY, hidden ? '1' : '0'); } catch {} };
const setSidebar = (open) => {
  if (phone.matches) app.classList.toggle('side-open', open);
  else {
    app.classList.toggle('side-hidden', !open);
    remember(!open);
  }
  $('[data-side-open]').setAttribute('aria-expanded', String(open));
};
try { if (localStorage.getItem(HIDDEN_KEY) === '1') app.classList.add('side-hidden'); } catch {}
phone.addEventListener('change', () => app.classList.remove('side-open'));
$$('[data-side-open]').forEach((b) => b.addEventListener('click', () => setSidebar(true)));
$$('[data-side-close]').forEach((b) => b.addEventListener('click', () => setSidebar(false)));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!attachMenu.hidden) { setAttachMenu(false); attachBtn.focus(); return; }
    if (!modelMenu.hidden) { setModelMenu(false); modelBtn.focus(); return; }
    if (!projectForm.hidden) { setProjectForm(false); return; }
    setMenu(false);
    if (!searchBox.hidden) setSearch(false);
    if (phone.matches) setSidebar(false);
  }
});

/* ── Settings and Usage panels, opened from the profile menu ── */
const PLAN_NAMES = { free: 'Free', light: 'Light', pro: 'Pro', 'max-5x': 'Max 5×', 'max-10x': 'Max 10×' };
const PLAN_USAGE = {
  free: 'Limited', light: '5× the usage of Free', pro: '2× the usage of Light',
  'max-5x': '5× the usage of Pro', 'max-10x': '10× the usage of Pro',
};
const planKey = PLANS[rank];
// Monthly or yearly; yearly is 12 months for the price of 10. The real one comes from /api/usage (Stripe);
// on localhost, ?billing=yearly previews yearly.
const PLAN_PRICE = { light: 10, pro: 20, 'max-5x': 100, 'max-10x': 200 };
let billing = location.hostname === 'localhost' && new URLSearchParams(location.search).get('billing') === 'yearly' ? 'yearly' : 'monthly';
let billingInfo = null; // { billing, status, periodEnd, cancelAtPeriodEnd, canManage } from the server
function billingText() {
  const monthly = PLAN_PRICE[planKey];
  if (!monthly) return ''; // Free has nothing to bill
  let text = billing === 'yearly'
    ? `Yearly · $${(monthly * 10).toLocaleString('en-US')} a year`
    : `Monthly · $${monthly} a month`;
  if (billingInfo?.status === 'past_due') return `${text} · payment failed, update your card`;
  if (billingInfo?.periodEnd) {
    const date = new Date(billingInfo.periodEnd * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    text += ` · ${billingInfo.cancelAtPeriodEnd ? 'ends' : 'renews'} ${date}`;
  }
  return text;
}

// Usage budgets, shown only as percentages: a week is the plan's monthly price ÷ 4 of AI cost, and a day is that ÷ 7
// (Free counts as $3). The server keeps the real numbers and enforces them (api/_ai.js); this only shows them.
// On localhost, ?spent=day,week (in dollars) previews the bars.
const BUDGET_BASE = { free: 3, light: 10, pro: 20, 'max-5x': 100, 'max-10x': 200 };
const budget = { day: BUDGET_BASE[planKey] / 4 / 7, week: BUDGET_BASE[planKey] / 4 };
const spent = { day: 0, week: 0, models: {} };
const spentPreview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('spent');
if (spentPreview) [spent.day, spent.week] = spentPreview.split(',').map((n) => Number(n) || 0);

async function loadUsage(user) {
  try {
    const res = await fetch('/api/usage', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    if (!res.ok) return;
    const data = await res.json();
    if (!spentPreview) Object.assign(spent, data.spent);
    Object.assign(budget, data.budgets);
    renderUsage();
    if (!planPreview) {
      billingInfo = data.billing;
      if (billingInfo?.billing) billing = billingInfo.billing;
      fillSheets(user);
    }
    const nowUnlimited = Boolean(data.unlimited);
    if (!planPreview && PLANS.includes(data.plan) && (data.plan !== plan || nowUnlimited !== unlimited)) {
      try {
        localStorage.setItem(PLAN_KEY, data.plan);
        localStorage.setItem(UNLIMITED_KEY, nowUnlimited ? '1' : '0');
      } catch { return; }
      const seen = `${data.plan}|${nowUnlimited}`;
      if (sessionStorage.getItem(PLAN_KEY) !== seen) { // reload once, never in a loop
        sessionStorage.setItem(PLAN_KEY, seen);
        location.reload();
      }
    }
  } catch {} // the bars just stay as they were
}

// POST to one of our functions as the signed-in person; throws the server's message on failure.
async function apiPost(path, body = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// After paying or changing plan: remember the new plan and open the app again with it (and a welcome line).
function switchToPlan(newPlan) {
  try {
    localStorage.setItem(PLAN_KEY, newPlan);
    sessionStorage.removeItem(PLAN_KEY);
    sessionStorage.setItem('experimentai.welcome', newPlan);
  } catch {}
  location.replace('/home');
}

/* ── Payments: Stripe's embedded checkout, opened in the plans pop-up. Stripe.js is loaded only then, with advanced
      fraud signals off, so it doesn't set cookies or track on our pages (the site promises no cookies). The card form
      itself runs in Stripe's own frame on Stripe's domain. ── */
let stripeJs = null;
const loadStripeJs = () => (stripeJs ??= new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://js.stripe.com/endive/stripe.js?advancedFraudSignals=false';
  s.onload = () => resolve(window.Stripe);
  s.onerror = () => {
    stripeJs = null;
    s.remove();
    reject(new Error('Couldn’t load the payment form. Check your connection and try again.'));
  };
  document.head.append(s);
}));
let embeddedCheckout = null;
function closeCheckout() {
  embeddedCheckout?.destroy();
  embeddedCheckout = null;
  $('.checkout-wrap').hidden = true;
  $('.plans-slot').hidden = false;
}
async function openCheckout(publishableKey, clientSecret) {
  const Stripe = await loadStripeJs();
  closeCheckout(); // Stripe allows one embedded checkout at a time
  embeddedCheckout = await Stripe(publishableKey).createEmbeddedCheckoutPage({ fetchClientSecret: async () => clientSecret });
  $('.plans-slot').hidden = true;
  $('.checkout-wrap').hidden = false;
  embeddedCheckout.mount($('.checkout-mount'));
  $('.checkout-back').focus();
}
$('.checkout-back').addEventListener('click', closeCheckout);

// Stripe's billing page (cancel, card, invoices); it's a separate page on Stripe's site, so no cookies here either.
async function openBillingPortal(msg) {
  msg.textContent = 'Opening billing…';
  try {
    const { url } = await apiPost('/api/billing-portal');
    location.href = url;
  } catch (err) {
    msg.textContent = err.message;
  }
}
$('[data-manage-billing]').addEventListener('click', () => openBillingPortal($('.billing-msg')));

// Back from Stripe at /home?checkout=cs_…: turn the plan on now rather than waiting for the webhook.
const returningFrom = new URLSearchParams(location.search).get('checkout');
async function finishCheckout() {
  history.replaceState(null, '', '/home');
  try {
    const data = await apiPost('/api/checkout-status', { sessionId: returningFrom });
    if (data.status === 'complete' && data.plan && data.plan !== plan) return switchToPlan(data.plan);
    note.textContent = data.status === 'complete'
      ? `Welcome to ${PLAN_NAMES[data.plan] || 'your new plan'}!`
      : 'The payment didn’t go through, so nothing was charged. You can try again from Upgrade.';
  } catch (err) {
    note.textContent = err.message;
  }
}
// Usage, always as percentages: of the plan's day/week budget (unlimited accounts see the same %, never blocked),
// when each one resets, and this week's split by model.
const pctText = (raw) => (raw > 0 && raw < 1 ? '<1%' : `${Math.round(raw)}%`);
function resetIn(period) {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)); // next UTC midnight
  if (period === 'week') next.setUTCDate(next.getUTCDate() + ((8 - next.getUTCDay()) % 7)); // …that's a Monday
  const mins = Math.max(1, Math.round((next - now) / 60000));
  if (mins < 60) return `Resets in ${mins} min`;
  if (mins < 48 * 60) return `Resets in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `Resets in ${Math.round(mins / 1440)} days (Monday, midnight UTC)`;
}
function renderUsage() {
  for (const period of ['day', 'week']) {
    const box = $(`.usage-bar[data-period="${period}"]`);
    const raw = budget[period] ? (spent[period] / budget[period]) * 100 : 0;
    const pct = Math.min(100, Math.round(raw));
    $('.usage-pct', box).textContent = unlimited
      ? `${pctText(raw)} used · unlimited`
      : pct >= 100 ? 'Limit reached' : `${pctText(raw)} used`;
    const meter = $('.bar', box);
    meter.setAttribute('aria-valuenow', String(pct));
    meter.dataset.level = unlimited ? '' : pct >= 100 ? 'full' : pct >= 80 ? 'high' : '';
    $('i', meter).style.width = `${pct}%`;
    $('.usage-reset', box).textContent = resetIn(period);
  }
  // this week by model: each model's share of what you've used
  const byKey = new Map(ALL_MODELS.map((m) => [m.id.replace(/[./]/g, '_'), m]));
  const rows = Object.entries(spent.models || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, v]) => n + v, 0);
  $('.usage-models').replaceChildren(...rows.map(([key, v]) => {
    const m = byKey.get(key);
    const li = document.createElement('li');
    const share = total ? (v / total) * 100 : 0;
    li.innerHTML = '<img alt="" /><span class="um-name"></span><span class="um-pct"></span><div class="bar"><i></i></div>';
    $('img', li).src = m?.group.logo || 'assets/potion-orb-pfp-sky-bottle.png';
    $('.um-name', li).textContent = m ? `${m.group.group} · ${m.name}` : key;
    $('.um-pct', li).textContent = `${pctText(share)} of this week`;
    $('i', li).style.width = `${Math.max(2, share)}%`;
    return li;
  }));
  $('.usage-models-empty').hidden = rows.length > 0;
}
let openSheet = null;
let sheetOpener = null;

function fillSheets(user) {
  $$('.set-plan').forEach((el) => { el.textContent = PLAN_NAMES[planKey]; });
  $('.set-name').textContent = (user.displayName || '').trim() || '—';
  $('.set-email').textContent = user.email || '—';
  $('.set-provider').textContent = usesGoogle(user) ? 'Google' : 'Email and password';
  // a Google account’s email belongs to Google, so it can’t be changed here
  $('[data-edit="email"]').hidden = usesGoogle(user);
  $('.email-managed').hidden = !usesGoogle(user);
  $('.usage-limit').textContent = unlimited ? 'Unlimited (every model, no limits)' : PLAN_USAGE[planKey];
  $$('.set-billing').forEach((el) => {
    el.textContent = billingText();
    el.parentElement.hidden = !billingText();
  });
  $('.yearly-tip').hidden = !PLAN_PRICE[planKey] || billing === 'yearly';
  $('.manage-billing-row').hidden = !billingInfo?.canManage;
  $('.plan-hero-status').textContent = unlimited ? 'Unlimited usage on this account'
    : billingInfo?.status === 'past_due' ? 'Payment failed: update your card in Manage billing'
      : billingInfo?.cancelAtPeriodEnd ? 'Cancelled: stays on until the end of the period'
        : PLAN_PRICE[planKey] ? `$${PLAN_PRICE[planKey]} a month${billing === 'yearly' ? ', billed yearly' : ''}` : 'Free forever';
  // Account details
  const when = (t) => (t ? new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—');
  $('.set-created').textContent = when(user.metadata?.creationTime);
  $('.set-last').textContent = when(user.metadata?.lastSignInTime);
  $('.set-uid').textContent = user.uid;
  $('.password-row').hidden = !user.providerData.some((p) => p.providerId === 'password');
  // nothing to upgrade to from the top plan
  $$('[data-upgrade]').forEach((el) => { el.hidden = planKey === 'max-10x'; });
}
function setSheet(name, section) {
  // Usage lives in Settings now: the Usage buttons open that section
  if (name === 'usage') { name = 'settings'; section = 'usage'; }
  if (openSheet) openSheet.hidden = true;
  if (embeddedCheckout && name !== 'plans') closeCheckout();
  if (name === 'settings') {
    ['name', 'email'].forEach((key) => setEditing(key, false, true));
    showSection(section || lastSection);
  }
  if (name === 'plans') {
    plansMsg.textContent = '';
    loadPlans();
  }
  openSheet = name ? $(`.sheet[data-sheet-name="${name}"]`) : null;
  if (openSheet) {
    openSheet.hidden = false;
    $('.sheet-x', openSheet).focus();
  } else sheetOpener?.focus();
}
$$('[data-sheet]').forEach((b) => b.addEventListener('click', () => {
  sheetOpener = b.closest('.profile-menu') ? profileBtn : b; // focus goes back where you came from
  setMenu(false);
  setSheet(b.dataset.sheet);
}));
$$('[data-sheet-close]').forEach((b) => b.addEventListener('click', () => setSheet(null)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openSheet) {
    e.stopImmediatePropagation();
    setSheet(null);
  }
}, true);

/* ── Settings panel: sections on the left; every change saves itself (Saving… → Saved in the header). ── */
const SECTION_KEY = 'experimentai.settingsSection';
let lastSection = 'profile';
try { lastSection = sessionStorage.getItem(SECTION_KEY) || 'profile'; } catch {}
function showSection(name) {
  if (!$(`.settings-panel[data-panel="${name}"]`)) name = 'profile';
  lastSection = name;
  try { sessionStorage.setItem(SECTION_KEY, name); } catch {}
  $$('.settings-nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.section === name)));
  $(`.settings-nav [data-section="${name}"]`).scrollIntoView({ block: 'nearest', inline: 'nearest' }); // phones: tabs scroll
  $$('.settings-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
  $('.settings-panels').scrollTop = 0;
  if (name === 'usage') {
    requestAnimationFrame(renderUsage); // bars fill in as the section opens
    if (auth.currentUser) loadUsage(auth.currentUser);
  }
  if (name === 'memory') renderMemories();
  if (name === 'data') renderLocalSummary();
}
$$('.settings-nav button').forEach((b) => b.addEventListener('click', () => showSection(b.dataset.section)));

const saveState = $('.save-state');
let pendingPrefs = {};
let saveTimer = null;
function setPref(key, value, { now = false } = {}) {
  prefs[key] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  applyPrefs();
  pendingPrefs[key] = value;
  saveState.textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPrefs, now ? 0 : 700);
}
async function flushPrefs() {
  const patch = pendingPrefs;
  pendingPrefs = {};
  if (!Object.keys(patch).length) return;
  try {
    await apiPost('/api/settings', { action: 'save', settings: patch });
    saveState.textContent = 'Saved';
    setTimeout(() => { if (saveState.textContent === 'Saved') saveState.textContent = ''; }, 1800);
  } catch (err) {
    saveState.textContent = err.message;
  }
}
addEventListener('pagehide', () => { if (Object.keys(pendingPrefs).length) flushPrefs(); });

// What the settings change on screen right away.
function applyPrefs() {
  const root = document.documentElement;
  root.dataset.textSize = prefs.textSize || 'default';
  root.classList.toggle('reduce-motion', Boolean(prefs.reduceMotion));
  applyTheme();
  if (auth.currentUser) greet(auth.currentUser);
  const modKey = isMac ? '⌘' : 'Ctrl';
  const kbd = (...keys) => keys.map((k) => `<kbd>${k}</kbd>`).join('');
  $('.send-keys').innerHTML = prefs.sendKey === 'mod-enter' ? kbd(modKey, 'Enter') : kbd('Enter');
  $('.newline-keys').innerHTML = prefs.sendKey === 'mod-enter' ? kbd('Enter') : kbd('Shift', 'Enter');
  $('.send-hint').textContent = prefs.sendKey === 'mod-enter'
    ? `Enter adds a new line; ${modKey} + Enter sends. Handy for long messages.`
    : 'Enter sends; Shift + Enter adds a new line.';
}

// The controls show the saved settings.
const defaultModelSelect = $('select[data-pref="defaultModel"]');
defaultModelSelect.replaceChildren(...MODELS.map((g) => {
  const og = document.createElement('optgroup');
  og.label = g.group;
  og.append(...g.items.map((m) => {
    const o = new Option(m.minRank > featureRank ? `${m.name} (Light+)` : m.name, m.id);
    o.disabled = m.minRank > featureRank;
    return o;
  }));
  return og;
}));
const COUNT_MAX = { about: 1500, instructions: 3000 };
function updateCounts() {
  $$('[data-count-for]').forEach((el) => {
    const key = el.dataset.countFor;
    el.textContent = `${(prefs[key] || '').length} / ${COUNT_MAX[key].toLocaleString()}`;
  });
}
function fillPrefControls() {
  const shown = {
    ...prefs,
    defaultModel: allowedModel(prefs.defaultModel) ? prefs.defaultModel : choice.model,
    defaultEffort: prefs.defaultEffort || choice.effort.toLowerCase(),
  };
  $$('.settings-panels [data-pref]').forEach((el) => {
    const v = shown[el.dataset.pref];
    if (el.classList.contains('segmented')) {
      $$('button', el).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
    } else if (el.classList.contains('switch-btn')) {
      el.setAttribute('aria-checked', String(Boolean(v)));
    } else if (document.activeElement !== el) {
      el.value = v ?? '';
    }
  });
  // plan limits: High effort and Memory are Light and up
  $('[data-pref="defaultEffort"] [data-value="high"]').disabled = !paid;
  $('[data-pref="memoryDefault"]').disabled = !paid;
  $('.memory-plan-note').textContent = paid ? 'Switch it off for one chat in the + menu.' : 'Memory comes with Light and up.';
  $('.memory-add input').disabled = !paid;
  $('.memory-add button').disabled = !paid;
  updateCounts();
}
$$('.settings-panels .segmented').forEach((group) => group.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-value]');
  if (!b || b.disabled) return;
  setPref(group.dataset.pref, b.dataset.value, { now: true });
  if (group.dataset.pref === 'defaultEffort') {
    applyModelDefaults();
    renderModel();
    try { localStorage.setItem(MODEL_KEY, JSON.stringify(choice)); } catch {}
  }
  fillPrefControls();
}));
$$('.settings-panels .switch-btn').forEach((sw) => sw.addEventListener('click', () => {
  if (sw.disabled) return;
  setPref(sw.dataset.pref, !prefs[sw.dataset.pref], { now: true });
  if (sw.dataset.pref === 'memoryDefault' && !chat.length) resetModes();
  fillPrefControls();
}));
$$('.settings-panels input[data-pref], .settings-panels textarea[data-pref]').forEach((el) => el.addEventListener('input', () => {
  setPref(el.dataset.pref, el.value);
  updateCounts();
}));
defaultModelSelect.addEventListener('change', () => {
  setPref('defaultModel', defaultModelSelect.value, { now: true });
  applyModelDefaults();
  renderModel();
  try { localStorage.setItem(MODEL_KEY, JSON.stringify(choice)); } catch {}
});

/* Profile picture: cropped to a square and shrunk to 256×256 in the browser, then saved (api/settings.js). */
$('.avatar-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const msg = $('.avatar-msg');
  msg.textContent = 'Saving your picture…';
  try {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Pick a JPEG, PNG or WebP picture.');
    if (file.size > 15e6) throw new Error('That picture is over 15 MB. Try a smaller one.');
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // transparent PNGs get a white background, not black
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
    const { avatar } = await apiPost('/api/settings', { action: 'avatar', image: canvas.toDataURL('image/jpeg', 0.86) });
    avatarUrl = avatar;
    showProfile(auth.currentUser);
    msg.textContent = 'Saved.';
  } catch (err) {
    msg.textContent = err.message || 'That picture couldn’t be read. Try another one.';
  }
});
$('[data-avatar-remove]').addEventListener('click', async () => {
  const msg = $('.avatar-msg');
  try {
    await apiPost('/api/settings', { action: 'avatar', image: null });
    avatarUrl = null;
    showProfile(auth.currentUser);
    msg.textContent = 'Removed.';
  } catch (err) {
    msg.textContent = err.message;
  }
});

/* Memory: add, search, edit and delete what Experiment AI remembers (and "Remember" on your messages). */
const MEMORY_MAX = 100;
async function saveMemoryList(list) {
  const { memories: saved } = await apiPost('/api/settings', { action: 'memories', memories: list });
  memories = saved;
  renderMemories();
}
async function addMemory(text) {
  const t = text.trim().slice(0, 400);
  if (!t) return;
  if (memories.length >= MEMORY_MAX) throw new Error(`Memory is full (${MEMORY_MAX}). Delete something in Settings → Memory first.`);
  await saveMemoryList([{ text: t, at: Date.now() }, ...memories]);
}
const memoryMsg = (text) => { $('.memory-msg').textContent = text; };
function renderMemories() {
  const q = $('.memory-filter').value.trim().toLowerCase();
  const shown = memories.filter((m) => !q || m.text.toLowerCase().includes(q));
  $('.memory-list').replaceChildren(...shown.map((m) => {
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.className = 'mem-text';
    body.textContent = m.text;
    const date = textEl('span', 'mem-date', new Date(m.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }));
    body.append(date);
    const actions = document.createElement('div');
    actions.className = 'mem-actions';
    const edit = textEl('button', 'mem-edit', 'Edit');
    const del = textEl('button', 'mem-del', 'Delete');
    edit.type = del.type = 'button';
    edit.addEventListener('click', () => editMemory(li, m));
    del.addEventListener('click', async () => {
      try { await saveMemoryList(memories.filter((x) => x.id !== m.id)); memoryMsg('Forgotten.'); } catch (err) { memoryMsg(err.message); }
    });
    actions.append(edit, del);
    li.append(body, actions);
    return li;
  }));
  $('.memory-count').textContent = `${memories.length} of ${MEMORY_MAX} remembered`;
  $('.memory-empty').hidden = memories.length > 0;
  $('[data-memory-clear]').hidden = !memories.length;
}
function editMemory(li, m) {
  const area = Object.assign(document.createElement('textarea'), { value: m.text, maxLength: 400, rows: 2 });
  area.setAttribute('aria-label', 'Edit memory');
  const actions = document.createElement('div');
  actions.className = 'mem-actions';
  const save = textEl('button', '', 'Save');
  const cancel = textEl('button', '', 'Cancel');
  save.type = cancel.type = 'button';
  save.addEventListener('click', async () => {
    const t = area.value.trim();
    if (!t) return area.focus();
    try { await saveMemoryList(memories.map((x) => (x.id === m.id ? { ...x, text: t } : x))); memoryMsg('Updated.'); } catch (err) { memoryMsg(err.message); }
  });
  cancel.addEventListener('click', renderMemories);
  actions.append(save, cancel);
  li.replaceChildren(area, actions);
  area.focus();
}
$('.memory-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('input', e.currentTarget);
  try {
    await addMemory(input.value);
    input.value = '';
    memoryMsg('Remembered.');
  } catch (err) {
    memoryMsg(err.message);
  }
});
$('.memory-filter').addEventListener('input', renderMemories);
$('[data-memory-clear]').addEventListener('click', async () => {
  if (!confirm('Forget everything in Memory? This can’t be undone.')) return;
  try { await saveMemoryList([]); memoryMsg('Memory cleared.'); } catch (err) { memoryMsg(err.message); }
});

/* Account: copy your ID, reset your password, sign out everywhere. */
const accountMsg = (text) => { $('.account-msg').textContent = text; };
$('[data-copy-uid]').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(auth.currentUser.uid); accountMsg('Account ID copied.'); } catch { accountMsg('Couldn’t copy. Select it and copy instead.'); }
});
$('[data-reset-password]').addEventListener('click', async () => {
  try {
    await sendPasswordResetEmail(auth, auth.currentUser.email);
    accountMsg(`We sent a link to ${auth.currentUser.email}. Open it to set a new password.`);
  } catch {
    accountMsg('Couldn’t send the email. Try again in a few minutes.');
  }
});
$('[data-signout-all]').addEventListener('click', async () => {
  if (!confirm('Sign out on every device, including this one?')) return;
  try {
    await apiPost('/api/settings', { action: 'signout-all' });
    await signOut(auth);
    location.replace('/');
  } catch (err) {
    accountMsg(err.message);
  }
});

/* Data & privacy: download everything, or clear what this browser keeps. */
const dataMsg = (text) => { $('.data-msg').textContent = text; };
function renderLocalSummary() {
  const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  $('.local-summary').textContent = `${n(chats.length, 'chat')} and ${n(projects.length, 'project')} are saved in this browser only.`;
}
$('[data-export]').addEventListener('click', async () => {
  dataMsg('Getting your data…');
  try {
    const data = await apiPost('/api/settings', { action: 'export' });
    data.chatsInThisBrowser = chats;
    data.projectsInThisBrowser = projects;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `experiment-ai-data-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    dataMsg('Downloaded (with the chats saved in this browser).');
  } catch (err) {
    dataMsg(err.message);
  }
});
$('[data-clear-local]').addEventListener('click', () => {
  if (!confirm('Clear the chats, projects and preferences saved in this browser? Your account, settings and memory stay.')) return;
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('experimentai.')).forEach((k) => localStorage.removeItem(k));
  } catch {}
  location.replace('/home');
});

/* Keyboard shortcuts (Settings → Shortcuts). */
document.addEventListener('keydown', (e) => {
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (!mod || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === 'o' && e.shiftKey) { e.preventDefault(); $('[data-new-chat]').click(); return; }
  if (e.shiftKey) return;
  if (key === 'j') { e.preventDefault(); setSheet(null); field.focus(); }
  else if (key === 'k') { e.preventDefault(); setSheet(null); if (phone.matches) setSidebar(true); else if (app.classList.contains('side-hidden')) setSidebar(true); setSearch(true); }
  else if (key === 'b') { e.preventDefault(); setSidebar(phone.matches ? !app.classList.contains('side-open') : app.classList.contains('side-hidden')); }
  else if (key === ',') { e.preventDefault(); sheetOpener = document.activeElement; setMenu(false); setSheet('settings'); }
});

// Settings from the server, once signed in (the look-and-feel ones were already applied from this browser).
async function loadSettings(user) {
  try {
    const data = await apiPost('/api/settings', { action: 'get' });
    prefs = { ...DEFAULT_PREFS, ...data.settings };
    avatarUrl = data.avatar || null;
    memories = data.memories || [];
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
  } catch {} // keep what this browser had
  applyPrefs();
  fillPrefControls();
  showProfile(user);
  renderMemories();
  applyModelDefaults();
  renderModel();
  if (!chat.length) resetModes();
}

/* ── Plans pop-up (Upgrade, See plans): the four cards, loaded from /pricing so there's one copy of them.
      Your plan says Current, cheaper ones Change, pricier ones Upgrade. Payments aren't connected yet. ── */
const plansSheet = $('.sheet[data-sheet-name="plans"]');
const plansSlot = $('.plans-slot', plansSheet);
const plansMsg = $('.plans-msg', plansSheet);
let plansReady = null;
function loadPlans() {
  plansReady ??= fetch('/pricing')
    .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.text(); })
    .then((html) => {
      const page = new DOMParser().parseFromString(html, 'text/html');
      const cards = page.querySelector('.plans');
      cards.querySelectorAll('.reveal').forEach((el) => el.classList.remove('reveal'));
      plansSlot.replaceChildren(document.importNode(page.querySelector('.billing'), true), document.importNode(cards, true));
      wirePlans();
    })
    .catch(() => {
      plansReady = null;
      plansSlot.innerHTML = '<p class="sheet-note">Couldn’t load the plans. <a href="/pricing" target="_blank" rel="noopener">See them on the pricing page</a>.</p>';
    });
  return plansReady;
}
function wirePlans() {
  const billingToggle = $('.billing', plansSlot);
  const maxCard = $('[data-max]', plansSlot);
  const tierToggle = $('.max-toggle', maxCard);
  const state = { billing, tier: planKey === 'max-10x' ? '10x' : '5x' };
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const radio = (group, attr, value) => $$('button', group).forEach((b) => b.setAttribute('aria-checked', String(b.dataset[attr] === value)));
  const cardPlan = (card) => (card === maxCard ? `max-${state.tier}` : $('.plan-icon', card).getAttribute('src').match(/(\w+)\.svg$/)[1]);
  // the same motion as /pricing (which uses GSAP; the app uses the browser's own animations)
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (t) => 1 - (1 - t) ** 3;
  const shown = new Map(); // price element → the number on screen
  const countTo = (b, to, animate) => {
    const from = shown.get(b) ?? to;
    shown.set(b, to);
    cancelAnimationFrame(b.countFrame);
    if (!animate || still || from === to) { b.textContent = money(to); return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 700);
      b.textContent = money(from + (to - from) * ease(t));
      if (t < 1) b.countFrame = requestAnimationFrame(step);
    };
    b.countFrame = requestAnimationFrame(step);
    b.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'cubic-bezier(.2,1,.3,1)' });
  };
  // fade out, change, fade back in (the Max icon also shrinks a little on the way out)
  const swap = (el, changed, apply, animate) => {
    if (!changed) return;
    if (!animate || still) { apply(); return; }
    el.getAnimations().forEach((a) => a.cancel());
    const away = el === maxIcon ? 'translateY(-6px) scale(.9)' : 'translateY(-6px)';
    const out = el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: away }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = () => {
      apply();
      el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 400, easing: 'cubic-bezier(.2,1,.3,1)' });
      out.cancel();
    };
  };
  const maxIcon = $('img[data-5x]', maxCard);
  const render = (animate = true) => {
    billingToggle.dataset.billing = state.billing;
    radio(billingToggle, 'billing', state.billing);
    tierToggle.dataset.tier = state.tier;
    radio(tierToggle, 'tier', state.tier);
    const src = maxIcon.dataset[state.tier];
    swap(maxIcon, maxIcon.getAttribute('src') !== src, () => { maxIcon.src = src; }, animate);
    const note = $('.plan-note', maxCard);
    swap(note, note.textContent !== note.dataset[state.tier], () => { note.textContent = note.dataset[state.tier]; }, animate);
    const yearly = state.billing === 'yearly';
    $$('.price b[data-monthly]', plansSlot).forEach((b) => {
      const monthly = Number(b.closest('[data-max]') ? b.dataset[state.tier] : b.dataset.monthly);
      countTo(b, yearly ? monthly * 10 : monthly, animate);
      const unit = b.nextElementSibling;
      const unitText = yearly ? '/ year' : '/ month';
      swap(unit, unit.textContent !== unitText, () => { unit.textContent = unitText; }, animate);
      const sub = $('.price-sub', b.closest('.plan'));
      const subText = yearly ? `$${(monthly * 10 / 12).toFixed(2)} a month, billed yearly` : 'Billed monthly';
      swap(sub, sub.textContent !== subText, () => { sub.textContent = subText; }, animate);
    });
    $$('.plan', plansSlot).forEach((card) => {
      const b = $('[data-auth]', card);
      const diff = PLANS.indexOf(cardPlan(card)) - PLANS.indexOf(planKey);
      // same plan, other billing period: offer the switch (Free has no billing period)
      const current = diff === 0 && (planKey === 'free' || state.billing === billing);
      b.disabled = current || busy;
      b.textContent = current ? 'Current' : diff > 0 ? 'Upgrade' : diff < 0 ? 'Change' : `Switch to ${state.billing}`;
      b.className = `btn btn-lg full ${diff > 0 ? 'btn-dark' : 'btn-ghost'}`;
    });
  };
  // Picking a plan: paid → Stripe checkout in this pop-up (or an instant switch if you already pay);
  // Free → Stripe's billing page, where cancelling happens.
  let busy = false;
  async function choose(card) {
    const target = cardPlan(card);
    plansMsg.textContent = '';
    if (target === 'free') return openBillingPortal(plansMsg);
    busy = true;
    render(false);
    plansMsg.textContent = 'One moment…';
    try {
      const data = await apiPost('/api/checkout', { plan: target, billing: state.billing });
      if (data.changed) {
        plansMsg.textContent = `You’re on ${PLAN_NAMES[data.plan]} now.`;
        return switchToPlan(data.plan);
      }
      await openCheckout(data.publishableKey, data.clientSecret);
      plansMsg.textContent = '';
    } catch (err) {
      plansMsg.textContent = err.message;
    } finally {
      busy = false;
      render(false);
    }
  }
  $$('button', billingToggle).forEach((b) => b.addEventListener('click', () => {
    if (state.billing === b.dataset.billing) return;
    state.billing = b.dataset.billing;
    render();
  }));
  $$('button', tierToggle).forEach((b) => b.addEventListener('click', () => {
    if (state.tier === b.dataset.tier) return;
    state.tier = b.dataset.tier;
    render();
  }));
  $$('[data-auth]', plansSlot).forEach((b) => b.addEventListener('click', () => choose(b.closest('.plan'))));
  // cards rise in one after another each time the pop-up opens, and a soft glow follows the cursor (as on /pricing)
  $$('.plan', plansSlot).forEach((card, i) => {
    card.style.setProperty('--i', i);
    if (still) return;
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--sx', `${e.clientX - r.left}px`);
      card.style.setProperty('--sy', `${e.clientY - r.top}px`);
    });
  });
  render(false);
}
projectsEmpty.addEventListener('click', (e) => {
  if (!e.target.closest('[data-open-plans]')) return;
  sheetOpener = e.target.closest('[data-open-plans]');
  setSheet('plans');
});

/* ── Settings: change your name, or your email (Firebase emails a link to the new address; it changes once clicked) ── */
const usesGoogle = (user) => user.providerData.some((p) => p.providerId === 'google.com');
const EDIT_ERRORS = {
  'auth/invalid-email': 'Enter a valid email.',
  'auth/email-already-in-use': 'That email already has an account.',
  'auth/requires-recent-login': 'For your security, sign out and back in, then try again.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
};

function setEditing(key, on, clearMsg = false) {
  const box = $(`.setting[data-setting="${key}"]`);
  const form = $('.setting-form', box);
  form.hidden = !on;
  $('.setting-row', box).hidden = on;
  if (clearMsg || on) $('.setting-msg', box).textContent = '';
  if (!on) return;
  const input = $('input', form);
  input.value = key === 'name' ? (auth.currentUser.displayName || '').trim() : auth.currentUser.email || '';
  input.focus();
  input.select();
}
$$('[data-edit]').forEach((b) => b.addEventListener('click', () => setEditing(b.dataset.edit, true)));
$$('.setting [data-edit-cancel]').forEach((b) => b.addEventListener('click', () => setEditing(b.closest('.setting').dataset.setting, false)));
$$('.setting-form').forEach((form) => form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const box = form.closest('.setting');
  const key = box.dataset.setting;
  const msg = $('.setting-msg', box);
  const value = $('input', form).value.trim();
  const user = auth.currentUser;
  const save = $('button[type="submit"]', form);
  save.disabled = true;
  try {
    if (key === 'name') {
      if (!value) throw new Error('Enter your name.');
      await updateProfile(user, { displayName: value.slice(0, 60) });
      setEditing('name', false);
      greet(user);
      showProfile(user);
      fillSheets(user);
      msg.textContent = 'Name saved.';
    } else {
      if (!/^\S+@\S+\.\S+$/.test(value)) throw new Error('Enter a valid email.');
      if (value.toLowerCase() === (user.email || '').toLowerCase()) return setEditing('email', false);
      await verifyBeforeUpdateEmail(user, value);
      setEditing('email', false);
      msg.textContent = `We sent a link to ${value}. Click it to finish changing your email.`;
    }
  } catch (err) {
    msg.textContent = EDIT_ERRORS[err.code] || (err.code ? 'Something went wrong. Please try again.' : err.message);
  } finally {
    save.disabled = false;
  }
}));

/* ── Delete account: confirmed by typing DELETE; the server deletes everything, then you're signed out ── */
const deleteSheet = $('.sheet[data-sheet-name="delete"]');
const confirmInput = $('.confirm-field input', deleteSheet);
const confirmDelete = $('[data-confirm-delete]', deleteSheet);
const deleteMsg = $('.delete-msg', deleteSheet);
let deleting = false;
$('[data-delete-account]').addEventListener('click', () => {
  confirmInput.value = '';
  confirmInput.disabled = false;
  confirmDelete.disabled = true;
  deleteMsg.textContent = '';
  setSheet('delete');
  confirmInput.focus();
});
confirmInput.addEventListener('input', () => {
  confirmDelete.disabled = confirmInput.value.trim().toUpperCase() !== 'DELETE';
});
confirmDelete.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user || deleting) return;
  deleting = true;
  confirmDelete.disabled = true;
  confirmInput.disabled = true;
  deleteMsg.textContent = 'Deleting your account…';
  try {
    const res = await fetch('/api/delete-account', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'We couldn’t delete your account. Please try again.');
    // forget what this browser kept for them
    try {
      localStorage.removeItem(`experimentai.projects.${user.uid}`);
      localStorage.removeItem(MODEL_KEY);
      localStorage.removeItem(HIDDEN_KEY);
      localStorage.removeItem(PLAN_KEY);
      localStorage.removeItem(UNLIMITED_KEY);
      localStorage.removeItem(`experimentai.chats.${user.uid}`);
      localStorage.removeItem(PREFS_KEY);
      localStorage.removeItem(SORT_KEY);
    } catch {}
    await signOut(auth).catch(() => {});
    location.replace('/?deleted');
  } catch (err) {
    deleting = false;
    deleteMsg.textContent = `${err.message} If it keeps happening, email contact@experimentai.dev.`;
    confirmInput.disabled = false;
    confirmDelete.disabled = false;
  }
});

/* ── Signed-in only: anyone else goes to the sign-in on the home page ── */
/* ── Access: the app is open only to the accounts below for now; everyone else signed in sees their place in line.
      Emails are stored as SHA-256 hashes so they aren't readable in the page's (public) code. This is a screen, not
      security: once the AI backend exists, it must check access on the server too. ── */
const APP_ACCESS = ['ae3ae4132254ca107278d03a30f1ecdfee4d322a2c29f5415e22677ef4e6485c'];
async function hasAccess(user) {
  if (!user.email) return false;
  const bytes = new TextEncoder().encode(user.email.trim().toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return APP_ACCESS.includes([...digest].map((b) => b.toString(16).padStart(2, '0')).join(''));
}
async function showGate(user) {
  const gate = $('.gate');
  const first = firstName(user);
  $('.gate-name').textContent = first ? `, ${first}` : '';
  $('.gate-email').textContent = user.email || 'you';
  gate.hidden = false;
  app.classList.add('gated');
  app.classList.remove('auth-pending');
  try {
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js');
    const position = (await getDoc(doc(db, 'waitlist', user.uid))).data()?.position;
    if (position) {
      $('.gate-number').textContent = `#${position.toLocaleString()}`;
      $('.gate-place').hidden = false;
    }
  } catch {} // the number is a nice extra; the rest of the page works without it
}
$('[data-gate-signout]').addEventListener('click', async () => {
  await signOut(auth);
  location.replace('/');
});

onAuthStateChanged(auth, async (user) => {
  if (deleting) return; // signing out after a deletion; that redirect is already on its way
  if (!user || !isVerified(user)) return location.replace('/?join');
  if (!(await hasAccess(user))) return showGate(user);
  greet(user);
  showProfile(user);
  fillSheets(user);
  loadProjects(user.uid);
  loadChats(user.uid);
  const openId = new URLSearchParams(location.search).get('c'); // /home?c=… opens that saved chat
  if (openId && chats.some((c) => c.id === openId)) openChat(openId);
  loadSettings(user);
  try {
    const welcome = sessionStorage.getItem('experimentai.welcome');
    sessionStorage.removeItem('experimentai.welcome');
    if (welcome === planKey) note.textContent = `Welcome to ${PLAN_NAMES[planKey]}! Your new models and limits are on.`;
  } catch {}
  if (returningFrom) await finishCheckout(); // may reload with the new plan
  loadUsage(user);
  app.classList.remove('auth-pending');
  if (!phone.matches) field.focus();
});

// Theme (Settings → Appearance): auto = dark blue night sky from 7pm to 6am, your local time; or always day / night.
// First set by the script in <head>.
const themePreview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('theme');
function applyTheme() {
  const hour = new Date().getHours();
  const theme = themePreview || prefs.theme || 'auto';
  const night = theme === 'night' || (theme === 'auto' && (hour >= 19 || hour < 6));
  document.documentElement.classList.toggle('night', night);
  $('meta[name="theme-color"]').content = night ? '#0b1526' : '#3a659b';
}
applyTheme();

// Keep the greeting and the theme right if the page stays open from morning into the night.
setInterval(() => {
  if (auth.currentUser) greet(auth.currentUser);
  applyTheme();
}, 60 * 1000);
