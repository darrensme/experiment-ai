// Shared pieces for the AI functions (chat, usage): plans and their budgets, the models each plan can use, who can
// open the app, the Vercel AI Gateway's price list, and the day/week spending kept in Firestore.
import { createHash } from 'node:crypto';
import { HttpError, db } from './_shared.js';

export const GATEWAY = 'https://ai-gateway.vercel.sh/v1';

/* ── Plans. Budgets are AI cost in US dollars: a week is the plan's monthly price ÷ 4, a day is that ÷ 7.
      Free counts as $2. A person's plan lives in Firestore at plans/{uid} { plan }, written only by the server
      (later, by the Stripe webhook); no plan document means Free. ── */
export const PLANS = ['free', 'light', 'pro', 'max-5x', 'max-10x'];
const BUDGET_BASE = { free: 2, light: 10, pro: 20, 'max-5x': 100, 'max-10x': 200 };
export const budgetsFor = (plan) => ({ day: BUDGET_BASE[plan] / 4 / 7, week: BUDGET_BASE[plan] / 4 });

export async function planOf(uid) {
  const plan = (await db().collection('plans').doc(uid).get()).data()?.plan;
  return PLANS.includes(plan) ? plan : 'free';
}

/* ── Models: the same list as the picker in public/app.js. minRank 0 = every plan, 1 = Light and up. ── */
export const MODELS = {
  // chat
  'anthropic/claude-fable-5.1': 1, 'anthropic/claude-opus-5.5': 1, 'anthropic/claude-sonnet-5.5': 1, 'anthropic/claude-haiku-5.5': 0,
  'openai/gpt-6-astra': 1, 'openai/gpt-6.1-sol': 1, 'openai/gpt-6.1-terra': 1, 'openai/gpt-6-luna': 0,
  'google/gemini-4-argon': 1, 'google/gemini-3.1-pro-preview': 1, 'google/gemini-3.8-flash': 0, 'google/gemini-3.5-flash-lite': 0,
  'spacexai/grok-4.7': 1, 'spacexai/grok-4.6': 1,
  'meta/muse-wonder-1.0': 1, 'meta/muse-spark-1.3': 1,
  // image (every plan)
  'openai/gpt-image-2.5-flare': 0, 'openai/gpt-image-2.5-sunburst': 0, 'openai/gpt-image-2': 0, 'openai/gpt-image-1.5': 0,
  'google/gemini-nano-banana-2.1': 0, 'google/gemini-3.1-flash-image': 0, 'google/gemini-3.1-flash-lite-image': 0,
  'meta/muse-image-1.0': 0, 'spacexai/grok-imagine-image-2.0': 0, 'spacexai/grok-imagine-image': 0,
  // video (Light and up)
  'google/veo-3.1-generate-001': 1, 'google/veo-3.1-fast-generate-001': 1, 'google/veo-3.1-lite-generate-001': 1,
  'spacexai/grok-imagine-video-1.5': 1, 'spacexai/grok-imagine-video-1.5-lite': 1,
};
const IMAGE = new Set(Object.keys(MODELS).filter((id) => /gpt-image|nano-banana|flash(-lite)?-image|muse-image|imagine-image/.test(id)));
const VIDEO = new Set(Object.keys(MODELS).filter((id) => /veo-|imagine-video/.test(id)));
export const kindOf = (id) => (IMAGE.has(id) ? 'image' : VIDEO.has(id) ? 'video' : 'chat');
export const EFFORTS = ['low', 'medium', 'high']; // High is Light and up

/* ── Access: only these accounts can use the app for now (SHA-256 of the lower-case email, the same list as
      APP_ACCESS in public/app.js). Add more with the APP_ACCESS_HASHES env var, comma-separated. ── */
const ACCESS = new Set([
  'ae3ae4132254ca107278d03a30f1ecdfee4d322a2c29f5415e22677ef4e6485c',
  ...(process.env.APP_ACCESS_HASHES || '').split(',').map((s) => s.trim()).filter(Boolean),
]);
const emailHash = (user) => user.email && createHash('sha256').update(user.email.trim().toLowerCase()).digest('hex');
const isVerified = (user) => user.emailVerified || user.providerData.some((p) => p.providerId === 'google.com');
// Settings and Usage are for every signed-in account with a confirmed email (the AI itself still needs access).
export function requireVerified(user) {
  if (!isVerified(user)) throw new HttpError(403, 'Please confirm your email first.');
}
export function requireAccess(user) {
  if (!isVerified(user) || !ACCESS.has(emailHash(user))) throw new HttpError(403, 'Experiment AI isn’t open to your account yet.');
}

/* ── Unlimited: no daily/weekly limit and every model and effort, whatever the plan (spending is still recorded).
      The owner's account (same hash as above); add more with UNLIMITED_HASHES, comma-separated. ── */
const UNLIMITED = new Set([
  'ae3ae4132254ca107278d03a30f1ecdfee4d322a2c29f5415e22677ef4e6485c',
  ...(process.env.UNLIMITED_HASHES || '').split(',').map((s) => s.trim()).filter(Boolean),
]);
export const isUnlimited = (user) => isVerified(user) && UNLIMITED.has(emailHash(user));

/* ── The Gateway's model list (public): per-token prices and the effort levels each model takes. Cached for an hour. ── */
let catalog = null;
let catalogAt = 0;
export async function modelInfo(id) {
  if (!catalog || Date.now() - catalogAt > 3600_000) {
    const res = await fetch(`${GATEWAY}/models`);
    if (!res.ok) throw new HttpError(502, 'Couldn’t reach the AI right now. Please try again.');
    catalog = new Map((await res.json()).data.map((m) => [m.id, m]));
    catalogAt = Date.now();
  }
  const m = catalog.get(id);
  if (!m?.pricing) throw new HttpError(400, 'That model isn’t available right now. Pick another one.');
  return m;
}

// Some models take fewer effort levels (Gemini 3.5 Flash Lite: low or high). Use the asked one, else the next one down.
export function effortFor(model, wanted) {
  const levels = model.reasoning_options?.find((o) => o.type === 'effort')?.values;
  if (!levels) return null;
  for (const e of EFFORTS.slice(0, EFFORTS.indexOf(wanted) + 1).reverse()) if (levels.includes(e)) return e;
  return levels.includes('low') ? 'low' : null;
}

// Price per token for a request of this size (some models cost more past a long-context threshold).
function rate(pricing, key, promptTokens) {
  const tier = (pricing[`${key}_tiers`] || []).find((t) => promptTokens >= t.min && (t.max == null || promptTokens < t.max));
  return Number(tier?.cost ?? pricing[key] ?? 0);
}
export const outputRate = (model, promptTokens = 0) => rate(model.pricing, 'output', promptTokens);
export const inputRate = (model, promptTokens = 0) => rate(model.pricing, 'input', promptTokens);

// Dollars for one reply from the Gateway's token counts, at list price. Cached prompt tokens are cheaper.
export function costOf(model, usage) {
  const prompt = usage.prompt_tokens || 0;
  const cached = usage.prompt_tokens_details?.cached_tokens || 0;
  const cacheRate = model.pricing.input_cache_read != null ? rate(model.pricing, 'input_cache_read', prompt) : inputRate(model, prompt);
  return (prompt - cached) * inputRate(model, prompt) + cached * cacheRate + (usage.completion_tokens || 0) * outputRate(model, prompt);
}

/* ── Spending: usage/{uid} { dayKey, day, weekKey, week } in dollars. Days and weeks are UTC; a week starts Monday.
      Server-only (no Firestore rule lets a browser read or write it). ── */
export function periodKeys(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7));
  return { day, week: monday.toISOString().slice(0, 10) };
}
// `models` is this week's cost per model (keys are model IDs with "/" and "." as "_"), for the Usage breakdown.
const current = (data, keys) => ({
  day: data?.dayKey === keys.day ? data.day : 0,
  week: data?.weekKey === keys.week ? data.week : 0,
  models: data?.weekKey === keys.week ? data.models || {} : {},
});
export const modelKey = (id) => id.replace(/[./]/g, '_');

export async function readSpent(uid) {
  return current((await db().collection('usage').doc(uid).get()).data(), periodKeys());
}

// Add `amount` dollars (negative to give some back) to today and this week, in one transaction; `model` and `cost`
// also add the reply's real cost to that model's line for the week. Returns the new totals.
export async function addSpent(uid, amount, model = null, cost = 0) {
  const ref = db().collection('usage').doc(uid);
  return db().runTransaction(async (tx) => {
    const keys = periodKeys();
    const now = current((await tx.get(ref)).data(), keys);
    const models = { ...now.models };
    if (model && cost > 0) models[modelKey(model)] = (models[modelKey(model)] || 0) + cost;
    const next = { day: Math.max(0, now.day + amount), week: Math.max(0, now.week + amount), models };
    tx.set(ref, { dayKey: keys.day, day: next.day, weekKey: keys.week, week: next.week, models, updatedAt: new Date() });
    return next;
  });
}

// Before a reply: check the limits and hold back the most it could cost (up to what's left), so two chats at once
// can't overspend. Returns the dollars held; the reply's length is then capped to fit them.
export async function reserve(uid, plan, most) {
  const ref = db().collection('usage').doc(uid);
  const budgets = budgetsFor(plan);
  return db().runTransaction(async (tx) => {
    const keys = periodKeys();
    const now = current((await tx.get(ref)).data(), keys);
    if (now.week >= budgets.week) throw new HttpError(429, 'You’ve reached this week’s usage limit. It resets on Monday (UTC).');
    if (now.day >= budgets.day) throw new HttpError(429, 'You’ve reached today’s usage limit. It resets at midnight UTC.');
    const held = Math.min(most, budgets.day - now.day, budgets.week - now.week);
    tx.set(ref, { dayKey: keys.day, day: now.day + held, weekKey: keys.week, week: now.week + held, models: now.models, updatedAt: new Date() });
    return held;
  });
}
