// Personal settings, kept server-side in Firestore profiles/{uid} (no Firestore rule lets a browser touch it; the app
// reads and writes through api/settings.js). The chat uses some of them in its instructions to the model.
import { HttpError, db } from './_shared.js';
import { MODELS } from './_ai.js';

const oneOf = (...values) => (v) => (values.includes(v) ? v : undefined);
const text = (max) => (v) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const bool = (v) => (typeof v === 'boolean' ? v : undefined);

// Every setting the app can save, with how it's checked. Anything else is ignored.
export const FIELDS = {
  nickname: text(40), // what the AI calls you
  about: text(1500), // "About you", given to the AI
  instructions: text(3000), // "How should Experiment AI respond?"
  style: oneOf('balanced', 'concise', 'detailed', 'friendly', 'formal'),
  language: text(40), // reply language; empty = match the person
  defaultModel: (v) => (typeof v === 'string' && v in MODELS ? v : undefined),
  defaultEffort: oneOf('low', 'medium', 'high'),
  memoryDefault: bool,
  theme: oneOf('auto', 'day', 'night'),
  textSize: oneOf('small', 'default', 'large', 'xlarge'),
  sendKey: oneOf('enter', 'mod-enter'),
  reduceMotion: bool,
  greetings: bool, // rotating creative greetings (off = plain "Good evening")
};
const AVATAR_MAX = 200_000; // characters of data URL (~150 KB image); the app sends a 256×256 JPEG of ~20–40 KB

const ref = (uid) => db().collection('profiles').doc(uid);

export async function readProfile(uid) {
  return (await ref(uid).get()).data() || {};
}

/* ── Birthday: asked once at sign-up (or in the app), stored as YYYY-MM-DD and never changeable by the person.
      Under 13: no account (COPPA). 13–17: a teen account with stricter AI rules and no paid plans. ── */
export function validBirthDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 1900 && d <= new Date();
}
export function ageOn(birthDate, now = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  const mm = now.getUTCMonth() + 1;
  return now.getUTCFullYear() - y - (mm < m || (mm === m && now.getUTCDate() < d) ? 1 : 0);
}
export const isTeen = (profile) => Boolean(profile?.birthDate) && ageOn(profile.birthDate) < 18;
export async function saveBirthDate(uid, birthDate) {
  await ref(uid).set({ birthDate, updatedAt: new Date() }, { merge: true });
}

export async function saveSettings(uid, patch) {
  if (!patch || typeof patch !== 'object') throw new HttpError(400, 'Nothing to save.');
  const clean = {};
  for (const [key, check] of Object.entries(FIELDS)) {
    if (!(key in patch)) continue;
    const value = check(patch[key]);
    if (value === undefined) throw new HttpError(400, `That ${key} setting isn’t valid.`);
    clean[key] = value;
  }
  if (!Object.keys(clean).length) throw new HttpError(400, 'Nothing to save.');
  await ref(uid).set({ ...clean, updatedAt: new Date() }, { merge: true });
  return clean;
}

export async function saveAvatar(uid, image) {
  if (image === null) {
    await ref(uid).set({ avatar: null, updatedAt: new Date() }, { merge: true });
    return null;
  }
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
    throw new HttpError(400, 'That picture couldn’t be read. Try a JPEG or PNG.');
  }
  if (image.length > AVATAR_MAX) throw new HttpError(413, 'That picture is too big. Try a smaller one.');
  await ref(uid).set({ avatar: image, updatedAt: new Date() }, { merge: true });
  return image;
}

/* ── Memory: things Experiment AI remembers about the person, [{ id, text, at }], newest first. They add, edit and
      delete them in Settings → Memory (or "Remember this" in a chat); chats with Memory on get them. ── */
export const MEMORY_MAX = 100;
const MEMORY_TEXT = 400;
export async function saveMemories(uid, list) {
  if (!Array.isArray(list)) throw new HttpError(400, 'Memory must be a list.');
  if (list.length > MEMORY_MAX) throw new HttpError(400, `Memory holds up to ${MEMORY_MAX} things. Delete some first.`);
  const seen = new Set();
  const clean = list.map((m) => {
    const text = typeof m?.text === 'string' ? m.text.trim().slice(0, MEMORY_TEXT) : '';
    if (!text) throw new HttpError(400, 'A memory can’t be empty.');
    let id = typeof m.id === 'string' && /^[a-z0-9-]{6,40}$/i.test(m.id) ? m.id : crypto.randomUUID();
    if (seen.has(id)) id = crypto.randomUUID();
    seen.add(id);
    const at = Number.isFinite(m.at) ? m.at : Date.now();
    return { id, text, at };
  });
  await ref(uid).set({ memories: clean, updatedAt: new Date() }, { merge: true });
  return clean;
}

// The settings part of the model's instructions (empty when nothing's set).
const STYLES = {
  concise: 'Keep answers short and to the point.',
  detailed: 'Give thorough, detailed answers with examples where useful.',
  friendly: 'Be warm, casual and encouraging.',
  formal: 'Keep a professional, formal tone.',
};
export function promptFromProfile(profile, user, { memory = false } = {}) {
  const lines = [];
  const name = (profile.nickname || user.displayName || '').trim();
  if (name) lines.push(`The person you're talking with likes to be called ${name}.`);
  if (STYLES[profile.style]) lines.push(STYLES[profile.style]);
  if (profile.language) lines.push(`Reply in ${profile.language} unless asked otherwise.`);
  if (profile.about) lines.push(`What they've told you about themselves:\n${profile.about}`);
  if (profile.instructions) lines.push(`How they'd like you to respond:\n${profile.instructions}`);
  if (memory && profile.memories?.length) {
    lines.push(`Things they've asked you to remember (use them when relevant; don't list them back unprompted):\n${profile.memories.map((m) => `- ${m.text}`).join('\n')}`);
  }
  return lines.join('\n\n');
}
