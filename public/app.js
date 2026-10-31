// Experiment AI app (/home): signed-in only. Greeting by time of day, sidebar with chats, search and profile.
// The AI isn't connected yet, so there are no chats to list.
import { auth, db } from './firebase.js';
import {
  onAuthStateChanged, signOut, updateProfile, verifyBeforeUpdateEmail,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = document.body;

// Google already verifies its emails; email + password accounts verify with our code (same rule as the website).
const isVerified = (user) => user.emailVerified || user.providerData.some((p) => p.providerId === 'google.com');

/* ── Greeting: "Good evening, Darren" in the visitor's own time zone ── */
const partOfDay = (h) => (h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Up late');
const firstName = (user) => (user.displayName || '').trim().split(/\s+/)[0] || '';

function greet(user) {
  $('.greet-time').textContent = partOfDay(new Date().getHours());
  const name = firstName(user);
  $('.greet-name').textContent = name;
  $('.greet-name-wrap').hidden = !name;
}

/* ── Profile, pinned to the bottom of the sidebar ── */
function showProfile(user) {
  const name = (user.displayName || '').trim() || user.email?.split('@')[0] || 'You';
  $('.profile-name').textContent = name;
  $('.profile-email').textContent = user.email || '';
  $('.avatar-initial').textContent = name[0].toUpperCase();
  const img = $('.avatar img');
  if (user.photoURL) {
    img.onload = () => { img.hidden = false; };
    img.onerror = () => { img.hidden = true; };
    img.src = user.photoURL;
  }
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
$('[data-signout]').addEventListener('click', async () => {
  await signOut(auth);
  location.replace('/');
});

/* ── Chats: listed newest first and filtered by the search box. Empty until the AI is connected. ── */
const chats = [];
const searchBtn = $('[data-search]');
const searchBox = $('.side-search');
const searchInput = $('#chat-search');

function renderChats() {
  const q = searchInput.value.trim().toLowerCase();
  const shown = chats.filter((c) => !q || c.title.toLowerCase().includes(q));
  $('.chat-list').replaceChildren(...shown.map((c) => {
    const a = document.createElement('a');
    a.href = `/home?c=${encodeURIComponent(c.id)}`;
    a.textContent = c.title;
    return a;
  }));
  $('.chat-empty').hidden = shown.length > 0;
  $('.chat-empty').textContent = chats.length ? 'No chats match your search.' : 'No chats yet. Start one and it’ll show up here.';
}

const setSearch = (open) => {
  searchBox.hidden = !open;
  searchBtn.setAttribute('aria-expanded', String(open));
  if (open) searchInput.focus();
  else { searchInput.value = ''; renderChats(); }
};
searchBtn.addEventListener('click', () => setSearch(searchBox.hidden));
searchInput.addEventListener('input', renderChats);

/* ── Message bar. The AI isn't switched on yet, so sending only says so. ── */
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
// Plans aren't connected yet, so everyone is on Free. On localhost, ?plan=light|pro|max-5x|max-10x previews a plan.
const PLANS = ['free', 'light', 'pro', 'max-5x', 'max-10x'];
const plan = (location.hostname === 'localhost' && new URLSearchParams(location.search).get('plan')) || 'free';
const rank = PLANS.includes(plan) ? PLANS.indexOf(plan) : 2; // an unknown preview value counts as Pro
const paid = rank >= 1; // Light and up: every model, Memory
const hasProjects = rank >= 2; // Pro and up
const modes = { research: false, memory: paid };
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
  modes.memory = paid;
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
const allowedModel = (id) => ALL_MODELS.some((m) => m.id === id && m.minRank <= rank);
const choice = { model: paid ? 'anthropic/claude-sonnet-5.5' : 'anthropic/claude-haiku-5.5', effort: 'Medium' };
try {
  const saved = JSON.parse(localStorage.getItem(MODEL_KEY) || '{}');
  if (allowedModel(saved.model)) choice.model = saved.model;
  if (canUseEffort(saved.effort)) choice.effort = saved.effort;
} catch {}
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
    b.disabled = m.minRank > rank;
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
field.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    composer.requestSubmit();
  }
});
composer.addEventListener('submit', (e) => {
  e.preventDefault();
  stopDictation();
  if (!field.value.trim() && !attached.length) return;
  note.textContent = 'Experiment AI isn’t switched on yet. Your chats will work here soon.';
});

/* ── New chat: back to an empty message bar ── */
$('[data-new-chat]').addEventListener('click', () => {
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
// Monthly or yearly; yearly is 12 months for the price of 10. On localhost, ?billing=yearly previews yearly.
const PLAN_PRICE = { light: 10, pro: 20, 'max-5x': 100, 'max-10x': 200 };
const billing = location.hostname === 'localhost' && new URLSearchParams(location.search).get('billing') === 'yearly' ? 'yearly' : 'monthly';
function billingText() {
  const monthly = PLAN_PRICE[planKey];
  if (!monthly) return ''; // Free has nothing to bill
  return billing === 'yearly'
    ? `Yearly · $${(monthly * 10).toLocaleString('en-US')} a year`
    : `Monthly · $${monthly} a month`;
}

// Usage budgets, shown only as percentages: a week is the plan's monthly price ÷ 4 of AI cost, and a day is that ÷ 7
// (Free counts as $3). Spending isn't tracked until the AI is on; on localhost, ?spent=day,week (in dollars) previews it.
const BUDGET_BASE = { free: 3, light: 10, pro: 20, 'max-5x': 100, 'max-10x': 200 };
const budget = { day: BUDGET_BASE[planKey] / 4 / 7, week: BUDGET_BASE[planKey] / 4 };
const spent = { day: 0, week: 0 };
const spentPreview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('spent');
if (spentPreview) [spent.day, spent.week] = spentPreview.split(',').map((n) => Number(n) || 0);
function renderUsage() {
  for (const period of ['day', 'week']) {
    const box = $(`.usage-bar[data-period="${period}"]`);
    const raw = (spent[period] / budget[period]) * 100;
    const pct = Math.min(100, Math.round(raw));
    $('.usage-pct', box).textContent = pct >= 100 ? 'Limit reached' : raw > 0 && raw < 1 ? '<1% used' : `${pct}% used`;
    const meter = $('.bar', box);
    meter.setAttribute('aria-valuenow', String(pct));
    meter.dataset.level = pct >= 100 ? 'full' : pct >= 80 ? 'high' : '';
    $('i', meter).style.width = `${pct}%`;
  }
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
  $('.usage-limit').textContent = PLAN_USAGE[planKey];
  $$('.set-billing').forEach((el) => {
    el.textContent = billingText();
    el.parentElement.hidden = !billingText();
  });
  $('.yearly-tip').hidden = !PLAN_PRICE[planKey] || billing === 'yearly';
  // nothing to upgrade to from the top plan
  $$('[data-upgrade]').forEach((el) => { el.hidden = planKey === 'max-10x'; });
}
function setSheet(name) {
  if (openSheet) openSheet.hidden = true;
  if (name === 'settings') ['name', 'email'].forEach((key) => setEditing(key, false, true));
  if (name === 'usage') requestAnimationFrame(renderUsage); // bars fill in as the panel opens
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
      b.disabled = diff === 0;
      b.textContent = diff === 0 ? 'Current' : diff > 0 ? 'Upgrade' : 'Change';
      b.className = `btn btn-lg full ${diff > 0 ? 'btn-dark' : 'btn-ghost'}`;
    });
  };
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
  $$('[data-auth]', plansSlot).forEach((b) => b.addEventListener('click', () => {
    plansMsg.textContent = 'Payments aren’t connected yet. Plan changes open at launch.';
  }));
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
  renderChats();
  app.classList.remove('auth-pending');
  if (!phone.matches) field.focus();
});

// Night theme: dark blue from 7pm to 6am, your local time (first set by the script in <head>).
const themePreview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('theme');
function applyTheme() {
  const hour = new Date().getHours();
  const night = themePreview ? themePreview === 'night' : hour >= 19 || hour < 6;
  document.documentElement.classList.toggle('night', night);
  $('meta[name="theme-color"]').content = night ? '#0b1526' : '#3a659b';
}
applyTheme();

// Keep the greeting and the theme right if the page stays open from morning into the night.
setInterval(() => {
  if (auth.currentUser) greet(auth.currentUser);
  applyTheme();
}, 60 * 1000);
