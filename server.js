import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, q } from './db.js';

const scrypt = promisify(scryptCb);
const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const SECURE_COOKIE = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 30;
const COOKIE = 'ea_session';

const MODELS = {
  auto: 'Auto',
  grok: 'Grok',
  claude: 'Claude',
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  muse: 'Meta Muse',
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
};

/* ───────── Passwords + sessions ───────── */

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

// Compared against when the email doesn't exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

async function verifyPassword(password, stored) {
  const [, saltB64, keyB64] = stored.split('$');
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(key, expected);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function startSession(res, userId) {
  const token = randomBytes(32).toString('base64url');
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  q.createSession.run(sha256(token), userId, Date.now() + maxAge * 1000);
  setCookie(res, `${COOKIE}=${token}; Max-Age=${maxAge}`);
}

function setCookie(res, value) {
  res.setHeader('Set-Cookie', `${value}; Path=/; HttpOnly; SameSite=Lax${SECURE_COOKIE ? '; Secure' : ''}`);
}

function sessionToken(req) {
  const match = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

function currentUser(req) {
  const token = sessionToken(req);
  if (!token) return null;
  const s = q.session.get(sha256(token));
  if (!s || s.expires_at < Date.now()) return null;
  return q.userById.get(s.user_id) || null;
}

const publicUser = (u) => ({ name: u.name, email: u.email, createdAt: u.created_at });

/* ───────── Rate limiting (login + signup) ───────── */

const attempts = new Map();
const LIMIT = 10;
const WINDOW_MS = 15 * 60 * 1000;

function rateLimited(req) {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.reset < now) {
    attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

/* ───────── Placeholder replies ─────────
   TODO: connect the real models here. `pickModel` is a keyword stub for "Auto" routing. */

function pickModel(text) {
  const t = text.toLowerCase();
  if (/\b(code|bug|debug|function|script|api|error)\b/.test(t)) return 'claude';
  if (/\b(image|picture|draw|logo|photo|design)\b/.test(t)) return 'chatgpt';
  if (/\b(news|trending|latest|today|x\.com|twitter)\b/.test(t)) return 'grok';
  if (/\b(schedule|plan|calendar|meeting|week|email)\b/.test(t)) return 'gemini';
  return 'muse';
}

function reply(text, model) {
  const chosen = model === 'auto' ? pickModel(text) : model;
  const via = model === 'auto' ? `Auto picked ${MODELS[chosen]} for this one.` : `You asked ${MODELS[chosen]}.`;
  return {
    model: chosen,
    content: `${via} The models aren't connected yet, so this is a placeholder reply — but your message is saved and will be here next time you log in.`,
  };
}

/* ───────── HTTP helpers ───────── */

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

const json = (res, status, data) =>
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });

const redirect = (res, location) => send(res, 302, '', { Location: location });

async function readJson(req) {
  // JSON-only bodies: a cross-site <form> can't send this content type, which (with SameSite=Lax) blocks CSRF.
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Send JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16 * 1024) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function serveFile(res, file, status = 200) {
  try {
    const body = await readFile(file);
    const isAsset = file.includes(`${sep}assets${sep}`);
    send(res, status, body, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
    });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
}

/* ───────── Routes ───────── */

const api = {
  'POST /api/signup': async (req, res) => {
    if (rateLimited(req)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const body = await readJson(req);
    const name = str(body.name);
    const email = str(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!name || name.length > 60) throw new HttpError(400, 'Enter your name.');
    if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email.');
    if (password.length < 8 || password.length > 200) throw new HttpError(400, 'Password needs at least 8 characters.');
    if (q.userByEmail.get(email)) throw new HttpError(409, 'An account with that email already exists. Try logging in.');

    const { lastInsertRowid } = q.createUser.run(name, email, await hashPassword(password), Date.now());
    startSession(res, Number(lastInsertRowid));
    json(res, 201, { user: publicUser(q.userById.get(lastInsertRowid)) });
  },

  'POST /api/login': async (req, res) => {
    if (rateLimited(req)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
    const body = await readJson(req);
    const email = str(body.email).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const user = q.userByEmail.get(email);
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, 'Email or password is incorrect.');

    startSession(res, user.id);
    json(res, 200, { user: publicUser(user) });
  },

  'POST /api/logout': async (req, res) => {
    const token = sessionToken(req);
    if (token) q.deleteSession.run(sha256(token));
    setCookie(res, `${COOKIE}=; Max-Age=0`);
    json(res, 200, { ok: true });
  },

  'GET /api/me': async (req, res) => {
    const user = currentUser(req);
    if (!user) return json(res, 401, { user: null });
    json(res, 200, { user: publicUser(user) });
  },

  'GET /api/messages': async (req, res, user) => {
    json(res, 200, { messages: q.messages.all(user.id).reverse(), models: MODELS });
  },

  'POST /api/messages': async (req, res, user) => {
    const body = await readJson(req);
    const content = str(body.content);
    const model = Object.hasOwn(MODELS, body.model) ? body.model : 'auto';
    if (!content) throw new HttpError(400, 'Message is empty.');
    if (content.length > 4000) throw new HttpError(400, 'Message is too long (4,000 characters max).');

    const now = Date.now();
    const answer = reply(content, model);
    db.exec('BEGIN');
    try {
      q.addMessage.run(user.id, 'user', model, content, now);
      q.addMessage.run(user.id, 'assistant', answer.model, answer.content, now + 1);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    json(res, 201, {
      messages: [
        { role: 'user', model, content, created_at: now },
        { role: 'assistant', model: answer.model, content: answer.content, created_at: now + 1 },
      ],
    });
  },

  'DELETE /api/messages': async (req, res, user) => {
    q.clearMessages.run(user.id);
    json(res, 200, { ok: true });
  },
};

const PUBLIC_API = new Set(['POST /api/signup', 'POST /api/login', 'POST /api/logout', 'GET /api/me']);

const server = createServer(async (req, res) => {
  let path = '/';
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Bad request', { 'Content-Type': 'text/plain' });
  }

  try {
    if (path.startsWith('/api/')) {
      const key = `${req.method} ${path}`;
      const handler = api[key];
      if (!handler) throw new HttpError(404, 'Not found.');
      let user = null;
      if (!PUBLIC_API.has(key)) {
        user = currentUser(req);
        if (!user) throw new HttpError(401, 'Please log in.');
      }
      return await handler(req, res, user);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');

    // The app is members-only.
    if (path === '/app' || path === '/app.html') {
      if (!currentUser(req)) return redirect(res, '/?auth=login');
      if (path === '/app.html') return redirect(res, '/app');
      return serveFile(res, join(PUBLIC, 'app.html'));
    }

    const file = normalize(join(PUBLIC, path === '/' ? 'index.html' : path));
    if (!file.startsWith(PUBLIC + sep)) throw new HttpError(403, 'Forbidden.');
    return serveFile(res, file);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (path.startsWith('/api/')) return json(res, status, { error: status === 500 ? 'Something went wrong.' : err.message });
    send(res, status, status === 500 ? 'Something went wrong.' : err.message, { 'Content-Type': 'text/plain' });
  }
});

q.deleteExpired.run(Date.now());
setInterval(() => q.deleteExpired.run(Date.now()), 60 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Experiment AI is running → http://localhost:${PORT}`);
});
