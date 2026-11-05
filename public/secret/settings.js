// Settings window: Account, Billing, Usage, Personalization, Connectors.
// Uses app.js's helpers ($, el, icon, fill, notice, MODELS, BRANDS, prefs …): both are plain scripts on the same page.
// Server side: api/settings.js (profile, picture, export, sign out everywhere), api/usage.js (plan + usage),
// api/checkout.js + api/billing-portal.js (Stripe), api/delete-account.js. Name changes go through Firebase (auth-app.js).

const settingsLayer = $('settings');
const settingsBody = $('settings-body');
const TABS = [
  ['account', 'Account', '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5"/>'],
  ['billing', 'Billing', '<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10h17M7 14.5h3"/>'],
  ['usage', 'Usage', '<path d="M5 20V11M12 20V5M19 20v-6"/>'],
  ['personalization', 'Personalization', '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2a4.2 4.2 0 0 0 4.2-4.2C20.5 6.8 16.7 3.5 12 3.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>'],
  ['connectors', 'Connectors', '<path d="M9 7V4M15 7V4M7 7h10v4a5 5 0 0 1-10 0zM12 16v4"/>'],
];
const PLAN_INFO = {
  free: { name: 'Free', price: 0, note: 'Try it out' },
  light: { name: 'Light', price: 10, note: 'Every model, everyday use' },
  pro: { name: 'Pro', price: 20, note: 'Twice the usage of Light' },
  'max-5x': { name: 'Max 5×', price: 100, note: '5× the usage of Pro' },
  'max-10x': { name: 'Max 10×', price: 200, note: '10× the usage of Pro' },
};

let settingsTab = 'account';
let profile = { avatar: null };   // from api/settings (custom picture)
let usageData = null;             // from api/usage
let usageAt = 0;

/* ── Talking to the server ── */
const signedIn = () => Boolean(window.eaAuth && account);
async function api(path, body = {}) {
  if (!signedIn()) throw new Error('Sign in to use this.');
  const token = await window.eaAuth.token();
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (data.banned) showBanned(data.banned);
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
async function loadUsage(force = false, card = false) {
  if (!force && usageData && Date.now() - usageAt < 30_000) return usageData;
  usageData = await api('/api/usage', card ? { card: true } : {});
  usageAt = Date.now();
  renderPlanLabel();
  return usageData;
}
function renderPlanLabel() {
  if (!usageData) return;
  $('account-plan').textContent = `${PLAN_INFO[usageData.plan]?.name || 'Free'} plan`;
  renderUpgradeLabel();
  // the Usage button under the message bar: today's share of the daily limit
  const u = usageData;
  const pct = u.budgets.day > 0 ? Math.min(100, (u.spent.day / u.budgets.day) * 100) : 0;
  const btn = $('usage-btn');
  btn.hidden = false;
  btn.classList.toggle('warn', pct >= 80 && pct < 100);
  btn.classList.toggle('full', pct >= 100);
  $('usage-label').textContent = u.unlimited ? 'Usage' : `${pct > 0 && pct < 1 ? '<1' : Math.round(pct)}% used today`;
  btn.title = u.unlimited ? 'Usage (no limits on your account)' : `${Math.round(pct)}% of today’s usage. Open Usage`;
}
$('usage-btn').addEventListener('click', () => openSettings('usage'));
// refresh the % after each answer (app.js clears usageData when one finishes)
let usageRefresh = null;
function refreshUsageSoon() {
  clearTimeout(usageRefresh);
  usageRefresh = setTimeout(() => { if (signedIn()) loadUsage(true).catch(() => {}); }, 1500);
}

/* ── Preferences: applied right away, kept in this browser (so the theme is right before the page draws, see
      home.html) and saved to the account ── */
function savePrefs(patch) {
  Object.assign(prefs, patch);
  try { localStorage.setItem('ea.prefs', JSON.stringify(prefs)); } catch {}
  applyPrefs();
  if (signedIn()) api('/api/settings', { action: 'save', settings: patch }).catch((err) => notice(err.message));
}

/* ── Your chats and projects, saved to your account (api/chats.js → Firestore). The browser keeps a copy so the app is
      instant; after sign-in it loads the account's copy and merges, then every change is saved a moment later. ── */
let syncMap = null; // { owner, chats: { id: hash }, projects: { id: hash } }: what your account has, as far as we know
let syncTimer = null;
let syncing = null;
let syncWarned = false;
const hashOf = (o) => {
  const s = JSON.stringify(o);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}.${s.length.toString(36)}`;
};
const readSyncMap = () => { try { return JSON.parse(localStorage.getItem('ea.synced')) || null; } catch { return null; } };
const writeSyncMap = () => { try { localStorage.setItem('ea.synced', JSON.stringify(syncMap)); } catch {} };

async function syncFromAccount() {
  const me = window.eaAuth.uid;
  let known = readSyncMap();
  if (known && known.owner !== me) { // this browser has another account's chats: never mix them into this one
    chats = [];
    projects = [];
    known = null;
  }
  known ||= { chats: {}, projects: {} };
  const remote = { chats: [], projects: [] };
  let after = null;
  do {
    const page = await api('/api/chats', { action: 'all', after });
    remote.chats.push(...page.chats);
    if (page.projects) remote.projects = page.projects;
    after = page.next;
  } while (after);

  syncMap = { owner: me, chats: {}, projects: {} };
  // newer copy wins (the account's on a tie); something only here is kept if it was never saved, and dropped if it
  // was saved before (it was deleted on another device)
  const merge = (local, theirs, key) => {
    const byId = new Map(theirs.map((r) => [r.id, r]));
    const out = [];
    for (const l of local) {
      const r = byId.get(l.id);
      if (r) out.push((r.updatedAt || 0) >= (l.updatedAt || 0) ? r : l);
      else if (!known[key]?.[l.id]) out.push(l);
    }
    for (const r of theirs) if (!local.some((l) => l.id === r.id)) out.push(r);
    for (const r of theirs) syncMap[key][r.id] = hashOf(r);
    return out;
  };
  const openId = currentId;
  chats = merge(chats, remote.chats, 'chats');
  projects = merge(projects, remote.projects, 'projects');
  save('ea.chats', chats);
  save('ea.projects', projects);
  writeSyncMap();

  // show what came in
  seenChats = null;
  if (openId && !current()) goHome();
  else if (openId && !replying) openChat(openId);
  else renderSidebar();
  renderChips();
  if (projectsOpen()) renderProjects();
  queueSync(); // upload what's only here
}

function queueSync() {
  if (!syncMap) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(flushSync, 800);
}
// Save every changed chat and project, delete the deleted ones. Returns true when your account is up to date.
async function flushSync() {
  clearTimeout(syncTimer);
  if (!syncMap || !signedIn()) return false;
  while (syncing) await syncing.catch(() => {});
  syncing = (async () => {
    for (const c of [...chats]) {
      const h = hashOf(c);
      if (syncMap.chats[c.id] === h) continue;
      await api('/api/chats', { action: 'save', chat: c });
      syncMap.chats[c.id] = h;
    }
    for (const id of Object.keys(syncMap.chats)) {
      if (chats.some((c) => c.id === id)) continue;
      await api('/api/chats', { action: 'delete', id });
      delete syncMap.chats[id];
    }
    for (const p of [...projects]) {
      const h = hashOf(p);
      if (syncMap.projects[p.id] === h) continue;
      await api('/api/chats', { action: 'project-save', project: p });
      syncMap.projects[p.id] = h;
    }
    for (const id of Object.keys(syncMap.projects)) {
      if (projects.some((p) => p.id === id)) continue;
      await api('/api/chats', { action: 'project-delete', id });
      delete syncMap.projects[id];
    }
  })();
  try {
    await syncing;
    syncWarned = false;
    return true;
  } catch (err) {
    if (!syncWarned) { syncWarned = true; notice(`Couldn’t save to your account: ${err.message}`); }
    syncTimer = setTimeout(flushSync, 15_000); // try again in a bit
    return false;
  } finally {
    syncing = null;
    writeSyncMap();
  }
}
// leaving the page with changes still waiting: save them now
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && syncTimer) flushSync(); });

/* ── Once sign-in is known (called from app.js's setAccount) ── */
async function afterSignIn() {
  if (!signedIn()) return;
  syncFromAccount().then(() => pollVideos()).catch((err) => notice(`Couldn’t load your chats: ${err.message}`));
  try {
    const got = await api('/api/settings', { action: 'get' });
    const synced = {};
    for (const k of Object.keys(PREF_DEFAULTS)) if (got.settings?.[k] !== undefined) synced[k] = got.settings[k];
    Object.assign(prefs, synced);
    try { localStorage.setItem('ea.prefs', JSON.stringify(prefs)); } catch {}
    applyPrefs();
    profile.avatar = got.avatar || null;
    if (got.isAdmin && !isAdminUser) { isAdminUser = true; buildTabs(); }
    showAvatar();
  } catch {}
  loadUsage().catch(() => {});
  // back from connecting a tool: /home?connected=notion or /home?connect_error=…
  const q = new URLSearchParams(location.search);
  if (q.has('connected') || q.has('connect_error')) {
    history.replaceState(null, '', '/home');
    const tool = CONNECTORS.find((c) => c.id === q.get('connected'));
    notice(tool ? `${tool.name} connected` : q.get('connect_error') || 'That tool wasn’t connected.');
    openSettings('connectors');
  }
  // back from Stripe Checkout: /home?checkout=cs_…
  const id = q.get('checkout');
  if (id) {
    history.replaceState(null, '', '/home');
    try {
      const { status, plan } = await api('/api/checkout-status', { sessionId: id });
      if (status === 'complete') {
        await loadUsage(true);
        if (plan) celebrate(plan); // the upgrade animation
        else notice('Payment received. Your plan will switch on in a moment.');
      } else notice('Checkout wasn’t finished, so nothing was charged.');
    } catch (err) { notice(err.message); }
  }
}
// sidebar picture: your own upload, else your Google photo, else the potion
function showAvatar() {
  const pfp = $('account-pfp');
  const src = profile.avatar || account?.photo || '/assets/potion-orb-icon-pfp.png';
  if (pfp.getAttribute('src') !== src) pfp.src = src;
}
const avatarSrc = () => profile.avatar || account?.photo || '/assets/potion-orb-icon-pfp.png';

/* ── Open / close ── */
const settingsOpen = () => isShown(settingsLayer);
function openSettings(tab = 'account') {
  closeAccount();
  closeMenu();
  closeModelMenu();
  showPop(settingsLayer);
  showTab(tab);
  if (phone.matches) setSidebar(false);
}
function closeSettings() {
  hidePop(settingsLayer);
}
$('settings-close').addEventListener('click', closeSettings);
settingsLayer.addEventListener('pointerdown', (e) => { if (e.target === settingsLayer) closeSettings(); });

function svgIcon(paths) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = paths;
  return svg;
}
// the Admin tab only appears for admins (api/settings.js 'get' says isAdmin)
let isAdminUser = false;
const ADMIN_TAB = ['admin', 'Admin', '<path d="M12 3.5 5 6.5v5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9v-5z"/><path d="m9 12 2 2 4-4"/>'];
const visibleTabs = () => (isAdminUser ? [...TABS, ADMIN_TAB] : TABS);
function buildTabs() {
  fill($('settings-tabs'), visibleTabs().map(([key, label, paths]) => el('button', {
    type: 'button', class: `settings-tab${key === 'admin' ? ' tab-admin' : ''}`, role: 'tab', id: `tab-${key}`, 'aria-controls': 'settings-body', onclick: () => showTab(key),
  }, svgIcon(paths), label)));
}
buildTabs();

function showTab(tab) {
  settingsTab = tab;
  document.querySelectorAll('.settings-tab').forEach((b) => {
    const on = b.id === `tab-${tab}`;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && phone.matches) b.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
  settingsBody.setAttribute('aria-labelledby', `tab-${tab}`);
  ({ account: renderAccount, billing: renderBilling, usage: renderUsage, personalization: renderPersonal, connectors: renderConnectors, admin: () => renderAdmin() })[tab]();
  settingsBody.scrollTop = 0;
  replay(settingsBody, 'view-in');
}
// arrow keys move between tabs
$('settings-tabs').addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const tabs = visibleTabs();
  const i = tabs.findIndex(([k]) => k === settingsTab);
  const next = tabs[(i + (e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length][0];
  showTab(next);
  $(`tab-${next}`).focus();
});

/* ── Building blocks ── */
const head = (title, sub) => el('div', { class: 'set-head' }, el('h3', {}, title), sub && el('p', {}, sub));
const group = (label, ...rows) => [label && el('h4', { class: 'set-label' }, label), el('div', { class: 'set-group' }, rows)];
const row = (title, desc, ...controls) => el('div', { class: 'set-row' },
  el('div', { class: 'grow' }, el('strong', {}, title), desc && el('small', {}, desc)), controls);
const button = (label, onclick, cls = 'btn btn-ghost btn-sm') => el('button', { type: 'button', class: cls, onclick }, label);
function seg(label, options, value, onPick) {
  const at = Math.max(0, options.findIndex(([v]) => v === value));
  const box = el('div', { class: 'effort-seg seg', role: 'radiogroup', 'aria-label': label, style: `--n:${options.length};--i:${at}` });
  fill(box, options.map(([v, text], j) => el('button', {
    type: 'button', class: 'effort-opt', role: 'radio', 'aria-checked': String(j === at),
    onclick: () => {
      box.style.setProperty('--i', j);
      box.querySelectorAll('.effort-opt').forEach((b, k) => b.setAttribute('aria-checked', String(k === j)));
      onPick(v);
    },
  }, text)));
  return box;
}
const toggle = (label, checked, onChange) => el('input', {
  type: 'checkbox', class: 'toggle', role: 'switch', 'aria-label': label, checked, onchange: (e) => onChange(e.target.checked),
});
const loading = () => el('p', { class: 'set-loading' }, el('span', { class: 'spinner' }), 'Loading…');
const failed = (err, retry) => el('div', { class: 'set-empty' }, el('p', {}, err.message), retry && button('Try again', retry));
// buttons that call the server: disabled and "…" while it runs
async function busy(btn, work) {
  if (btn.disabled) return;
  const text = btn.textContent;
  btn.disabled = true;
  btn.textContent = '…';
  try { await work(); } catch (err) { notice(err.message); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = text; } }
}
const fmtDate = (sec) => new Date(sec * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/* ───────── Account ───────── */
function renderAccount() {
  if (!signedIn()) {
    fill(settingsBody, head('Account'), el('div', { class: 'set-empty' }, el('p', {}, 'This is a preview, so there’s no account here. Sign in on secret.experimentai.dev to manage yours.')));
    return;
  }
  const picker = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true, onchange: (e) => changeAvatar(e) });
  const name = el('input', { class: 'field', id: 'set-name', maxlength: '60', value: account.name, autocomplete: 'name' });
  const saveName = el('button', { type: 'submit', class: 'btn btn-sm' }, 'Save');
  const google = account.providers?.includes('google.com');

  fill(settingsBody,
    head('Account', 'Your name, picture and account.'),
    group('Profile',
      el('div', { class: 'set-row' },
        el('img', { class: 'avatar avatar-lg', src: avatarSrc(), alt: '', width: '64', height: '64', referrerpolicy: 'no-referrer' }),
        el('div', { class: 'grow' }, el('strong', {}, 'Profile picture'), el('small', {}, profile.avatar ? 'Your own picture.' : google && account.photo ? 'From your Google account.' : 'PNG, JPEG or WebP.')),
        button(profile.avatar ? 'Change' : 'Upload', () => picker.click()),
        profile.avatar && button('Remove', (e) => busy(e.currentTarget, async () => {
          profile.avatar = (await api('/api/settings', { action: 'avatar', image: null })).avatar;
          showAvatar();
          renderAccount();
        })),
        picker),
      el('form', {
        class: 'set-row set-row-field',
        onsubmit: (e) => {
          e.preventDefault();
          const n = norm(name.value);
          if (!n) { name.focus(); return; }
          if (n === account.name) return;
          busy(saveName, async () => {
            await window.eaAuth.updateName(n);
            account.name = n;
            $('account-name').textContent = n;
            notice('Name saved');
          });
        },
      },
        el('label', { class: 'grow', for: 'set-name' }, el('strong', {}, 'Name'), el('small', {}, 'Shown in the sidebar.')),
        name, saveName),
      row('Email', account.email, google && el('span', { class: 'badge' }, 'Google')),
    ),
    group('Sign in',
      row('Log out', 'Sign out on this device.', button('Log out', () => logOut())),
      row('Log out of all devices', 'Signs you out everywhere, including here.', button('Log out everywhere', (e) => busy(e.currentTarget, async () => {
        if (!confirm('Log out of Experiment AI on every device?')) return;
        await api('/api/settings', { action: 'signout-all' });
        await logOut();
      }))),
    ),
    group('Your data',
      row('Export your data', 'Download your account, settings, plan, usage, chats and projects as a JSON file.', button('Export', (e) => busy(e.currentTarget, exportData))),
    ),
    group('Danger zone',
      el('div', { class: 'set-row' },
        el('div', { class: 'grow' }, el('strong', {}, 'Delete account'), el('small', {}, 'Deletes your account, settings, usage and saved chats for good. A paid plan is cancelled right away.')),
        button('Delete account', (e) => busy(e.currentTarget, deleteAccount), 'btn btn-sm btn-red')),
    ),
  );
}

// Your chats are in your account, so this browser's copy is cleared on log out (once everything's saved)
async function logOut() {
  let saved = false;
  try { saved = await flushSync(); } catch {}
  if (saved) { try { ['ea.chats', 'ea.projects', 'ea.synced'].forEach((k) => localStorage.removeItem(k)); } catch {} }
  try { await window.eaAuth.signOut(); } finally { location.replace('/'); }
}

// crop to a centred square, 256×256 JPEG
async function changeAvatar(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 15 * 1048576) { notice('That picture is too big. Try one under 15 MB.'); return; }
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    URL.revokeObjectURL(url);
    profile.avatar = (await api('/api/settings', { action: 'avatar', image: c.toDataURL('image/jpeg', 0.86) })).avatar;
    showAvatar();
    if (settingsTab === 'account') renderAccount();
    notice('Picture updated');
  } catch (err) {
    notice(err?.message || 'That picture couldn’t be read. Try a JPEG or PNG.');
  }
}

async function exportData() {
  await flushSync(); // make sure the newest changes are in your account first
  const data = await api('/api/settings', { action: 'export' });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  el('a', { href: url, download: 'experiment-ai-data.json' }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function deleteAccount() {
  if (!confirm('Delete your Experiment AI account? Your settings, usage and saved chats are deleted for good, and a paid plan is cancelled right away.')) return;
  if ((prompt('To confirm, type DELETE') || '').trim().toUpperCase() !== 'DELETE') { notice('Account not deleted.'); return; }
  await api('/api/delete-account');
  try { Object.keys(localStorage).filter((k) => k.startsWith('ea.')).forEach((k) => localStorage.removeItem(k)); } catch {}
  await logOut();
}

/* ───────── Billing (plan and payments only; usage has its own tab) ───────── */
const PAID_ORDER = ['light', 'pro', 'max-5x', 'max-10x'];
const PLAN_POINTS = {
  light: ['Every chat model', 'High effort and Memory', 'Videos with Veo and Grok'],
  pro: ['Everything in Light', '2× the usage of Light', 'Bigger daily and weekly limits'],
  'max-5x': ['Everything in Pro', '5× the usage of Pro', 'For heavy, everyday use'],
  'max-10x': ['Everything in Pro', '10× the usage of Pro', 'The most Experiment AI can do'],
};
const daysLeft = (sec) => Math.max(0, Math.ceil((sec * 1000 - Date.now()) / 86_400_000));
const currentPlan = () => (PLAN_INFO[usageData?.plan] ? usageData.plan : 'free');
const planButtonLabel = () => (currentPlan() === 'max-10x' ? 'Change plan' : 'Upgrade plan');
// the account menu's item says the same as the Billing button
function renderUpgradeLabel() {
  const item = $('upgrade-item-label');
  if (item) item.textContent = planButtonLabel();
}

// The card you pay with: "Visa •••• 4242 · Expires 08/28" (or Link, Apple Pay…)
const CARD_NAMES = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay', diners: 'Diners Club', link: 'Link', cartes_bancaires: 'Cartes Bancaires' };
const WALLETS = { apple_pay: 'Apple Pay', google_pay: 'Google Pay', samsung_pay: 'Samsung Pay', link: 'Link' };
function payCard(c) {
  const name = CARD_NAMES[c.brand] || (c.brand ? c.brand[0].toUpperCase() + c.brand.slice(1).replace(/_/g, ' ') : 'Card');
  const expired = c.expYear && new Date(c.expYear, c.expMonth) <= new Date();
  return el('div', { class: `pay-card${expired ? ' expired' : ''}` },
    el('span', { class: `card-art card-${c.brand || 'card'}`, 'aria-hidden': 'true' }, c.brand === 'link' ? 'L' : name.slice(0, 4).toUpperCase()),
    el('div', { class: 'grow' },
      el('strong', {}, c.last4 ? `${name} •••• ${c.last4}` : c.email ? `${name} · ${c.email}` : name,
        c.wallet && el('span', { class: 'pay-wallet' }, ` · ${WALLETS[c.wallet] || c.wallet}`)),
      c.expMonth && el('small', {}, expired ? `Expired ${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}. Update it in Manage billing.` : `Expires ${String(c.expMonth).padStart(2, '0')}/${String(c.expYear).slice(-2)}`)));
}

async function renderBilling() {
  fill(settingsBody, head('Billing', 'Your plan and payments.'), loading());
  if (!signedIn()) { fill(settingsBody, head('Billing'), el('div', { class: 'set-empty' }, el('p', {}, 'Sign in to see your plan.'))); return; }
  let u;
  try { u = await loadUsage(true, true); } catch (err) { if (settingsTab === 'billing') fill(settingsBody, head('Billing'), failed(err, renderBilling)); return; }
  if (settingsTab !== 'billing') return;

  const plan = currentPlan();
  const info = PLAN_INFO[plan];
  const b = u.billing;
  const yearly = b?.billing === 'yearly';
  const cancelled = plan !== 'free' && b?.cancelAtPeriodEnd && b?.periodEnd;
  let status = 'No payment needed.';
  if (plan !== 'free' && b) {
    if (b.status === 'past_due') status = 'Your last payment didn’t go through. Update your card in Manage billing.';
    else if (cancelled) {
      const d = daysLeft(b.periodEnd);
      status = `You can keep using ${info.name} until ${fmtDate(b.periodEnd)} (${d === 0 ? 'last day' : `${d} day${d === 1 ? '' : 's'} left`}). After that you’re on Free.`;
    } else if (b.periodEnd) status = `Renews on ${fmtDate(b.periodEnd)}.`;
  } else if (b?.status === 'unpaid' || b?.status === 'canceled') status = 'Your paid plan has ended.';

  const priceText = plan === 'free' ? '$0' : yearly ? `$${info.price * 10}` : `$${info.price}`;
  const per = plan === 'free' ? 'forever' : yearly ? 'per year' : 'per month';

  fill(settingsBody,
    head('Billing', 'Your plan and payments.'),
    el('div', { class: `plan-card${cancelled ? ' cancelled' : ''}` },
      el('div', { class: 'plan-card-top' },
        el('img', { class: 'plan-card-icon', src: `/assets/plans/${plan}.svg`, alt: '', width: '48', height: '48' }),
        el('div', { class: 'grow' },
          el('small', {}, cancelled ? 'Cancelled plan' : 'Current plan'),
          el('div', { class: 'plan-name' }, info.name,
            cancelled && el('span', { class: 'badge badge-red' }, 'Cancelled'),
            u.unlimited && el('span', { class: 'badge badge-gold' }, 'Unlimited'))),
        el('div', { class: 'plan-amount' }, el('strong', {}, priceText), el('small', {}, per))),
      el('p', { class: 'plan-status' }, status),
      b?.card && payCard(b.card),
      el('div', { class: 'plan-actions' },
        cancelled && button('Keep my plan', (e) => busy(e.currentTarget, async () => {
          const r = await api('/api/checkout', { plan, billing: b.billing || 'monthly' }); // un-cancels it
          if (r.changed) { notice(`You’re keeping ${info.name}`); await loadUsage(true); renderBilling(); }
        }), 'btn btn-sm'),
        b?.canManage && button('Manage billing', (e) => busy(e.currentTarget, async () => {
          location.href = (await api('/api/billing-portal')).url;
        }), cancelled ? 'btn btn-ghost btn-sm' : 'btn btn-sm')),
      b?.canManage && el('small', { class: 'plan-foot' }, 'Change your card, see invoices or cancel in Stripe.')),
    el('button', { type: 'button', class: 'btn upgrade-big', onclick: () => openPlans() },
      el('img', { src: '/assets/plans/max-10x.svg', alt: '', width: '22', height: '22' }), planButtonLabel()),
    el('p', { class: 'set-note' }, plan === 'free'
      ? 'Light, Pro and Max add every model, Memory, videos and more usage.'
      : cancelled
        ? 'Changed your mind? Keep my plan turns it back on, and nothing changes.'
        : 'To go back to Free, cancel in Manage billing. You keep your plan until the end of what you’ve paid for.'),
  );
}

/* ── The plans pop-up: 4 cards; yours says Current, ones above say Upgrade, ones below say Change ── */
const plansLayer = $('plans');
const plansBody = $('plans-body');
let plansCycle = null;
const plansOpen = () => isShown(plansLayer);
async function openPlans() {
  closeAccount();
  closeMenu();
  if (!signedIn()) { notice('Sign in to change your plan.'); return; }
  showPop(plansLayer);
  fill(plansBody, loading());
  try { await loadUsage(); } catch (err) { fill(plansBody, failed(err, openPlans)); return; }
  plansCycle = usageData.billing?.billing || plansCycle || 'monthly';
  renderPlans();
}
function closePlans() {
  closeCheckout();
  hidePop(plansLayer);
}
$('plans-close').addEventListener('click', closePlans);
document.querySelectorAll('[data-plans]').forEach((b) => b.addEventListener('click', () => openPlans())); // account menu
plansLayer.addEventListener('pointerdown', (e) => { if (e.target === plansLayer) closePlans(); });

function renderPlans() {
  closeCheckout();
  const plan = currentPlan();
  const b = usageData.billing;
  const cancelled = plan !== 'free' && b?.cancelAtPeriodEnd;
  const rankOf = (p) => PAID_ORDER.indexOf(p); // free = -1
  $('plans-title').textContent = plan === 'max-10x' ? 'Change your plan' : 'Upgrade your plan';
  fill(plansBody,
    el('div', { class: 'plans-cycle' },
      seg('Billing period', [['monthly', 'Monthly'], ['yearly', 'Yearly · 2 months free']], plansCycle, (v) => { plansCycle = v; renderPlans(); })),
    el('div', { class: 'plans-grid' }, PAID_ORDER.map((p, i) => {
      const pi = PLAN_INFO[p];
      const isCurrent = p === plan && (b?.billing || 'monthly') === plansCycle;
      const up = rankOf(p) > rankOf(plan);
      const price = plansCycle === 'yearly' ? pi.price * 10 : pi.price;
      let action;
      if (isCurrent && cancelled) action = el('button', { type: 'button', class: 'btn plan-go', onclick: (e) => busy(e.currentTarget, () => goPlan(p, plan)) }, 'Keep plan');
      else if (isCurrent) action = el('button', { type: 'button', class: 'btn btn-ghost plan-go', disabled: true }, 'Current');
      else action = el('button', { type: 'button', class: `btn plan-go${up ? '' : ' btn-ghost'}`, onclick: (e) => busy(e.currentTarget, () => goPlan(p, plan)) }, up ? 'Upgrade' : 'Change');
      return el('div', { class: `plan-tile${isCurrent ? ' current' : ''}${p === 'pro' && plan === 'free' ? ' popular' : ''}`, style: `--d:${i * 50}ms` },
        isCurrent && el('span', { class: 'plan-tag' }, cancelled ? 'Current · cancelled' : 'Current'),
        !isCurrent && p === 'pro' && plan === 'free' && el('span', { class: 'plan-tag plan-tag-gold' }, 'Most popular'),
        el('img', { class: 'plan-tile-icon', src: `/assets/plans/${p}.svg`, alt: '', width: '44', height: '44' }),
        el('h4', {}, pi.name),
        el('div', { class: 'plan-tile-price' }, el('strong', {}, `$${price}`), el('span', {}, plansCycle === 'yearly' ? '/year' : '/month')),
        el('ul', {}, PLAN_POINTS[p].map((t) => el('li', {}, icon('check'), t))),
        action);
    })),
    el('p', { class: 'plans-foot' }, plan === 'free'
      ? 'Payments are handled securely by Stripe. Cancel anytime in Settings › Billing.'
      : 'Switching charges or credits the difference right away. Cancel anytime in Settings › Billing.'),
  );
}

// Upgrade/Change: no subscription yet → Stripe checkout right here; already subscribed → switched at once
async function goPlan(p, from) {
  const r = await api('/api/checkout', { plan: p, billing: plansCycle });
  if (r.changed) {
    await loadUsage(true);
    if (PAID_ORDER.indexOf(r.plan || p) > PAID_ORDER.indexOf(from)) { closePlans(); celebrate(r.plan || p); }
    else { notice(`You’re on ${PLAN_INFO[r.plan || p]?.name || p} now`); closePlans(); }
    if (settingsOpen() && settingsTab === 'billing') renderBilling();
    return;
  }
  await openCheckout(r.clientSecret, r.publishableKey, PLAN_INFO[p].name);
}

// Stripe's embedded checkout, inside the plans pop-up
let stripeJs = null;
let embedded = null;
function loadStripe() {
  stripeJs ||= new Promise((ok, bad) => {
    const s = el('script', { src: 'https://js.stripe.com/v3/' });
    s.onload = () => ok(window.Stripe);
    s.onerror = () => { stripeJs = null; bad(new Error('Couldn’t load the payment form. Check your connection and try again.')); };
    document.head.append(s);
  });
  return stripeJs;
}
async function openCheckout(secret, key, planName) {
  const Stripe = await loadStripe();
  const box = el('div', { class: 'checkout', id: 'checkout' });
  $('plans-title').textContent = `Upgrade to ${planName}`;
  fill(plansBody,
    el('button', { type: 'button', class: 'back', onclick: () => renderPlans() }, icon('back'), 'All plans'),
    box);
  embedded = await Stripe(key).initEmbeddedCheckout({ fetchClientSecret: async () => secret });
  if (box.isConnected) embedded.mount(box);
  else closeCheckout();
}
function closeCheckout() {
  if (!embedded) return;
  try { embedded.destroy(); } catch {}
  embedded = null;
}

/* ── The upgrade moment: the new plan's potion rises in a burst of light ── */
function celebrate(plan) {
  const info = PLAN_INFO[plan];
  if (!info) return;
  const layer = el('div', { class: 'celebrate', role: 'status', 'aria-live': 'polite' },
    el('div', { class: 'celebrate-card' },
      el('div', { class: 'celebrate-burst', 'aria-hidden': 'true' },
        Array.from({ length: 14 }, (_, i) => el('i', { style: `--a:${i * (360 / 14)}deg;--r:${90 + (i % 3) * 28}px;--t:${(i % 4) * 60}ms` }))),
      el('div', { class: 'celebrate-ring', 'aria-hidden': 'true' }),
      el('img', { class: 'celebrate-icon', src: `/assets/plans/${plan}.svg`, alt: '' }),
      el('p', { class: 'celebrate-kicker' }, 'Upgrade complete'),
      el('h2', {}, 'Welcome to ', el('span', { class: 'serif' }, info.name)),
      el('p', { class: 'celebrate-note' }, `${PLAN_POINTS[plan][1]}. Enjoy!`),
      el('button', { type: 'button', class: 'btn', onclick: () => done() }, 'Let’s go')));
  const done = () => { layer.classList.add('closing'); setTimeout(() => layer.remove(), 260); };
  layer.addEventListener('pointerdown', (e) => { if (e.target === layer) done(); });
  document.body.append(layer);
  layer.querySelector('.btn').focus();
}

/* ───────── Usage ───────── */
async function renderUsage() {
  fill(settingsBody, head('Usage', 'How much of your plan you’ve used.'), loading());
  if (!signedIn()) { fill(settingsBody, head('Usage'), el('div', { class: 'set-empty' }, el('p', {}, 'Sign in to see your usage.'))); return; }
  let u;
  try { u = await loadUsage(true); } catch (err) { if (settingsTab === 'usage') fill(settingsBody, head('Usage'), failed(err, renderUsage)); return; }
  if (settingsTab !== 'usage') return;

  const pct = (spent, budget) => (budget > 0 ? Math.min(100, (spent / budget) * 100) : 0);
  const show = (p) => (p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`);
  const now = new Date();
  const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const nextWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + (((8 - now.getUTCDay()) % 7) || 7)));
  const time = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = (d) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  const meter = (title, p, reset) => el('div', { class: 'meter' },
    el('div', { class: 'meter-top' }, el('strong', {}, title), el('span', { class: 'meter-pct' }, `${show(p)} used`)),
    el('div', { class: `bar${p >= 100 ? ' full' : p >= 80 ? ' warn' : ''}`, role: 'progressbar', 'aria-label': title, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p)) },
      el('i', { style: `--p:${p}%` })),
    el('small', {}, reset));

  const dayP = pct(u.spent.day, u.budgets.day);
  const weekP = pct(u.spent.week, u.budgets.week);
  const byKey = new Map(MODELS.map((m) => [m.id.replace(/[./]/g, '_'), m]));
  const perModel = Object.entries(u.spent.models || {})
    .map(([k, cost]) => ({ m: byKey.get(k), p: pct(cost, u.budgets.week), k }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p);

  const bars = el('div', { class: 'set-group meters' },
    meter('Today', dayP, `Resets at ${time(nextDay)}`),
    meter('This week', weekP, `Resets ${day(nextWeek)} at ${time(nextWeek)}`));
  fill(settingsBody,
    head('Usage', 'How much of your plan you’ve used.'),
    u.unlimited && el('p', { class: 'set-note set-note-gold' }, 'Your account has no limits. Usage is still counted here.'),
    el('h4', { class: 'set-label' }, `${PLAN_INFO[u.plan]?.name || 'Free'} plan`),
    bars,
    el('h4', { class: 'set-label' }, 'This week by model'),
    perModel.length
      ? el('div', { class: 'set-group' }, perModel.map(({ m, p, k }) => el('div', { class: 'set-row model-use' },
          m ? el('img', { src: BRANDS[m.brand].logo, alt: '', width: '18', height: '18' }) : el('span', { class: 'dot' }),
          el('div', { class: 'grow' },
            el('div', { class: 'meter-top' }, el('strong', {}, m ? m.name : k), el('span', { class: 'meter-pct' }, show(p))),
            el('div', { class: 'bar bar-thin' }, el('i', { style: `--p:${p}%` }))))))
      : el('div', { class: 'set-group' }, el('p', { class: 'set-empty-row' }, 'Nothing used yet this week.')),
    !u.unlimited && u.plan !== 'max-10x' && el('div', { class: 'set-upsell' },
      el('span', {}, 'Need more room?'),
      button(u.plan === 'free' ? 'Upgrade' : 'See plans', () => openPlans(), 'btn btn-sm')),
  );
  // let the bars grow in
  requestAnimationFrame(() => settingsBody.querySelectorAll('.bar').forEach((b) => b.classList.add('grown')));
}

/* ───────── Personalization ───────── */
function renderPersonal() {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const nick = el('input', { class: 'field', id: 'set-nick', maxlength: '40', value: prefs.nickname, placeholder: account?.name || 'e.g. Sam' });
  const lang = el('input', { class: 'field', id: 'set-lang', maxlength: '40', value: prefs.language, placeholder: 'Same as mine' });
  const about = el('textarea', { class: 'field', id: 'set-about', rows: '3', maxlength: '1500', placeholder: 'e.g. I’m a student who loves robotics.' });
  about.value = prefs.about;
  const how = el('textarea', { class: 'field', id: 'set-how', rows: '3', maxlength: '3000', placeholder: 'e.g. Explain things simply and give examples.' });
  how.value = prefs.instructions;
  const style = el('select', { class: 'field', id: 'set-style' },
    [['balanced', 'Balanced'], ['concise', 'Short and to the point'], ['detailed', 'Detailed'], ['friendly', 'Friendly'], ['formal', 'Formal']]
      .map(([v, t]) => el('option', { value: v, selected: v === prefs.style }, t)));
  const save = el('button', { type: 'submit', class: 'btn btn-sm' }, 'Save');
  const memoryBox = el('div', { class: 'set-group' }, el('p', { class: 'set-empty-row' }, signedIn() ? 'Loading…' : 'Sign in to see what Experiment AI remembers.'));
  if (signedIn()) loadMemories(memoryBox);

  fill(settingsBody,
    head('Personalization', 'How Experiment AI looks and talks to you.'),
    group('Appearance',
      row('Theme', 'Dark is a deep night-sky blue.',
        seg('Theme', [['day', 'Light'], ['night', 'Dark'], ['auto', 'System']], prefs.theme, (v) => savePrefs({ theme: v }))),
      row('Text size', 'For the whole app.',
        seg('Text size', [['small', 'S'], ['default', 'M'], ['large', 'L'], ['xlarge', 'XL']], prefs.textSize, (v) => savePrefs({ textSize: v }))),
      row('Reduce motion', 'Turn off sliding and shimmering effects.',
        toggle('Reduce motion', prefs.reduceMotion, (v) => savePrefs({ reduceMotion: v }))),
    ),
    group('Chat',
      row('Send messages with', prefs.sendKey === 'enter' ? 'Shift + Enter adds a new line.' : 'Enter adds a new line.',
        seg('Send key', [['enter', 'Enter'], ['mod-enter', mac ? '⌘ Enter' : 'Ctrl Enter']], prefs.sendKey, (v) => { savePrefs({ sendKey: v }); renderPersonal(); })),
      row('Creative greetings', 'A different greeting on the home screen each time.',
        toggle('Creative greetings', prefs.greetings, (v) => { savePrefs({ greetings: v }); if (!currentId) newGreeting(); })),
    ),
    el('h4', { class: 'set-label' }, 'Memory'),
    memoryBox,
    el('h4', { class: 'set-label' }, 'About you'),
    el('form', {
      class: 'set-group set-form',
      onsubmit: (e) => {
        e.preventDefault();
        busy(save, async () => {
          const patch = { nickname: nick.value.trim(), language: lang.value.trim(), about: about.value.trim(), instructions: how.value.trim(), style: style.value };
          Object.assign(prefs, patch);
          try { localStorage.setItem('ea.prefs', JSON.stringify(prefs)); } catch {}
          if (signedIn()) await api('/api/settings', { action: 'save', settings: patch });
          notice('Saved');
        });
      },
    },
      el('div', { class: 'two' },
        el('label', {}, el('span', { class: 'field-label' }, 'What should Experiment AI call you?'), nick),
        el('label', {}, el('span', { class: 'field-label' }, 'Reply language'), lang)),
      el('label', {}, el('span', { class: 'field-label' }, 'Response style'), style),
      el('label', {}, el('span', { class: 'field-label' }, 'Anything Experiment AI should know about you?'), about),
      el('label', {}, el('span', { class: 'field-label' }, 'How should Experiment AI respond?'), how),
      el('div', { class: 'form-actions' }, save)),
  );
}

let connectorsAt = 0;
async function loadConnectors(force = false) {
  if (!force && connectorList && Date.now() - connectorsAt < 60_000) return connectorList;
  connectorList = (await api('/api/connectors', { action: 'list' })).connectors;
  connectorsAt = Date.now();
  renderChips(); // drop chips for tools that aren't connected any more
  return connectorList;
}

// Google Drive picker: the files picked become readable by Experiment AI (drive.file) and are attached to the message
let gapiReady = null;
function loadPicker() {
  gapiReady ||= new Promise((ok, bad) => {
    const s = el('script', { src: 'https://apis.google.com/js/api.js' });
    s.onload = () => window.gapi.load('picker', { callback: ok, onerror: () => bad(new Error('Couldn’t open Google Drive.')) });
    s.onerror = () => { gapiReady = null; bad(new Error('Couldn’t open Google Drive. Check your connection.')); };
    document.head.append(s);
  });
  return gapiReady;
}
async function pickDrive() {
  closeMenu();
  try {
    const [{ token, key, appId }] = await Promise.all([api('/api/connectors', { action: 'picker', tool: 'google' }), loadPicker()]);
    const P = window.google.picker;
    const view = new P.DocsView(P.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
    new P.PickerBuilder()
      .addView(view)
      .enableFeature(P.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setDeveloperKey(key)
      .setAppId(appId)
      .setTitle('Pick files for Experiment AI')
      .setCallback((d) => {
        if (d[P.Response.ACTION] !== P.Action.PICKED) return;
        for (const doc of d[P.Response.DOCUMENTS]) {
          const id = doc[P.Document.ID];
          if (!attachments.some((a) => a.id === id)) attachments.push({ kind: 'drive', id, name: doc[P.Document.NAME], files: [] });
        }
        const s = settings();
        if (!(s.tools || []).includes('google')) s.tools = [...(s.tools || []), 'google']; // reading them needs Drive on
        persistSettings();
        input.focus();
      })
      .build()
      .setVisible(true);
  } catch (err) {
    notice(err.message || 'Couldn’t open Google Drive.');
  }
}

/* ── Memory: what Experiment AI remembers about you (chats with Memory on can add to it; Light and up) ── */
async function loadMemories(box) {
  let list;
  try { list = (await api('/api/settings', { action: 'get' })).memories || []; } catch (err) { fill(box, el('p', { class: 'set-empty-row' }, err.message)); return; }
  const store = async (next, done) => {
    list = (await api('/api/settings', { action: 'memories', memories: next })).memories;
    draw();
    if (done) notice(done);
  };
  const free = usageData && usageData.plan === 'free' && !usageData.unlimited;
  const field = el('input', { class: 'field', maxlength: '400', placeholder: 'Add something to remember, e.g. I’m learning Spanish' });
  const draw = () => fill(box,
    free && el('p', { class: 'set-empty-row' }, 'Memory comes with Light and up. You can still add things here; chats will use them once you upgrade.'),
    list.length
      ? el('ul', { class: 'memory-list' }, list.map((m) => el('li', {},
          el('span', {}, m.text),
          el('button', {
            type: 'button', class: 'chip-x', 'aria-label': `Forget “${m.text}”`, title: 'Forget this',
            onclick: (e) => busy(e.currentTarget, () => store(list.filter((x) => x.id !== m.id), 'Forgotten')),
          }, icon('x')))))
      : el('p', { class: 'set-empty-row' }, 'Nothing yet. With Memory on in a chat (the + menu), Experiment AI saves useful things you tell it, like your name, your projects or how you like answers.'),
    el('form', {
      class: 'memory-add',
      onsubmit: (e) => {
        e.preventDefault();
        const t = field.value.trim();
        if (!t) return;
        busy(e.submitter || e.target.querySelector('button'), async () => { await store([{ text: t, at: Date.now() }, ...list], 'Saved to memory'); field.value = ''; });
      },
    }, field, el('button', { type: 'submit', class: 'btn btn-sm' }, 'Add'),
      list.length > 1 && el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm',
        onclick: (e) => busy(e.currentTarget, async () => { if (confirm('Forget everything Experiment AI remembers about you?')) await store([], 'Memory cleared'); }),
      }, 'Clear all')),
  );
  draw();
}

/* ───────── Suspended accounts: the reason an admin gave, instead of the app ───────── */
function showBanned(ban) {
  if (document.querySelector('.banned-layer')) return;
  closeSettings();
  const when = ban?.at ? new Date(ban.at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  document.body.append(el('div', { class: 'banned-layer', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'banned-title' },
    el('div', { class: 'banned-card' },
      el('div', { class: 'banned-icon', 'aria-hidden': 'true' }, svgIcon('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>')),
      el('h2', { id: 'banned-title' }, 'Your account has been ', el('span', { class: 'serif' }, 'suspended')),
      el('p', {}, 'You can’t use Experiment AI with this account right now.'),
      ban?.reason && el('div', { class: 'banned-reason' }, el('small', {}, 'Reason'), el('p', {}, ban.reason)),
      when && el('p', { class: 'banned-when' }, `Suspended on ${when}.`),
      el('div', { class: 'banned-actions' },
        el('a', { class: 'btn btn-ghost', href: 'mailto:contact@experimentai.dev?subject=Suspended%20account' }, 'Email us'),
        el('button', { type: 'button', class: 'btn', onclick: () => logOut() }, 'Log out')),
      el('button', { type: 'button', class: 'banned-delete', onclick: (e) => busy(e.currentTarget, deleteAccount) }, 'Delete my account and data'))));
}

/* ───────── Admin (only for admins): find accounts, ban with a reason, override plans, access, usage ───────── */
let adminState = { query: '', filter: 'all', users: [], next: null };
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const userBadges = (u) => [
  el('span', { class: 'badge' }, PLAN_INFO[u.plan]?.name || u.plan),
  u.override && el('span', { class: 'badge badge-blue' }, 'Overridden'),
  u.banned && el('span', { class: 'badge badge-red' }, 'Banned'),
  u.unlimited && el('span', { class: 'badge badge-gold' }, 'Unlimited'),
  u.admin && el('span', { class: 'badge badge-blue' }, 'Admin'),
  !u.access && el('span', { class: 'badge' }, 'No app access'),
];
const avatarOf = (u) => el('img', { class: 'avatar', src: u.photo || '/assets/potion-orb-icon-pfp.png', alt: '', width: '34', height: '34', referrerpolicy: 'no-referrer' });

async function renderAdmin(more = false) {
  const top = head('Admin', 'Find an account to ban it, change its plan, let it into the app or reset its usage.');
  const q = el('input', { class: 'field', type: 'search', placeholder: 'Email, name or user ID', value: adminState.query });
  const list = el('div', { class: 'set-group admin-list' }, loading());
  fill(settingsBody, top,
    el('form', {
      class: 'admin-search',
      onsubmit: (e) => { e.preventDefault(); adminState = { ...adminState, query: q.value.trim(), users: [], next: null }; renderAdmin(); },
    }, q,
      seg('Show', [['all', 'Everyone'], ['banned', 'Banned']], adminState.filter, (v) => { adminState = { ...adminState, filter: v, users: [], next: null }; renderAdmin(); }),
      el('button', { type: 'submit', class: 'btn btn-sm' }, 'Search')),
    list);
  try {
    const r = await api('/api/settings', { action: 'admin-users', query: adminState.query, filter: adminState.filter, pageToken: more ? adminState.next : undefined });
    adminState.users = more ? [...adminState.users, ...r.users] : r.users;
    adminState.next = r.nextPageToken;
  } catch (err) { fill(list, failed(err, () => renderAdmin())); return; }
  if (settingsTab !== 'admin') return;
  fill(list,
    adminState.users.length
      ? adminState.users.map((u) => el('button', { type: 'button', class: 'set-row admin-row', onclick: () => renderAdminUser(u.uid) },
          avatarOf(u),
          el('div', { class: 'grow' }, el('strong', {}, u.name || u.email || u.uid), el('small', {}, `${u.email || 'no email'} · joined ${fmtDay(u.created)}`)),
          el('span', { class: 'admin-badges' }, userBadges(u)),
          icon('chevron')))
      : el('p', { class: 'set-empty-row' }, adminState.query ? 'No account matches that.' : adminState.filter === 'banned' ? 'Nobody is banned.' : 'No accounts yet.'),
    adminState.next && !adminState.query && el('div', { class: 'admin-more' }, button('Load more', () => renderAdmin(true))));
}

async function renderAdminUser(uid, given = null) {
  const back = el('button', { type: 'button', class: 'back', onclick: () => renderAdmin() }, icon('back'), 'All accounts');
  if (!given) fill(settingsBody, back, loading());
  let u = given;
  try { if (!u) u = (await api('/api/settings', { action: 'admin-user', uid })).user; } catch (err) { fill(settingsBody, back, failed(err, () => renderAdminUser(uid))); return; }
  if (settingsTab !== 'admin') return;
  const act = (action, extra = {}, done) => async () => {
    const r = await api('/api/settings', { action, uid, ...extra });
    adminState.users = adminState.users.map((x) => (x.uid === uid ? r.user : x));
    if (done) notice(done);
    renderAdminUser(uid, r.user);
  };
  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const reason = el('textarea', { class: 'field', rows: '2', maxlength: '500', placeholder: 'Why? They’ll see this when they sign in.' });
  const override = el('select', { class: 'field', onchange: (e) => busy(e.target, act('admin-plan', { plan: e.target.value === 'stripe' ? null : e.target.value }, 'Plan updated')) },
    el('option', { value: 'stripe', selected: !u.override }, `From Stripe (${PLAN_INFO[u.stripePlan]?.name || 'Free'})`),
    PLANS_ALL.map((p) => el('option', { value: p, selected: u.override === p }, `${PLAN_INFO[p].name} (override)`)));

  fill(settingsBody, back,
    el('div', { class: 'admin-head' },
      el('img', { class: 'avatar avatar-lg', src: u.photo || '/assets/potion-orb-icon-pfp.png', alt: '', referrerpolicy: 'no-referrer' }),
      el('div', { class: 'grow' },
        el('h3', {}, u.name || u.email || 'No name'),
        el('p', {}, u.email || 'no email', u.verified ? '' : ' · not verified'),
        el('span', { class: 'admin-badges' }, userBadges(u)))),
    group('Account',
      row('User ID', u.uid, button('Copy', () => navigator.clipboard?.writeText(u.uid).then(() => notice('Copied')))),
      row('Joined', `${fmtDay(u.created)} · last signed in ${fmtDay(u.lastSignIn)}`),
      row('Signs in with', (u.providers || []).map((p) => (p === 'google.com' ? 'Google' : p === 'password' ? 'Email and password' : p)).join(', ') || '—'),
      row('Saved chats', String(u.chats ?? '—'))),
    group('Plan',
      row('Plan', u.status ? `Stripe: ${PLAN_INFO[u.stripePlan]?.name || 'Free'} (${u.status}${u.cancelAtPeriodEnd ? ', cancelled' : ''}${u.periodEnd ? `, until ${fmtDate(u.periodEnd)}` : ''})` : 'No Stripe subscription', override),
      row('Unlimited', u.unlimitedBuiltIn ? 'Always on for this account.' : 'No limits and every model, whatever the plan.',
        toggle('Unlimited', u.unlimited, (on) => act('admin-unlimited', { on }, on ? 'Unlimited on' : 'Unlimited off')().catch((err) => notice(err.message)))),
      row('App access', 'Let this account use the AI.',
        toggle('App access', u.access, (on) => act('admin-access', { on }, on ? 'Access given' : 'Access removed')().catch((err) => notice(err.message))))),
    group('Usage',
      u.usage && el('div', { class: 'meter' },
        el('div', { class: 'meter-top' }, el('strong', {}, 'Today'), el('span', { class: 'meter-pct' }, `${pct(u.usage.spent.day, u.usage.budgets.day)}%`)),
        el('div', { class: 'bar grown' }, el('i', { style: `--p:${pct(u.usage.spent.day, u.usage.budgets.day)}%` }))),
      u.usage && el('div', { class: 'meter' },
        el('div', { class: 'meter-top' }, el('strong', {}, 'This week'), el('span', { class: 'meter-pct' }, `${pct(u.usage.spent.week, u.usage.budgets.week)}%`)),
        el('div', { class: 'bar grown' }, el('i', { style: `--p:${pct(u.usage.spent.week, u.usage.budgets.week)}%` }))),
      row('Reset usage', 'Puts today and this week back to 0%.', button('Reset', (e) => busy(e.currentTarget, async () => {
        if (confirm(`Reset ${u.email || 'this account'}’s usage?`)) await act('admin-reset-usage', {}, 'Usage reset')();
      })))),
    u.banned
      ? el('div', { class: 'plan-card cancelled admin-ban' },
          el('strong', {}, `Banned on ${fmtDay(u.banned.at)}${u.banned.by ? ` by ${u.banned.by}` : ''}`),
          el('p', { class: 'plan-status' }, u.banned.reason),
          el('div', { class: 'plan-actions' }, button('Unban', (e) => busy(e.currentTarget, act('admin-unban', {}, 'Unbanned')), 'btn btn-sm')))
      : !u.admin && [el('h4', { class: 'set-label' }, 'Ban'),
          el('form', {
            class: 'set-group set-form',
            onsubmit: (e) => {
              e.preventDefault();
              if (!reason.value.trim()) { reason.focus(); return; }
              busy(e.submitter, async () => {
                if (confirm(`Ban ${u.email || 'this account'}? They’ll be signed out and see your reason.`)) await act('admin-ban', { reason: reason.value.trim() }, 'Banned')();
              });
            },
          }, reason, el('div', { class: 'form-actions' }, el('button', { type: 'submit', class: 'btn btn-sm btn-red' }, 'Ban account')))],
    !u.admin && adminDeleteBox(u),
  );
  settingsBody.scrollTop = 0;
}
// Delete an account for good: type their email to confirm (cancels a paid plan, deletes chats, files and the sign-in)
function adminDeleteBox(u) {
  const who = u.email || u.uid;
  const confirmField = el('input', { class: 'field', placeholder: `Type ${who} to confirm`, autocomplete: 'off', spellcheck: 'false' });
  const go = el('button', { type: 'submit', class: 'btn btn-sm btn-red', disabled: true }, 'Delete account');
  confirmField.addEventListener('input', () => { go.disabled = confirmField.value.trim().toLowerCase() !== who.toLowerCase(); });
  return [
    el('h4', { class: 'set-label' }, 'Delete account'),
    el('form', {
      class: 'set-group set-form admin-delete',
      onsubmit: (e) => {
        e.preventDefault();
        busy(go, async () => {
          await api('/api/settings', { action: 'admin-delete', uid: u.uid, confirm: confirmField.value.trim() });
          adminState.users = adminState.users.filter((x) => x.uid !== u.uid);
          notice(`Deleted ${who}`);
          renderAdmin();
        });
      },
    },
      el('p', { class: 'admin-delete-note' }, 'Deletes their chats, projects, Memory, files, connected services, usage and sign-in for good, and cancels a paid plan in Stripe right away. This can’t be undone.'),
      confirmField,
      el('div', { class: 'form-actions' }, go)),
  ];
}
const PLANS_ALL = ['free', 'light', 'pro', 'max-5x', 'max-10x'];

/* ───────── Connectors (api/connectors.js; each tool's sign-in comes back to /api/connect/<tool>/callback) ───────── */
async function renderConnectors() {
  const top = head('Connectors', 'Let Experiment AI use your other tools. Connect once and it works in every chat.');
  fill(settingsBody, top, loading());
  if (!signedIn()) { fill(settingsBody, top, el('div', { class: 'set-empty' }, el('p', {}, 'Sign in to connect your tools.'))); return; }
  let list;
  try { list = await loadConnectors(true); } catch (err) { if (settingsTab === 'connectors') fill(settingsBody, top, failed(err, renderConnectors)); return; }
  if (settingsTab !== 'connectors') return;
  const byTool = Object.fromEntries(list.map((c) => [c.tool, c]));

  fill(settingsBody, top,
    el('div', { class: 'set-group' }, CONNECTORS.map((c) => {
      const s = byTool[c.id] || {};
      let state = 'Not connected';
      if (s.connected) state = s.account ? `Connected as ${s.account}` : 'Connected';
      else if (!s.setUp) state = 'Not set up yet';
      return el('div', { class: `set-row conn-row${s.connected ? ' on' : ''}` },
        el('span', { class: 'conn-logo' }, el('img', { src: c.logo, alt: '', width: '24', height: '24' })),
        el('div', { class: 'grow' }, el('strong', {}, c.name), el('small', {}, c.note)),
        el('span', { class: 'conn-state' }, s.connected && el('i', { class: 'conn-dot' }), state),
        s.connected
          ? button('Disconnect', (e) => busy(e.currentTarget, async () => {
              if (!confirm(`Disconnect ${c.name}? Experiment AI won’t be able to use it until you connect again.`)) return;
              await api('/api/connectors', { action: 'disconnect', tool: c.id });
              notice(`${c.name} disconnected`);
              renderConnectors();
            }))
          : el('button', {
              type: 'button', class: 'btn btn-sm', disabled: !s.setUp, title: s.setUp ? null : `${c.name} needs its sign-in keys added before it can connect`,
              onclick: (e) => busy(e.currentTarget, async () => {
                location.href = (await api('/api/connectors', { action: 'connect', tool: c.id })).url;
              }),
            }, 'Connect'));
    })),
    el('p', { class: 'set-note' }, 'You choose what each tool shares, and you can disconnect at any time.'),
  );
}
