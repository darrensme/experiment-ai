(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const thread = $('.thread');
  const form = $('.composer');
  const input = form.content;
  const sendBtn = $('.send');
  const avatar = $('.avatar');
  const menu = $('.menu');

  const ICONS = {
    auto: 'assets/potion-orb-pfp-sky-bottle.png',
    grok: 'assets/ai/grok.svg',
    claude: 'assets/ai/claude-color.svg',
    gemini: 'assets/ai/gemini-color.svg',
    chatgpt: 'assets/ai/openai.svg',
    muse: 'assets/ai/meta-color.svg',
  };
  let MODELS = { auto: 'Auto' };
  let model = 'auto';
  let lastDay = '';

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 401) { location.href = '/?auth=login'; throw new Error('Logged out'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    return data;
  }

  /* ── Clock (top-left of the screenshot layout) ── */
  const tick = () => {
    const now = new Date();
    $('.clock-day').textContent = now.toLocaleDateString(undefined, { weekday: 'short' });
    $('.clock-date').textContent = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    $('.clock-time').textContent = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  tick();
  setInterval(tick, 10_000);

  /* ── Messages ── */
  function addDay(ts) {
    const day = new Date(ts).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (day === lastDay) return;
    lastDay = day;
    const el = document.createElement('div');
    el.className = 'day';
    el.textContent = day;
    thread.appendChild(el);
  }

  function addMessage(m) {
    addDay(m.created_at);
    const el = document.createElement('div');
    el.className = `msg ${m.role}`;
    if (m.role === 'assistant') {
      const who = document.createElement('div');
      who.className = 'who';
      const img = document.createElement('img');
      img.src = ICONS[m.model] || ICONS.auto;
      img.alt = '';
      who.append(img, MODELS[m.model] || 'Experiment AI');
      el.appendChild(who);
    }
    el.append(m.content);
    thread.appendChild(el);
    thread.classList.add('has-messages');
    return el;
  }

  const scrollDown = () => scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

  async function load() {
    const [{ user }, { messages, models }] = await Promise.all([api('/api/me'), api('/api/messages')]);
    MODELS = models;
    const first = user.name.split(' ')[0];
    const hour = new Date().getHours();
    const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const greeting = $('.greeting');
    greeting.textContent = `Good ${part}, `;
    const name = document.createElement('em');
    name.className = 'serif gold';
    name.textContent = first + '.';
    greeting.appendChild(name);
    avatar.textContent = first.charAt(0).toUpperCase();
    $('.menu-name').textContent = user.name;
    $('.menu-email').textContent = user.email;
    messages.forEach(addMessage);
    scrollTo(0, document.body.scrollHeight);
  }

  /* ── Composer ── */
  const syncInput = () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    sendBtn.disabled = !input.value.trim();
  };
  input.addEventListener('input', syncInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  syncInput();

  $$('.models button').forEach((b) => b.addEventListener('click', () => {
    model = b.dataset.model;
    $$('.models button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    input.focus();
  }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    syncInput();

    const mine = addMessage({ role: 'user', content, model, created_at: Date.now() });
    const typing = document.createElement('div');
    typing.className = 'msg assistant typing';
    typing.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    thread.appendChild(typing);
    scrollDown();

    try {
      const [{ messages }] = await Promise.all([
        api('/api/messages', { method: 'POST', body: { content, model } }),
        new Promise((r) => setTimeout(r, 700)),
      ]);
      typing.remove();
      addMessage(messages[1]);
    } catch (err) {
      typing.remove();
      mine.remove();
      input.value = content;
      syncInput();
      alert(err.message);
    }
    scrollDown();
  });

  /* ── Account menu ── */
  const toggleMenu = (open) => {
    menu.hidden = !open;
    avatar.setAttribute('aria-expanded', String(open));
  };
  avatar.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) toggleMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleMenu(false); });

  $('[data-action="logout"]').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: {} });
    location.href = '/';
  });
  $('[data-action="clear"]').addEventListener('click', async () => {
    if (!confirm('Clear your whole chat history?')) return;
    await api('/api/messages', { method: 'DELETE' });
    $$('.msg, .day', thread).forEach((el) => el.remove());
    lastDay = '';
    thread.classList.remove('has-messages');
    toggleMenu(false);
  });

  load().catch((err) => console.error(err));
})();
