// POST /api/chat { model, effort, messages: [{ role: 'user' | 'assistant', content }] }
// Sends the chat to the chosen model through the Vercel AI Gateway (key: VERCEL_AI_GATEWAY) and streams the reply back
// as JSON lines: { type: 'text', text } … then { type: 'done', spent, budgets } or { type: 'error', error }.
// Checks first: signed in, allowed into the app, the plan allows this model and effort, and today's and this week's
// budgets aren't used up. The most the reply could cost is held back before it starts, and the real cost (from the
// Gateway's token counts at list price) replaces it at the end. Unlimited accounts skip the plan and budget checks;
// their spending is still recorded.
import { HttpError, handle, requireUser } from './_shared.js';
import {
  EFFORTS, GATEWAY, MODELS, PLANS, addSpent, budgetsFor, costOf, effortFor, inputRate, isUnlimited, modelInfo,
  outputRate, planOf, requireAccess, reserve,
} from './_ai.js';
import { promptFromProfile, readProfile } from './_profile.js';

const MAX_MESSAGES = 40;
const MAX_CHARS = 120_000; // the whole conversation sent with each message
const MAX_REPLY_TOKENS = 16_000; // includes the model's thinking
const MIN_REPLY_TOKENS = 400; // below this the reply would be cut off almost at once

// The model's instructions: who it is, plus the person's own settings (name, style, language, about, instructions).
const system = (personal = '') => [
  `You are Experiment AI, an assistant made by Experiment Labs. Be helpful, clear and honest. Today is ${new Date().toISOString().slice(0, 10)}.`,
  personal,
].filter(Boolean).join('\n\n');

function readMessages(body) {
  const list = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = list
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
  if (!messages.length || messages.at(-1).role !== 'user') throw new HttpError(400, 'Write a message first.');
  let chars = 0;
  for (let i = messages.length - 1; i >= 0; i--) { // keep the newest messages that fit
    chars += messages[i].content.length;
    if (chars > MAX_CHARS) {
      if (i === messages.length - 1) throw new HttpError(413, 'That message is too long. Try a shorter one.');
      return messages.slice(i + 1);
    }
  }
  return messages;
}

export default handle(async (req, res) => {
  const key = process.env.VERCEL_AI_GATEWAY;
  if (!key) throw new HttpError(503, 'Experiment AI isn’t switched on yet. Please try again later.');

  const user = await requireUser(req);
  requireAccess(user);
  const [plan, profile] = await Promise.all([planOf(user.uid), readProfile(user.uid)]);
  const unlimited = isUnlimited(user);
  const rank = unlimited ? PLANS.length - 1 : PLANS.indexOf(plan);
  // Memory is for Light and up; it's used only when the chat has it switched on.
  const instructions = system(promptFromProfile(profile, user, { memory: req.body?.memory === true && rank >= 1 }));

  const id = String(req.body?.model || '');
  if (!(id in MODELS)) throw new HttpError(400, id ? 'That model isn’t available yet. Pick another one.' : 'Pick a model first.');
  if (MODELS[id] > rank) throw new HttpError(403, 'That model comes with Light and up.');
  const wanted = String(req.body?.effort || 'medium').toLowerCase();
  if (!EFFORTS.includes(wanted)) throw new HttpError(400, 'Pick Low, Medium or High effort.');
  if (wanted === 'high' && rank < 1) throw new HttpError(403, 'High effort comes with Light and up.');
  const messages = readMessages(req.body);

  // Hold back the most this reply could cost (a generous guess at the prompt size + the longest reply), up to what's left.
  const model = await modelInfo(id);
  const promptGuess = Math.ceil((instructions.length + messages.reduce((n, m) => n + m.content.length, 0)) / 3) + 50 * messages.length;
  const inCost = promptGuess * inputRate(model, promptGuess);
  const perOut = outputRate(model, promptGuess) || 1e-9;
  const held = unlimited ? 0 : await reserve(user.uid, plan, inCost + MAX_REPLY_TOKENS * perOut);
  const maxTokens = unlimited ? MAX_REPLY_TOKENS : Math.min(MAX_REPLY_TOKENS, Math.floor((held - inCost) / perOut));
  if (maxTokens < MIN_REPLY_TOKENS) {
    await addSpent(user.uid, -held);
    throw new HttpError(429, 'You’re almost at your usage limit. Try a smaller model, or wait for it to reset.');
  }

  const abort = new AbortController();
  // they closed the page mid-answer: stop the model too (the request's own 'close' fires as soon as its body is read)
  res.on('close', () => { if (!res.writableFinished) abort.abort(); });
  const effort = effortFor(model, wanted);
  let upstream;
  try {
    upstream = await fetch(`${GATEWAY}/chat/completions`, {
      method: 'POST',
      signal: abort.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: id,
        messages: [{ role: 'system', content: instructions }, ...messages],
        max_tokens: maxTokens,
        ...(effort && { reasoning: { effort } }),
        stream: true,
        stream_options: { include_usage: true },
        user: user.uid,
      }),
    });
  } catch {
    await addSpent(user.uid, -held);
    throw new HttpError(502, 'Couldn’t reach the AI right now. Please try again.');
  }
  if (!upstream.ok) {
    await addSpent(user.uid, -held);
    console.error('gateway', upstream.status, (await upstream.text()).slice(0, 500));
    throw new HttpError(502, upstream.status === 429 ? 'The AI is busy right now. Try again in a moment.' : 'The AI couldn’t answer right now. Please try again.');
  }

  // From here the answer streams, so errors go into the stream instead of the status code.
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('X-Accel-Buffering', 'no');
  const send = (obj) => { if (!res.writableEnded) res.write(`${JSON.stringify(obj)}\n`); };

  let usage = null;
  let written = 0; // characters of answer, to estimate the cost if the Gateway never sends token counts
  let failed = null;
  try {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of upstream.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let event;
        try { event = JSON.parse(data); } catch { continue; }
        if (event.error) failed = event.error.message || 'The AI stopped unexpectedly.';
        if (event.usage) usage = event.usage;
        const text = event.choices?.[0]?.delta?.content;
        if (text) {
          written += text.length;
          send({ type: 'text', text });
        }
      }
    }
  } catch (err) {
    if (!abort.signal.aborted) failed = 'The answer was cut off. Please try again.';
  }

  // Swap the hold for what it really cost.
  const cost = usage ? costOf(model, usage) : inCost + Math.ceil(written / 3) * perOut;
  try {
    const spent = await addSpent(user.uid, cost - held, id, cost);
    if (failed) send({ type: 'error', error: failed });
    send({ type: 'done', spent, budgets: budgetsFor(plan), unlimited });
  } catch (err) {
    console.error('usage', err);
    send({ type: 'error', error: failed || 'Your usage couldn’t be updated. Refresh the page.' });
  }
  res.end();
});
