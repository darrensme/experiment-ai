(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ── Wordmark: every letter its own font ──
     Each letter owns one of 12 font classes (f0–f11). On load they spin like a slot machine and
     land on their own font; every few seconds two letters trade fonts, so no two ever match. */
  const FONT_COUNT = 12;
  const letters = $$('.wordmark .l');
  const setFont = (el, f) => {
    el.className = el.className.replace(/\bf\d+\b/g, '').trim() + ' f' + f;
    el.dataset.cur = f;
  };
  letters.forEach((el) => setFont(el, el.dataset.f));

  if (!reduced) {
    letters.forEach((el, i) => {
      let n = 0;
      const spins = 8 + i * 2;
      const t = setInterval(() => {
        if (++n >= spins) {
          clearInterval(t);
          setFont(el, el.dataset.f);
          el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
          return;
        }
        setFont(el, Math.floor(Math.random() * FONT_COUNT));
      }, 55);
    });

    setInterval(() => {
      const a = letters[Math.floor(Math.random() * letters.length)];
      let b = a;
      while (b === a) b = letters[Math.floor(Math.random() * letters.length)];
      const fa = a.dataset.cur;
      setFont(a, b.dataset.cur);
      setFont(b, fa);
      [a, b].forEach((el) => { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); });
    }, 2600);
  }

  /* ── Scroll: nav state, sky parallax, golden-hour glow ── */
  const nav = $('.nav');
  const root = document.documentElement;
  const onScroll = () => {
    const y = scrollY;
    const max = Math.max(1, root.scrollHeight - innerHeight);
    nav.classList.toggle('scrolled', y > 20);
    root.style.setProperty('--scroll', y.toFixed(0));
    root.style.setProperty('--p', (y / max).toFixed(3));
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Hero logo tilts toward the cursor ── */
  const tile = $('.logo-tile');
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => {
      const x = e.clientX / innerWidth - 0.5;
      const y = e.clientY / innerHeight - 0.5;
      tile.style.setProperty('--ry', (x * 22).toFixed(1) + 'deg');
      tile.style.setProperty('--rx', (-y * 22).toFixed(1) + 'deg');
    });

    /* magnetic buttons */
    $$('.magnetic').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', ((e.clientX - r.left - r.width / 2) * 0.25).toFixed(1) + 'px');
        btn.style.setProperty('--my', ((e.clientY - r.top - r.height / 2) * 0.35).toFixed(1) + 'px');
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  /* ── Reveal on scroll ── */
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); revealer.unobserve(en.target); }
    });
  }, { threshold: 0.15 });
  $$('.reveal').forEach((el) => revealer.observe(el));

  /* ── Feature demos: each loops only while its card is on screen ── */
  const visible = new WeakMap();
  const demoObserver = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const wasVisible = visible.get(en.target);
      visible.set(en.target, en.isIntersecting);
      if (en.isIntersecting && !wasVisible) runDemo(en.target);
    });
  }, { threshold: 0.35 });
  const running = new WeakSet();
  $$('[data-demo]').forEach((card) => demoObserver.observe(card));

  async function runDemo(card) {
    if (running.has(card)) return;
    running.add(card);
    const fn = DEMOS[card.dataset.demo];
    do { await fn($('.demo', card)); } while (visible.get(card) && !reduced);
    running.delete(card);
  }

  const DEMOS = {
    async schedule(el) {
      const gym = $('.e3', el);
      el.classList.remove('on', 'moved');
      gym.style.setProperty('--c', 4);
      await sleep(300);
      el.classList.add('on');
      await sleep(1800);
      gym.style.setProperty('--c', 3);
      el.classList.add('moved');
      await sleep(3600);
    },

    async tools(el) {
      const tools = $$('.tool', el);
      tools.forEach((t) => t.classList.remove('on'));
      await sleep(500);
      for (const t of tools) { t.classList.add('on'); await sleep(420); }
      await sleep(2600);
    },

    async image(el) {
      const typed = $('.typed', el);
      const text = typed.dataset.text;
      el.classList.remove('rendering', 'done');
      typed.textContent = '';
      await sleep(400);
      for (let i = 1; i <= text.length; i++) { typed.textContent = text.slice(0, i); await sleep(32); }
      await sleep(300);
      el.classList.add('rendering');
      await sleep(1700);
      el.classList.add('done');
      await sleep(3200);
    },

    async code(el) {
      const out = $('.typed-code', el);
      el.classList.remove('done');
      out.innerHTML = '';
      await sleep(300);
      for (const [cls, txt] of CODE) {
        const span = document.createElement('span');
        if (cls) span.className = 'tok-' + cls;
        out.appendChild(span);
        for (const ch of txt) { span.textContent += ch; await sleep(ch === '\n' ? 90 : 18); }
      }
      await sleep(250);
      el.classList.add('done');
      await sleep(3200);
    },
  };

  const CODE = [
    ['c', '// one question, the best model answers\n'],
    ['k', 'const '], ['', 'models = ['], ['s', '"grok"'], ['', ', '], ['s', '"claude"'], ['', ', '],
    ['s', '"gemini"'], ['', ', '], ['s', '"chatgpt"'], ['', ', '], ['s', '"muse"'], ['', '];\n\n'],
    ['k', 'export async function '], ['f', 'ask'], ['', '(task) {\n'],
    ['', '  '], ['k', 'const '], ['', 'best = '], ['f', 'rank'], ['', '(models, task)['], ['n', '0'], ['', '];\n'],
    ['', '  '], ['k', 'return '], ['f', 'experiment'], ['', '(best).'], ['f', 'run'], ['', '(task);\n'],
    ['', '}'],
  ];

  /* ── Sign up / Log in modal (front end only) ── */
  const modal = $('#auth');
  const form = $('form', modal);
  const msg = $('.form-msg', modal);
  const title = $('#auth-title');
  const submit = $('button[type=submit]', form);
  let lastFocus = null;

  const setMode = (mode) => {
    modal.dataset.mode = mode;
    title.textContent = mode === 'signup' ? 'Create your account' : 'Welcome back';
    $$('.seg button', modal).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $('input[name=password]', form).autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    msg.textContent = ''; msg.classList.remove('err');
  };
  const open = (mode) => {
    lastFocus = document.activeElement;
    setMode(mode);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $(mode === 'signup' ? 'input[name=name]' : 'input[name=email]', form).focus(), 50);
  };
  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    lastFocus?.focus();
  };

  $$('[data-auth]').forEach((b) => b.addEventListener('click', () => open(b.dataset.auth)));
  $$('.seg button', modal).forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('[data-close]', modal).forEach((b) => b.addEventListener('click', close));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = modal.dataset.mode;
    const body = { email: form.email.value.trim(), password: form.password.value };
    if (mode === 'signup') body.name = form.name.value.trim();
    msg.classList.remove('err');
    if (mode === 'signup' && !body.name) return fail('Enter your name.');
    if (!/^\S+@\S+\.\S+$/.test(body.email)) return fail('Enter a valid email.');
    if (mode === 'signup' && body.password.length < 8) return fail('Password needs at least 8 characters.');
    if (!body.password) return fail('Enter your password.');

    submit.disabled = true;
    msg.textContent = mode === 'signup' ? 'Creating your account…' : 'Logging you in…';
    try {
      const res = await fetch(`/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      msg.textContent = '✦ Welcome to Experiment AI';
      location.href = '/app';
    } catch (err) {
      fail(location.protocol === 'file:' ? 'Start the server with “npm start”, then open http://localhost:3000' : err.message);
    } finally {
      submit.disabled = false;
    }
  });

  function fail(text) {
    msg.textContent = text;
    msg.classList.add('err');
  }

  /* ── Already signed in? Swap the auth buttons for “Open app” ── */
  if (location.protocol !== 'file:') {
    fetch('/api/me').then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data?.user) return;
      document.body.classList.add('signed-in');
      $$('[data-auth="login"]').forEach((b) => b.remove());
      $$('[data-auth="signup"]').forEach((b) => {
        const a = document.createElement('a');
        a.className = b.className;
        a.href = '/app';
        a.innerHTML = 'Open app <span class="arrow">→</span>';
        b.replaceWith(a);
      });
    }).catch(() => {});
  }

  const wanted = new URLSearchParams(location.search).get('auth');
  if (wanted === 'login' || wanted === 'signup') {
    history.replaceState(null, '', location.pathname);
    open(wanted);
  }

  /* ── Hero drifts up and fades as you scroll into the orbit ── */
  const hero = $('.hero');
  if (!reduced) {
    const heroScroll = () => {
      const p = Math.min(1, scrollY / (innerHeight * 0.9));
      hero.style.setProperty('--hp', p.toFixed(3));
    };
    addEventListener('scroll', heroScroll, { passive: true });
    heroScroll();

    /* cursor spotlight on glass cards */
    $$('.feature, .table-card').forEach((card) => card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--sx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--sy', (e.clientY - r.top) + 'px');
    }));
  }
})();
