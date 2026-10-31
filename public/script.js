import { auth, authMessage, db } from './firebase.js';

const FIRESTORE = 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
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
    ['c', '// every major model, one chat\n'],
    ['k', 'const '], ['', 'models = ['], ['s', '"grok"'], ['', ', '], ['s', '"claude"'], ['', ', '],
    ['s', '"gemini"'], ['', ', '], ['s', '"chatgpt"'], ['', ', '], ['s', '"muse"'], ['', '];\n\n'],
    ['k', 'export async function '], ['f', 'ask'], ['', '(model, task) {\n'],
    ['', '  '], ['k', 'return '], ['f', 'experiment'], ['', '(model).'], ['f', 'run'], ['', '(task);\n'],
    ['', '}\n\n'],
    ['f', 'ask'], ['', '('], ['s', '"claude"'], ['', ', '], ['s', '"fix this bug"'], ['', ');'],
  ];

  /* ── Waitlist: Google, or email + password (Firebase Auth). Email sign-ups confirm a 6-digit code that
        api/send-code emails from noreply@experimentai.dev (api/verify-code checks it). Spot saved to waitlist/{uid}. ── */
  const modal = $('#auth');
  const msg = $('.form-msg', modal);
  const joinButtons = $$('[data-auth]');
  joinButtons.forEach((b) => { b.dataset.label = b.innerHTML; });
  let planButtons = null; // set by the pricing section below: Current / Change / Upgrade on the plan cards
  const showToast = (text) => {
    $('.toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'toast glass';
    toast.setAttribute('role', 'status');
    toast.textContent = text;
    document.body.append(toast);
    setTimeout(() => toast.remove(), 6000);
  };
  let lastFocus = null;

  // Google already verifies its emails; email + password accounts verify with our code.
  const isVerified = (user) => user.emailVerified || user.providerData.some((p) => p.providerId === 'google.com');

  const say = (text, isErr = false) => {
    msg.textContent = text;
    msg.classList.toggle('err', isErr);
  };
  const showStep = (step) => { modal.dataset.step = step; };
  // Sign up or Log in: one box, different title, fields and button (.for-signup / .for-login in the markup).
  const setMode = (mode) => {
    modal.dataset.mode = mode;
    $('input[name="password"]', modal).autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    say('');
  };

  const open = (mode = 'signup') => {
    lastFocus = document.activeElement;
    setMode(mode);
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
      if (b.closest('.plan')) return; // the pricing cards: planButtons
      b.innerHTML = !joined ? b.dataset.label
        : b.dataset.auth === 'login' ? b.dataset.label : 'Open app <span class="arrow">→</span>'; // Log in buttons hide when signed in
    });
    planButtons?.();
  }

  // Firestore is only needed at sign-up, so it loads on demand. One save per person, however many callers.
  const saves = new Map();
  function saveSpot(user, providerId) {
    if (!saves.has(user.uid)) {
      saves.set(user.uid, writeSpot(user, providerId).catch((err) => { saves.delete(user.uid); throw err; }));
    }
    return saves.get(user.uid);
  }
  // Each new spot takes the next number in line: the entry and meta/waitlist's counter are written together
  // (firestore.rules only allows the counter to go up by one, alongside the person's own new entry).
  async function writeSpot(user, providerId) {
    const { doc, runTransaction, serverTimestamp } = await import(FIRESTORE);
    const ref = doc(db, 'waitlist', user.uid);
    const counter = doc(db, 'meta', 'waitlist');
    await runTransaction(db, async (tx) => {
      if ((await tx.get(ref)).exists()) return;
      const snap = await tx.get(counter);
      const position = (snap.exists() ? snap.data().count : 0) + 1;
      tx.set(counter, { count: position });
      tx.set(ref, {
        name: (user.displayName || '').slice(0, 100),
        email: user.email ?? null,
        provider: providerId,
        joinedAt: serverTimestamp(),
        position,
      });
    });
  }

  async function finish(cred) {
    await saveSpot(cred.user, cred.providerId);
    if (location.pathname !== '/home') {
      say('✦ You’re in. Opening Experiment AI…');
      location.href = '/home';
      return;
    }
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

  // Sign up creates the account (an email that already has one just logs in); Log in only logs in.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return say('Enter a valid email.', true);
    if (password.length < 8) return say('Password needs at least 8 characters.', true);

    lock(true);
    const login = modal.dataset.mode === 'login';
    say(login ? 'Logging you in…' : 'Creating your account…');
    try {
      let cred;
      if (login) cred = await signInWithEmailAndPassword(auth, email, password);
      else {
        try {
          cred = await createUserWithEmailAndPassword(auth, email, password);
          if (name) await updateProfile(cred.user, { displayName: name.slice(0, 60) });
        } catch (err) {
          if (err.code !== 'auth/email-already-in-use') throw err;
          cred = await signInWithEmailAndPassword(auth, email, password);
        }
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
    if (err.code) return say('We couldn’t finish signing you in. Please try again.', true); // Firestore
    say(err.message || 'Something went wrong. Please try again.', true); // our API's own message
  }

  // Already signed in? The buttons open the app instead.
  joinButtons.forEach((b) => b.addEventListener('click', () => {
    const joined = document.body.classList.contains('joined');
    if (joined && b.closest('.plan')) return showToast('Plan changes open at launch.');
    if (joined) location.href = '/home';
    else open(b.dataset.auth === 'login' ? 'login' : 'signup');
  }));
  $$('[data-mode]', modal).forEach((b) => b.addEventListener('click', () => {
    setMode(b.dataset.mode);
    $('input[name="email"]', modal).focus();
  }));
  $$('[data-close]', modal).forEach((b) => b.addEventListener('click', close));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });

  $$('[data-signout]', modal).forEach((b) => b.addEventListener('click', async () => {
    await signOut(auth);
    if (location.pathname === '/home') return location.replace('/');
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

  // Returning visitors: anyone already in line goes to /home (and the spot is saved if an earlier save failed).
  const onHome = location.pathname === '/home';
  onAuthStateChanged(auth, (user) => {
    const ok = !!user && isVerified(user);
    markJoined(ok);
    if (onHome) return showHome(user, ok);
    if (ok && !joining) {
      const saved = saveSpot(user, user.providerData[0]?.providerId || 'password');
      if (location.pathname === '/') saved.then(() => location.replace('/home')).catch(() => {});
      else saved.catch(() => {});
    }
  });

  /* ── /home: your place in line ── */
  async function showHome(user, ok) {
    if (!ok) return location.replace('/?join'); // not signed in, or email not confirmed yet
    const first = (user.displayName || '').split(' ')[0];
    $('.home-name').textContent = first ? `, ${first}` : '';
    $('.home-email').textContent = user.email || 'you';
    try {
      await saveSpot(user, user.providerData[0]?.providerId || 'password');
      const { doc, getDoc } = await import(FIRESTORE);
      const position = (await getDoc(doc(db, 'waitlist', user.uid))).data()?.position;
      if (!position) throw new Error('No position on this entry');
      $('.place').textContent = position.toLocaleString();
      $('.place-ahead').textContent = position === 1 ? 'You’re first in line!'
        : `${(position - 1).toLocaleString()} ${position === 2 ? 'person' : 'people'} ahead of you`;
    } catch (err) {
      console.error(err);
      $('.place-number').hidden = true;
      $('.place-ahead').textContent = 'You’re on the list. We couldn’t load your number just now.';
    }
    document.body.classList.remove('auth-pending');
  }
  $$('[data-page-signout]').forEach((b) => b.addEventListener('click', async () => {
    await signOut(auth);
    location.replace('/');
  }));

  const params = new URLSearchParams(location.search);
  if (params.has('join') || params.has('auth') || params.has('login')) {
    history.replaceState(null, '', location.pathname);
    open(params.has('login') ? 'login' : 'signup');
  }
  // After deleting an account in the app
  if (params.has('deleted')) {
    history.replaceState(null, '', location.pathname);
    showToast('Your account has been deleted.');
  }

  /* ── Pricing: Monthly / Yearly (yearly = 12 months for the price of 10) and Max 5× / 10×.
        Prices count to their new value; the Max icon, notes and "/ month" text crossfade. ── */
  const maxCard = $('[data-max]');
  const billing = $('.billing');
  if (maxCard && billing) {
    const toggle = $('.max-toggle', maxCard);
    const icon = $('img[data-5x]', maxCard);
    const note = $('.plan-note', maxCard);
    [icon.dataset['5x'], icon.dataset['10x']].forEach((src) => { new Image().src = src; }); // no flash on first switch
    const state = { billing: 'monthly', tier: '5x' };
    const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
    const prices = $$('.price b[data-monthly]').map((b) => ({
      b, unit: b.nextElementSibling, sub: $('.price-sub', b.closest('.plan')),
      max: b.closest('[data-max]') === maxCard, shown: { n: Number(b.dataset.monthly) },
    }));
    const swap = (el, apply) => {
      gsap.killTweensOf(el);
      gsap.timeline()
        .to(el, { autoAlpha: 0, y: -6, scale: el === icon ? 0.9 : 1, duration: 0.16, ease: 'power2.in' })
        .add(apply)
        .fromTo(el, { y: 6 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'power3.out' });
    };
    const render = () => prices.forEach((p) => {
      const monthly = Number(p.max ? p.b.dataset[state.tier] : p.b.dataset.monthly);
      const yearly = state.billing === 'yearly';
      const target = yearly ? monthly * 10 : monthly;
      const unit = yearly ? '/ year' : '/ month';
      const sub = yearly ? `$${(monthly * 10 / 12).toFixed(2)} a month, billed yearly` : 'Billed monthly';
      if (target === p.shown.n) return;
      if (reduced) {
        p.b.textContent = money(target);
        p.unit.textContent = unit;
        p.sub.textContent = sub;
        p.shown.n = target;
        return;
      }
      gsap.killTweensOf(p.shown);
      gsap.to(p.shown, { n: target, duration: 0.7, ease: 'power3.out', onUpdate: () => { p.b.textContent = money(p.shown.n); } });
      gsap.fromTo(p.b, { scale: 1.06 }, { scale: 1, duration: 0.5, ease: 'power3.out', transformOrigin: 'left bottom', overwrite: 'auto' });
      if (p.unit.textContent !== unit) swap(p.unit, () => { p.unit.textContent = unit; });
      if (p.sub.textContent !== sub) swap(p.sub, () => { p.sub.textContent = sub; });
    });
    const radio = (group, b) => $$('button', group).forEach((x) => x.setAttribute('aria-checked', String(x === b)));

    $$('button', billing).forEach((b) => b.addEventListener('click', () => {
      if (state.billing === b.dataset.billing) return;
      state.billing = billing.dataset.billing = b.dataset.billing;
      radio(billing, b);
      render();
    }));
    $$('button', toggle).forEach((b) => b.addEventListener('click', () => {
      const tier = b.dataset.tier;
      if (state.tier === tier) return;
      state.tier = toggle.dataset.tier = tier;
      radio(toggle, b);
      if (reduced) {
        icon.src = icon.dataset[tier];
        note.textContent = note.dataset[tier];
      } else {
        swap(icon, () => { icon.src = icon.dataset[tier]; });
        swap(note, () => { note.textContent = note.dataset[tier]; });
      }
      render();
      planButtons?.();
    }));

    // Signed in: your plan's card says Current, cheaper plans Change, pricier ones Upgrade. Plans aren't connected
    // yet, so everyone is on Free; on localhost, ?plan=light|pro|max-5x|max-10x previews another plan.
    const PLAN_ORDER = ['free', 'light', 'pro', 'max-5x', 'max-10x'];
    const preview = location.hostname === 'localhost' && new URLSearchParams(location.search).get('plan');
    const myPlan = PLAN_ORDER.includes(preview) ? preview : 'free';
    const cardPlan = (card) => (card === maxCard ? `max-${state.tier}` : $('.plan-icon', card).getAttribute('src').match(/(\w+)\.svg$/)[1]);
    planButtons = () => {
      const signedIn = document.body.classList.contains('joined');
      $$('.plan').forEach((card) => {
        const b = $('[data-auth]', card);
        b.dataset.cls ??= b.className;
        if (!signedIn) {
          b.className = b.dataset.cls;
          b.innerHTML = b.dataset.label;
          b.disabled = false;
          return;
        }
        const diff = PLAN_ORDER.indexOf(cardPlan(card)) - PLAN_ORDER.indexOf(myPlan);
        b.disabled = diff === 0;
        b.textContent = diff === 0 ? 'Current' : diff > 0 ? 'Upgrade' : 'Change';
        b.className = `btn btn-lg full ${diff > 0 ? 'btn-dark' : 'btn-ghost'}`;
      });
    };
    if (myPlan === 'max-10x') $('[data-tier="10x"]', toggle).click(); // show their Max level
    planButtons();
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
