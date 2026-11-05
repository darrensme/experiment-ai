// POST /api/chat { model, effort, memory, tools?, driveFiles?, messages: [{ role: 'user' | 'assistant', content, files? }] }
// Sends the chat to the chosen model through the Vercel AI Gateway (key: VERCEL_AI_GATEWAY) and streams the reply back
// as JSON lines: { type: 'text', text }, { type: 'tool', label } (a connector or memory is being used),
// { type: 'image', url } (image models), { type: 'video-job', jobId } (video models) … then
// { type: 'done', spent, budgets } or { type: 'error', error }.
// POST /api/chat { action: 'video-status', jobId } → { status: 'pending' | 'completed' | 'error', url?, error? }
// Files people attach (uploaded to Blob first) go to the model too: images as pictures, PDFs as documents, text files
// inlined. With Memory on (Light and up) the model can save things to remember with a save_memory tool.
// Checks first: signed in, allowed into the app, the plan allows this model and effort, and today's and this week's
// budgets aren't used up. The most the reply could cost is held back before it starts; every round (the model may call
// connector tools a few times before answering) has to fit inside that hold, and the real cost (from the Gateway's
// token counts at list price) replaces it at the end. Unlimited accounts skip the plan and budget checks; their
// spending is still recorded.
import { HttpError, handle, requireUser } from './_shared.js';
import {
  EFFORTS, GATEWAY, MODELS, PLANS, addSpent, budgetsFor, costOf, effortFor, inputRate, isUnlimited, kindOf, modelInfo,
  outputRate, planOf, requireAccess, reserve,
} from './_ai.js';
import { MEMORY_MAX, promptFromProfile, readProfile, saveMemories } from './_profile.js';
import { TOOLS } from './_connectors.js';
import { TOOL_DEFS, connectedOf, labelFor, runTool, toolsPrompt } from './_tools.js';
import { checkVideoJob, imagePrice, isBlobUrl, makeImage, partsForFiles, startVideoJob, videoPrice } from './_media.js';

const FILE_ROUNDS = 3; // files from the last 3 messages that have them go to the model (older ones by name only)
const MEMORY_TOOL = {
  type: 'function',
  function: {
    name: 'save_memory',
    description: 'Save one short fact to remember about the person in future chats (a preference, a detail about them, an ongoing project), or something they asked you to remember. Never save passwords or secrets.',
    parameters: { type: 'object', properties: { text: { type: 'string', description: 'The fact, in one short sentence' } }, required: ['text'], additionalProperties: false },
  },
};
async function rememberThis(uid, profile, text) {
  const t = String(text || '').trim().slice(0, 400);
  if (!t) return 'Nothing to save.';
  const list = Array.isArray(profile.memories) ? profile.memories : [];
  if (list.some((m) => m.text.toLowerCase() === t.toLowerCase())) return 'Already remembered.';
  profile.memories = await saveMemories(uid, [{ text: t, at: Date.now() }, ...list].slice(0, MEMORY_MAX));
  return 'Saved.';
}

const MAX_MESSAGES = 40;
const MAX_CHARS = 120_000; // the whole conversation sent with each message
const MAX_REPLY_TOKENS = 16_000; // includes the model's thinking
const MIN_REPLY_TOKENS = 400; // below this the reply would be cut off almost at once
const MAX_ROUNDS = 5; // model → tools → model …; the last round can't call tools, so it has to answer

// The model's instructions: who it is, plus the person's own settings (name, style, language, about, instructions).
const system = (...parts) => [
  `You are Experiment AI, an assistant made by Experiment Labs. Be helpful, clear and honest. Today is ${new Date().toISOString().slice(0, 10)}.`,
  ...parts,
].filter(Boolean).join('\n\n');

function readMessages(body) {
  const list = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const messages = list
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => {
      const files = m.role === 'user' && Array.isArray(m.files)
        ? m.files.filter((f) => isBlobUrl(f?.url)).slice(0, 20).map((f) => ({ url: f.url, name: String(f.name || 'file').slice(0, 200), type: String(f.type || '').slice(0, 100) }))
        : [];
      return { role: m.role, content: m.content, ...(files.length && { files }) };
    });
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
const driveFilesOf = (body) => (Array.isArray(body?.driveFiles) ? body.driveFiles : [])
  .filter((f) => typeof f?.id === 'string' && /^[\w-]{10,}$/.test(f.id))
  .slice(0, 20)
  .map((f) => ({ id: f.id, name: String(f.name || 'file').slice(0, 200) }));

export default handle(async (req, res) => {
  const key = process.env.VERCEL_AI_GATEWAY;
  if (!key) throw new HttpError(503, 'Experiment AI isn’t switched on yet. Please try again later.');

  const user = await requireUser(req);
  requireAccess(user);

  // A video being made: check on it (a failed one gives its cost back)
  if (req.body?.action === 'video-status') {
    const r = await checkVideoJob({ key, uid: user.uid, jobId: String(req.body.jobId || '') });
    if (r.status === 'error' && !r.settled && r.cost > 0 && !isUnlimited(user)) await addSpent(user.uid, -r.cost);
    return res.status(200).json({ status: r.status, url: r.url || null, error: r.error || null });
  }

  const wantedTools = [...new Set((Array.isArray(req.body?.tools) ? req.body.tools : []).filter((t) => TOOLS.includes(t)))];
  const [plan, profile, tools] = await Promise.all([
    planOf(user.uid), readProfile(user.uid), wantedTools.length ? connectedOf(user.uid, wantedTools) : [],
  ]);
  const unlimited = isUnlimited(user);
  const rank = unlimited ? PLANS.length - 1 : PLANS.indexOf(plan);
  // Memory is for Light and up; it's used only when the chat has it switched on.
  const memoryOn = req.body?.memory === true && rank >= 1;
  const instructions = system(
    promptFromProfile(profile, user, { memory: memoryOn }),
    memoryOn && 'Memory is on: when the person shares something worth remembering long-term (a preference, a fact about themselves, an ongoing project) or asks you to remember something, call save_memory with one short sentence. Don’t mention saving unless they asked.',
    toolsPrompt(tools, tools.includes('google') ? driveFilesOf(req.body) : []),
  );
  const toolDefs = [...tools.flatMap((t) => TOOL_DEFS[t]), ...(memoryOn ? [MEMORY_TOOL] : [])];

  const id = String(req.body?.model || '');
  if (!(id in MODELS)) throw new HttpError(400, id ? 'That model isn’t available yet. Pick another one.' : 'Pick a model first.');
  const kind = kindOf(id);
  if (MODELS[id] > rank) throw new HttpError(403, kind === 'video' ? 'Making videos comes with Light and up.' : 'That model comes with Light and up.');
  const wanted = String(req.body?.effort || 'medium').toLowerCase();
  if (!EFFORTS.includes(wanted)) throw new HttpError(400, 'Pick Low, Medium or High effort.');
  if (kind === 'chat' && wanted === 'high' && rank < 1) throw new HttpError(403, 'High effort comes with Light and up.');
  const messages = readMessages(req.body);
  const model = await modelInfo(id);

  /* ── Image and video models: make one from the last message (pictures attached to it are used as a starting point) ── */
  if (kind !== 'chat') {
    const last = messages.at(-1);
    const pictures = (last.files || []).filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type)).map((f) => f.url).slice(0, 4);
    const lines = [];
    const out = (o) => lines.push(`${JSON.stringify(o)}\n`);
    if (kind === 'image') {
      const price = imagePrice(model);
      if (!unlimited && price.most > budgetsFor(plan).day) {
        throw new HttpError(403, 'This image model costs more than your daily limit. Try Muse Image, Grok Imagine Image or Nano Banana, or upgrade for more.');
      }
      const held = unlimited ? 0 : await reserve(user.uid, plan, price.most);
      if (!unlimited && held < price.most * 0.8) { await addSpent(user.uid, -held); throw new HttpError(429, 'You’re almost at your usage limit. Wait for it to reset, or upgrade for more.'); }
      let made;
      try {
        made = await makeImage({ key, uid: user.uid, id, modelType: model.type, prompt: last.content, images: pictures });
      } catch (err) {
        if (held) await addSpent(user.uid, -held);
        throw err;
      }
      const cost = price.of(made.usage);
      const spent = await addSpent(user.uid, cost - held, id, cost);
      out({ type: 'image', url: made.url });
      if (made.text) out({ type: 'text', text: made.text });
      out({ type: 'done', spent, budgets: budgetsFor(plan), unlimited });
    } else {
      const cost = videoPrice(model, id);
      if (!unlimited && cost > budgetsFor(plan).day) {
        throw new HttpError(403, 'This video model costs more than your daily limit. Try Veo 3.1 Lite or Grok Imagine Video Lite, or upgrade for more.');
      }
      const held = unlimited ? 0 : await reserve(user.uid, plan, cost);
      if (!unlimited && held < cost - 1e-6) {
        await addSpent(user.uid, -held);
        throw new HttpError(429, 'A video costs more than what’s left of your usage. Try Veo 3.1 Lite or Grok Imagine Video Lite, or wait for it to reset.');
      }
      let jobId;
      try {
        jobId = await startVideoJob({ key, uid: user.uid, id, prompt: last.content, image: pictures[0], cost: unlimited ? 0 : cost });
      } catch (err) {
        if (held) await addSpent(user.uid, -held);
        console.error('video start', id, err?.message);
        throw new HttpError(502, `The video couldn’t be started${err?.message ? `: ${String(err.message).slice(0, 160)}` : '.'}`);
      }
      // the hold already counted it (unlimited accounts: count it now); the model's line for Usage gets it either way
      const spent = await addSpent(user.uid, unlimited ? cost : 0, id, cost);
      out({ type: 'video-job', jobId });
      out({ type: 'done', spent, budgets: budgetsFor(plan), unlimited });
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    return res.end(lines.join(''));
  }

  // Files from the last few messages that have them: pictures, PDFs and text for the model to read
  const withFiles = messages.map((m, i) => (m.files ? i : -1)).filter((i) => i >= 0).slice(-FILE_ROUNDS);
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m.files) continue;
    const { files, ...rest } = m;
    messages[i] = withFiles.includes(i)
      ? { ...rest, content: [{ type: 'text', text: m.content }, ...(await partsForFiles(files))] }
      : { ...rest, content: `${m.content}\n\n[Attached earlier: ${files.map((f) => f.name).join(', ')}]` };
  }

  // Hold back the most this reply could cost (a generous guess at the prompt size + the longest reply), up to what's left.
  const sizeOf = (content) => (typeof content === 'string' ? content.length / 3 : (content || []).reduce((n, p) => n
    + (p.type === 'text' ? p.text.length / 3 : p.type === 'image_url' ? 1600 : p.type === 'file' ? Math.min(200_000, p.file.data.length * 0.012) : 0), 0));
  const guessTokens = (convo) => Math.ceil(convo.reduce((n, m) => n + sizeOf(m.content) + JSON.stringify(m.tool_calls || '').length / 3, 0)) + 50 * convo.length
    + (toolDefs.length ? Math.ceil(JSON.stringify(toolDefs).length / 3) : 0);
  const convo = [{ role: 'system', content: instructions }, ...messages];
  const promptGuess = guessTokens(convo);
  const inCost = promptGuess * inputRate(model, promptGuess);
  const perOut = outputRate(model, promptGuess) || 1e-9;
  // with tools, leave room for a few rounds of reading results
  const most = (inCost + MAX_REPLY_TOKENS * perOut) * (toolDefs.length ? 2.5 : 1);
  const held = unlimited ? 0 : await reserve(user.uid, plan, most);
  if (!unlimited && Math.floor((held - inCost) / perOut) < MIN_REPLY_TOKENS) {
    await addSpent(user.uid, -held);
    throw new HttpError(429, 'You’re almost at your usage limit. Try a smaller model, or wait for it to reset.');
  }

  const abort = new AbortController();
  // they closed the page mid-answer: stop the model too (the request's own 'close' fires as soon as its body is read)
  res.on('close', () => { if (!res.writableFinished) abort.abort(); });
  const effort = effortFor(model, wanted);
  const send = (obj) => { if (!res.writableEnded) res.write(`${JSON.stringify(obj)}\n`); };

  let cost = 0; // real cost so far, every round
  let started = false; // the stream has begun (errors after this go into it)
  let failed = null;
  let anyText = false;

  for (let round = 0; round < MAX_ROUNDS && !failed; round++) {
    // this round's prompt, and how many tokens of reply still fit in what was held back
    const prompt = guessTokens(convo);
    const roundIn = prompt * inputRate(model, prompt);
    const room = unlimited ? MAX_REPLY_TOKENS : Math.min(MAX_REPLY_TOKENS, Math.floor((held - cost - roundIn) / perOut));
    if (room < MIN_REPLY_TOKENS) {
      if (round === 0) { await addSpent(user.uid, -held); throw new HttpError(429, 'You’re almost at your usage limit. Try a smaller model, or wait for it to reset.'); }
      failed = 'You reached your usage limit while the AI was working. Try again after it resets.';
      break;
    }
    const canUseTools = toolDefs.length > 0 && round < MAX_ROUNDS - 1;

    let upstream;
    try {
      upstream = await fetch(`${GATEWAY}/chat/completions`, {
        method: 'POST',
        signal: abort.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: id,
          messages: convo,
          max_tokens: room,
          ...(effort && { reasoning: { effort } }),
          ...(canUseTools && { tools: toolDefs, tool_choice: 'auto' }),
          stream: true,
          stream_options: { include_usage: true },
          user: user.uid,
        }),
      });
    } catch {
      if (!started) { await addSpent(user.uid, -held); throw new HttpError(502, 'Couldn’t reach the AI right now. Please try again.'); }
      if (!abort.signal.aborted) failed = 'Couldn’t reach the AI right now. Please try again.';
      break;
    }
    if (!upstream.ok) {
      console.error('gateway', upstream.status, (await upstream.text()).slice(0, 500));
      const msg = upstream.status === 429 ? 'The AI is busy right now. Try again in a moment.' : 'The AI couldn’t answer right now. Please try again.';
      if (!started) { await addSpent(user.uid, -held); throw new HttpError(502, msg); }
      failed = msg;
      break;
    }
    if (!started) {
      // From here the answer streams, so errors go into the stream instead of the status code.
      started = true;
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
    }

    let usage = null;
    let written = 0; // characters of answer, to estimate the cost if the Gateway never sends token counts
    let roundText = '';
    const calls = []; // tool calls, built up from the stream's pieces
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
          const delta = event.choices?.[0]?.delta || {};
          for (const tc of delta.tool_calls || []) {
            const c = (calls[tc.index ?? calls.length] ||= { id: '', name: '', args: '' });
            if (tc.id) c.id = tc.id;
            if (tc.function?.name) c.name += tc.function.name;
            if (tc.function?.arguments) c.args += tc.function.arguments;
          }
          if (delta.content) {
            let text = delta.content;
            if (!roundText && anyText && round > 0) text = `\n\n${text}`; // a new paragraph after using tools
            roundText += delta.content;
            anyText = true;
            written += text.length;
            send({ type: 'text', text });
          }
        }
      }
    } catch {
      if (!abort.signal.aborted) failed = 'The answer was cut off. Please try again.';
    }
    cost += usage ? costOf(model, usage) : roundIn + Math.ceil((written + calls.reduce((n, c) => n + c.args.length, 0)) / 3) * perOut;

    const toolCalls = calls.filter((c) => c && c.name);
    if (failed || abort.signal.aborted || !toolCalls.length) break;

    // run the tools the model asked for, then let it carry on with the results
    toolCalls.forEach((c, i) => { if (!c.id) c.id = `call_${round}_${i}`; });
    convo.push({
      role: 'assistant', content: roundText || null,
      tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    });
    for (const c of toolCalls) {
      let args = {};
      try { args = JSON.parse(c.args || '{}'); } catch {}
      if (c.name === 'save_memory' && memoryOn) {
        const result = await rememberThis(user.uid, profile, args.text).catch((err) => `Error: ${err.message}`);
        if (result === 'Saved.') send({ type: 'tool', label: `Saved to memory: “${String(args.text).slice(0, 80)}”`, memory: String(args.text).slice(0, 400) });
        convo.push({ role: 'tool', tool_call_id: c.id, content: result });
        continue;
      }
      send({ type: 'tool', label: labelFor(c.name, args) });
      convo.push({ role: 'tool', tool_call_id: c.id, content: await runTool(user.uid, tools, c.name, c.args) });
    }
  }

  // Swap the hold for what it really cost.
  try {
    const spent = await addSpent(user.uid, cost - held, id, cost);
    if (failed) send({ type: 'error', error: failed });
    else if (!anyText && !abort.signal.aborted) send({ type: 'error', error: 'No answer came back. Please try again.' });
    send({ type: 'done', spent, budgets: budgetsFor(plan), unlimited });
  } catch (err) {
    console.error('usage', err);
    send({ type: 'error', error: failed || 'Your usage couldn’t be updated. Refresh the page.' });
  }
  res.end();
});
