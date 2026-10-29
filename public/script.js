import { auth, authMessage, db } from './firebase.js';
import {
  GoogleAuthProvider, createUserWithEmailAndPassword, getRedirectResult, onAuthStateChanged, signInWithEmailAndPassword,
  signInWithPopup, signInWithRedirect, signOut, updateProfile,
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';

(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ── Smooth scroll (Lenis) driving GSAP ScrollTrigger ── */
  const { gsap, ScrollTrigger, Lenis } = window;
  gsap.registerPlugin(ScrollTrigger);
  const lenis = reduced ? null : new Lenis({ lerp: 0.09 });
  if (lenis) {
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const target = a.getAttribute('href') === '#top' ? 0 : $(a.getAttribute('href'));
    if (target === null) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(target, { duration: 1.4 }) : (target === 0 ? scrollTo(0, 0) : target.scrollIntoView());
  }));

  /* ── Scroll: nav hides going down / returns going up; sky parallax + golden-hour glow ── */
  const nav = $('.nav');
  const root = document.documentElement;
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav.classList.toggle('hide', self.direction === 1 && y > 120);
      root.style.setProperty('--scroll', y.toFixed(0));
      root.style.setProperty('--p', self.progress.toFixed(3));
    },
  });

  /* ── Hero logo tilts toward the cursor ── */
  const tile = $('.logo-tile');
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    if (tile) addEventListener('pointermove', (e) => {
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

  /* ── GSAP: page intro, hero parallax out, section reveals, orbit entrance ── */
  if (!reduced) {
    const intro = $$('.hero-inner > *, .page-hero > *');
    if (intro.length) {
      gsap.from(intro, { y: 40, autoAlpha: 0, duration: 1.2, ease: 'power3.out', stagger: 0.12, delay: 0.15 });
    }
    if ($('.hero')) {
      gsap.to('.hero-inner', {
        y: -120, scale: 0.94, autoAlpha: 0, ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
      });
    }
    $$('.reveal').forEach((el) => {
      gsap.from(el, {
        y: 70, autoAlpha: 0, duration: 1.1, ease: 'power3.out',
        delay: el.classList.contains('feature') ? ($$('.feature').indexOf(el) % 2) * 0.12 : 0,
        scrollTrigger: { trigger: el, start: 'top 88%' },
      });
    });
    if ($('.orbit')) {
      gsap.from('.orbit', {
        scale: 0.55, rotate: -40, autoAlpha: 0, ease: 'none',
        scrollTrigger: { trigger: '.orbit', start: 'top 95%', end: 'center 60%', scrub: 1 },
      });
    }
  }

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

  /* ── Waitlist: Google, or email + password (Firebase Auth). Email sign-ups confirm a 6-digit code that
        api/send-code emails from noreply@experimentai.dev (api/verify-code checks it). Spot saved to waitlist/{uid}. ── */
  const modal = $('#auth');
  const msg = $('.form-msg', modal);
  const joinButtons = $$('[data-auth]');
  joinButtons.forEach((b) => { b.dataset.label = b.innerHTML; });
  let lastFocus = null;

  // Google already verifies its emails; email + password accounts verify with our code.
  const isVerified = (user) => user.emailVerified || user.providerData.some((p) => p.providerId === 'google.com');

  const say = (text, isErr = false) => {
    msg.textContent = text;
    msg.classList.toggle('err', isErr);
  };
  const showStep = (step) => { modal.dataset.step = step; };

  const open = () => {
    lastFocus = document.activeElement;
    say('');
    const user = auth.currentUser;
    if (user && isVerified(user)) {
      fillDone(user);
      showStep('done');
    } else if (user) {
      $('.verify-email', modal).textContent = user.email;
      showStep('verify');
    } else {
      showStep('join');
    }
    modal.hidden = false;
    lenis?.stop();
    setTimeout(() => $(`.step-${modal.dataset.step} input, .step-${modal.dataset.step} button`, modal)?.focus(), 50);
  };
  const close = () => {
    modal.hidden = true;
    lenis?.start();
    lastFocus?.focus();
  };

  function fillDone(user) {
    const first = (user.displayName || '').split(' ')[0];
    $('.done-name', modal).textContent = first ? `, ${first}` : '';
    $('.done-email', modal).textContent = user.email || 'you';
  }

  function markJoined(joined) {
    document.body.classList.toggle('joined', joined);
    joinButtons.forEach((b) => {
      b.innerHTML = !joined ? b.dataset.label
        : b.classList.contains('btn-sm') ? '✓ On the waitlist' : 'You’re on the list ✓';
    });
  }

  // Firestore is only needed at sign-up, so it loads on demand. One save per person, however many callers.
  const saves = new Map();
  function saveSpot(user, providerId) {
    if (!saves.has(user.uid)) {
      saves.set(user.uid, writeSpot(user, providerId).catch((err) => { saves.delete(user.uid); throw err; }));
    }
    return saves.get(user.uid);
  }
  async function writeSpot(user, providerId) {
    const { doc, getDoc, serverTimestamp, setDoc } = await import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js');
    const ref = doc(db, 'waitlist', user.uid);
    if ((await getDoc(ref)).exists()) return;
    await setDoc(ref, {
      name: (user.displayName || '').slice(0, 100),
      email: user.email ?? null,
      provider: providerId,
      joinedAt: serverTimestamp(),
    });
  }

  async function finish(cred) {
    await saveSpot(cred.user, cred.providerId);
    fillDone(cred.user);
    markJoined(true);
    say('');
    showStep('done');
  }

  /* Verification-code API (Vercel functions in api/). */
  async function api(path, user, body = {}) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  async function sendCode(user) {
    $('.verify-email', modal).textContent = user.email;
    showStep('verify');
    say('Sending your code…');
    const { verified } = await api('/api/send-code', user);
    if (verified) return confirmed(user);
    say('Code sent. Check your inbox (and spam, just in case).');
    setTimeout(() => $('.code-input', modal).focus(), 50);
  }

  async function confirmed(user) {
    await user.reload();
    await user.getIdToken(true); // a fresh token carries email_verified, which the Firestore rules check
    await finish({ user: auth.currentUser, providerId: 'password' });
  }

  const google = new GoogleAuthProvider();
  const form = $('.email-form', modal);
  const verifyForm = $('.verify-form', modal);
  const codeInput = $('.code-input', modal);
  let joining = false; // true while a sign-in is in flight, so the auth listener below doesn't save first
  const lock = (locked) => {
    joining = locked;
    $$('.step button', modal).forEach((b) => { b.disabled = locked; });
  };

  $('[data-provider="google"]', modal).addEventListener('click', async () => {
    lock(true);
    say('Opening Google…');
    try {
      await finish(await signInWithPopup(auth, google));
    } catch (err) {
      if (err.code === 'auth/popup-blocked') return signInWithRedirect(auth, google);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return say('');
      fail(err);
    } finally {
      lock(false);
    }
  });

  // One form for both: new email → create the account; existing email → log in to see your spot.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return say('Enter a valid email.', true);
    if (password.length < 8) return say('Password needs at least 8 characters.', true);

    lock(true);
    say('Saving your spot…');
    try {
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name.slice(0, 60) });
      } catch (err) {
        if (err.code !== 'auth/email-already-in-use') throw err;
        cred = await signInWithEmailAndPassword(auth, email, password);
      }
      form.reset();
      if (isVerified(cred.user)) await finish({ user: cred.user, providerId: 'password' });
      else await sendCode(cred.user);
    } catch (err) {
      fail(err);
    } finally {
      lock(false);
    }
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    if (codeInput.value.length === 6) verifyForm.requestSubmit();
  });

  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return showStep('join');
    const code = codeInput.value.replace(/\D/g, '');
    if (code.length !== 6) return say('Enter the 6-digit code from the email.', true);
    lock(true);
    say('Checking your code…');
    try {
      await api('/api/verify-code', user, { code });
      verifyForm.reset();
      await confirmed(user);
    } catch (err) {
      fail(err);
    } finally {
      lock(false);
    }
  });

  $('[data-resend]', modal).addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return showStep('join');
    lock(true);
    try {
      await sendCode(user);
    } catch (err) {
      fail(err);
    } finally {
      lock(false);
    }
  });

  function fail(err) {
    console.error(err);
    if (err.code?.startsWith('auth/')) return say(authMessage(err), true);
    if (err.code) return say('We couldn’t save your spot. Please try again.', true); // Firestore
    say(err.message || 'Something went wrong. Please try again.', true); // our API's own message
  }

  joinButtons.forEach((b) => b.addEventListener('click', open));
  $$('[data-close]', modal).forEach((b) => b.addEventListener('click', close));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  $$('[data-signout]', modal).forEach((b) => b.addEventListener('click', async () => {
    await signOut(auth);
    markJoined(false);
    say('');
    showStep('join');
  }));

  // Coming back from the redirect fallback.
  getRedirectResult(auth).then((cred) => {
    if (!cred) return;
    open();
    return finish(cred);
  }).catch((err) => {
    open();
    fail(err);
  });

  // Returning visitors: show they're already in line (and save the spot if an earlier save failed).
  onAuthStateChanged(auth, (user) => {
    const ok = !!user && isVerified(user);
    markJoined(ok);
    if (ok && !joining) saveSpot(user, user.providerData[0]?.providerId || 'password').catch(() => {});
  });

  const params = new URLSearchParams(location.search);
  if (params.has('join') || params.has('auth')) {
    history.replaceState(null, '', location.pathname);
    open();
  }

  /* ── Pricing: Max 5× / 10× switch ── */
  const maxCard = $('[data-max]');
  if (maxCard) {
    const toggle = $('.max-toggle', maxCard);
    $$('button', toggle).forEach((b) => b.addEventListener('click', () => {
      const tier = b.dataset.tier;
      toggle.dataset.tier = tier;
      $$('button', toggle).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      $$(`[data-${tier}]`, maxCard).forEach((el) => {
        if (el.tagName === 'IMG') el.src = el.dataset[tier];
        else el.textContent = el.dataset[tier];
      });
    }));
  }

  /* ── Contact: copy the email address ── */
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(b.dataset.copy);
      b.textContent = 'Copied ✓';
    } catch {
      b.textContent = b.dataset.copy;
    }
    setTimeout(() => { b.textContent = 'Copy address'; }, 2000);
  }));

  /* ── "No cookies" note: shown once; remembering that uses localStorage, not a cookie ── */
  let seen = false;
  try { seen = localStorage.getItem('ea-no-cookies') === '1'; } catch {}
  if (!seen) {
    const note = document.createElement('div');
    note.className = 'cookie-note';
    note.setAttribute('role', 'status');
    note.innerHTML = '<span class="cookie-emoji" aria-hidden="true">🍪</span><p><strong>No cookies here.</strong> Experiment AI doesn’t use cookies, so there’s nothing to accept.</p><button type="button" class="btn btn-dark btn-sm">Nice</button>';
    document.body.appendChild(note);
    requestAnimationFrame(() => setTimeout(() => note.classList.add('show'), 900));
    $('button', note).addEventListener('click', () => {
      try { localStorage.setItem('ea-no-cookies', '1'); } catch {}
      note.classList.remove('show');
      setTimeout(() => note.remove(), 500);
    });
  }

  /* ── Cursor spotlight on glass cards ── */
  if (!reduced) {
    $$('.feature, .table-card, .plan, .value, .about-card, .mail-card').forEach((card) => card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--sx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--sy', (e.clientY - r.top) + 'px');
    }));
  }
})();
