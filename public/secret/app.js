// Experiment AI app: floating sidebar + message bar. No AI replies yet; sent messages just show in the thread.

const app = document.getElementById('app');
const input = document.getElementById('input');
const send = document.getElementById('send');
const composer = document.getElementById('composer');
const messages = document.getElementById('messages');
const thread = document.getElementById('thread');
const phone = window.matchMedia('(max-width: 760px)');

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

document.getElementById('side-close').addEventListener('click', () => setSidebar(false));
document.getElementById('side-open').addEventListener('click', () => setSidebar(true));
document.getElementById('scrim').addEventListener('click', () => setSidebar(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && phone.matches) setSidebar(false);
});

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
const greetingText = document.getElementById('greeting-text');
const greetingRow = greetingText.parentElement;

function newGreeting() {
  let last = -1;
  try { last = Number(sessionStorage.getItem('greeting') ?? -1); } catch {}
  let i;
  do { i = Math.floor(Math.random() * GREETINGS.length); } while (i === last && GREETINGS.length > 1);
  try { sessionStorage.setItem('greeting', String(i)); } catch {}

  const [before, word, after] = GREETINGS[i];
  const em = document.createElement('span');
  em.className = 'serif';
  em.textContent = word;
  greetingText.replaceChildren(before, em, after);

  greetingRow.classList.remove('fresh');
  void greetingRow.offsetWidth; // restart the entrance animation
  greetingRow.classList.add('fresh');
}
newGreeting();

/* ── New chat: back to the home screen ── */
document.getElementById('new-chat').addEventListener('click', () => {
  messages.replaceChildren();
  setChatting(false);
  newGreeting();
  if (phone.matches) setSidebar(false);
  input.focus();
});

/* ── Message bar: under the greeting on home, glides to the bottom once chatting starts ── */
let glideTimer;
function setChatting(on) {
  if (app.classList.contains('has-messages') === on) return;
  composer.classList.add('gliding');
  app.classList.toggle('has-messages', on);
  clearTimeout(glideTimer);
  glideTimer = setTimeout(() => composer.classList.remove('gliding'), 750);
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  composer.style.setProperty('--ch', composer.offsetHeight + 'px');
  send.disabled = !input.value.trim();
}
input.addEventListener('input', autosize);

input.addEventListener('keydown', (e) => {
  // Enter sends, Shift+Enter adds a line (not while an IME is composing)
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  const li = document.createElement('li');
  li.className = 'msg';
  li.textContent = text;
  messages.append(li);
  setChatting(true);
  thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });

  input.value = '';
  autosize();
  input.focus();
});

autosize();
if (!phone.matches) input.focus();
