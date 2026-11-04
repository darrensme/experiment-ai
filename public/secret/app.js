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

/* ── New chat: clears the thread ── */
document.getElementById('new-chat').addEventListener('click', () => {
  messages.replaceChildren();
  app.classList.remove('has-messages');
  if (phone.matches) setSidebar(false);
  input.focus();
});

/* ── Message bar ── */
function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 200) + 'px';
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
  app.classList.add('has-messages');
  thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });

  input.value = '';
  autosize();
  input.focus();
});

if (!phone.matches) input.focus();
