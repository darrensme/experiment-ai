// Images and videos (the picker's image and video models) and files people upload, all stored in Vercel Blob
// (store "experiment-ai-media", env BLOB_READ_WRITE_TOKEN). Blob URLs are long and random; only the person who made a
// chat gets them.
//   Images: image-only models (GPT Image, Muse Image, Grok Imagine) use the Gateway's /images endpoints; Nano Banana
//   models answer through chat completions with modalities ['text', 'image'].
//   Videos: started as a Gateway background job (AI SDK experimental_startVideo); the app checks on it every few
//   seconds and, once it's done, the video is copied into Blob (provider links expire).
import { createHash, randomBytes } from 'node:crypto';
import { del, list, put } from '@vercel/blob';
import { createGateway, experimental_getVideoStatus as getVideoStatus, experimental_startVideo as startVideo } from 'ai';
import { HttpError, db } from './_shared.js';
import { GATEWAY } from './_ai.js';

const BLOB_HOST = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//;
export const isBlobUrl = (u) => typeof u === 'string' && u.length < 600 && BLOB_HOST.test(u);
const folderOf = (uid) => createHash('sha256').update(`ea:${uid}`).digest('hex').slice(0, 24);
// Is this Blob link one of this person's own files? (uploads, images or videos in their folder)
export const ownedBy = (uid, url) => {
  if (!isBlobUrl(url)) return false;
  try {
    const [kind, folder] = new URL(url).pathname.split('/').filter(Boolean);
    return ['uploads', 'images', 'videos'].includes(kind) && folder === folderOf(uid);
  } catch { return false; }
};
const safeName = (name) => String(name || 'file').normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'file';

// Save bytes to Blob under this person's folder; returns the public URL.
export async function saveFile(uid, kind, name, bytes, contentType) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'File storage isn’t set up yet.');
  const path = `${kind}/${folderOf(uid)}/${randomBytes(6).toString('hex')}-${safeName(name)}`;
  const blob = await put(path, bytes, { access: 'public', contentType, addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN });
  return blob.url;
}

// Everything stored for this person (uploads, images, videos): deleted with their account.
export async function deleteUserFiles(uid) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return 0;
  let n = 0;
  for (const kind of ['uploads', 'images', 'videos']) {
    let cursor;
    do {
      const page = await list({ prefix: `${kind}/${folderOf(uid)}/`, cursor, limit: 1000, token });
      if (page.blobs.length) { await del(page.blobs.map((b) => b.url), { token }); n += page.blobs.length; }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  return n;
}

/* ── Uploads (api/chats.js?upload=…): the app shrinks big photos first, so 4 MB covers almost everything ── */
export const UPLOAD_MAX = 4 * 1024 * 1024;
export async function saveUpload(uid, name, type, bytes) {
  if (!bytes?.length) throw new HttpError(400, 'That file is empty.');
  if (bytes.length > UPLOAD_MAX) throw new HttpError(413, 'Files can be up to 4 MB.');
  const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(type || '') ? type : 'application/octet-stream';
  return { url: await saveFile(uid, 'uploads', name, bytes, contentType), type: contentType, size: bytes.length };
}

/* ── Reading uploads for the AI: images by link, PDFs as data, text-like files inlined ── */
const TEXTY = /^text\/|json|xml|javascript|typescript|csv|markdown|yaml|x-sh|x-python|sql/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|ya?ml|toml|ini|sql|log|svg)$/i;
const FILE_TEXT_MAX = 60_000;
export async function partsForFiles(files) {
  const parts = [];
  for (const f of files) {
    const label = `[${f.name}]`;
    try {
      if (/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) {
        parts.push({ type: 'image_url', image_url: { url: f.url } });
      } else if (f.type === 'application/pdf') {
        const r = await fetch(f.url);
        if (!r.ok) throw new Error('gone');
        parts.push({ type: 'file', file: { data: Buffer.from(await r.arrayBuffer()).toString('base64'), media_type: 'application/pdf', filename: f.name } });
      } else if (TEXTY.test(f.type) || TEXT_EXT.test(f.name)) {
        const r = await fetch(f.url);
        if (!r.ok) throw new Error('gone');
        let text = await r.text();
        if (text.length > FILE_TEXT_MAX) text = `${text.slice(0, FILE_TEXT_MAX)}\n…(cut off)`;
        parts.push({ type: 'text', text: `${label}\n\`\`\`\n${text}\n\`\`\`` });
      } else {
        parts.push({ type: 'text', text: `${label} (a ${f.type || 'file'} that can't be read as text; ask the person what's in it if it matters)` });
      }
    } catch {
      parts.push({ type: 'text', text: `${label} (couldn't be opened)` });
    }
  }
  return parts;
}

/* ── Prices from the Gateway's list ── */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// the most one image could cost (to hold back first) and a cost from what came back
export function imagePrice(model) {
  const p = model?.pricing || {};
  const dims = p.image_dimension_quality_pricing || [];
  const flat = num(p.image) || num(dims.find((d) => d.size === 'default' || d.size === '1K')?.cost) || num(dims[0]?.cost);
  // per-image price; for Nano Banana the token count can also describe it, so take the larger, never both
  if (flat) return { most: flat * 1.2 + 0.01, of: (usage) => Math.max(flat, usage ? num(usage.prompt_tokens) * num(p.input) + num(usage.completion_tokens) * num(p.output) : 0) };
  // token-priced (GPT Image): a 1024×1024 high-quality image is ~4,200 output tokens
  const inp = num(p.input);
  const out = num(p.output) || 0.00003;
  const tokens = (usage, key, alt) => num(usage?.[key] ?? usage?.[alt]);
  return {
    most: 4500 * out + 2000 * inp,
    of: (usage) => (usage ? tokens(usage, 'input_tokens', 'prompt_tokens') * inp + tokens(usage, 'output_tokens', 'completion_tokens') * out : 4200 * out),
  };
}
export const VIDEO = { // seconds, 720p, with sound where offered
  'google/veo-3.1-generate-001': { duration: 4, resolution: '1280x720', audio: true },
  'google/veo-3.1-fast-generate-001': { duration: 4, resolution: '1280x720', audio: true },
  'google/veo-3.1-lite-generate-001': { duration: 4, resolution: '1280x720', audio: true },
  'spacexai/grok-imagine-video-1.5': { duration: 6, resolution: '1280x720' },
  'spacexai/grok-imagine-video-1.5-lite': { duration: 6, resolution: '1280x720' },
};
export function videoPrice(model, id) {
  const v = VIDEO[id];
  const list = model?.pricing?.video_duration_pricing || [];
  const pick = list.find((x) => x.resolution === '720p' && (x.audio === undefined || x.audio === Boolean(v.audio)))
    || list.find((x) => x.resolution === '720p') || list[0];
  const perSecond = num(pick?.cost_per_second) || 0.5;
  return perSecond * v.duration;
}

/* ── Images ── */
const dataUrlBytes = (u) => {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(u || '');
  return m ? { type: m[1], bytes: Buffer.from(m[2], 'base64') } : null;
};
const extOf = (type) => ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || 'png');

// Make (or edit, when `images` are given) one image. Returns { url, text, usage }.
export async function makeImage({ key, uid, id, modelType, prompt, images = [], signal }) {
  let usage = null;
  let text = '';
  let picture = null;
  if (modelType === 'language') { // Nano Banana: chat completions with image output
    const content = [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))];
    const r = await fetch(`${GATEWAY}/chat/completions`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: id, messages: [{ role: 'user', content }], modalities: ['text', 'image'], stream: false, user: uid }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('image', id, r.status, JSON.stringify(d).slice(0, 400)); throw new HttpError(502, d.error?.message ? `The image couldn’t be made: ${d.error.message}` : 'The image couldn’t be made. Try again or reword it.'); }
    const msg = d.choices?.[0]?.message || {};
    text = typeof msg.content === 'string' ? msg.content : '';
    picture = dataUrlBytes(msg.images?.[0]?.image_url?.url);
    usage = d.usage || null;
  } else { // image-only models
    const edit = images.length > 0;
    const r = await fetch(`${GATEWAY}/images/${edit ? 'edits' : 'generations'}`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: id, prompt, n: 1, user: uid,
        ...(edit ? { images: images.map((url) => ({ image_url: url })) } : { response_format: 'b64_json' }),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { console.error('image', id, r.status, JSON.stringify(d).slice(0, 400)); throw new HttpError(502, d.error?.message ? `The image couldn’t be made: ${d.error.message}` : 'The image couldn’t be made. Try again or reword it.'); }
    const item = d.data?.[0] || {};
    if (item.b64_json) picture = { type: 'image/png', bytes: Buffer.from(item.b64_json, 'base64') };
    else if (item.url) {
      const got = await fetch(item.url);
      if (got.ok) picture = { type: got.headers.get('content-type') || 'image/png', bytes: Buffer.from(await got.arrayBuffer()) };
    }
    usage = d.usage || null;
  }
  if (!picture?.bytes?.length) throw new HttpError(502, text ? `No image came back. The model said: ${text.slice(0, 200)}` : 'No image came back. Try rewording it.');
  // PNG signature check: some models send JPEG/WebP bytes under a png label
  const b = picture.bytes;
  const type = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : picture.type;
  const url = await saveFile(uid, 'images', `image.${extOf(type)}`, b, type);
  return { url, text, usage };
}

/* ── Videos ── */
const gatewayFor = (key) => createGateway({ apiKey: key });
const jobsOf = (uid) => db().collection('profiles').doc(uid).collection('jobs');

export async function startVideoJob({ key, uid, id, prompt, image, cost }) {
  const v = VIDEO[id];
  const { operation } = await startVideo({
    model: gatewayFor(key).videoModel(id),
    prompt: image ? { image, text: prompt } : prompt,
    duration: v.duration,
    resolution: v.resolution,
    aspectRatio: '16:9',
    ...(v.audio && { generateAudio: true }),
  });
  const ref = jobsOf(uid).doc();
  await ref.set({ model: id, operation: JSON.parse(JSON.stringify(operation ?? null)), cost, status: 'pending', at: Date.now() });
  return ref.id;
}

// One check. Returns { status: 'pending' | 'completed' | 'error', url?, error?, cost, model }.
export async function checkVideoJob({ key, uid, jobId }) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(jobId || '')) throw new HttpError(400, 'Unknown video.');
  const ref = jobsOf(uid).doc(jobId);
  const job = (await ref.get()).data();
  if (!job) throw new HttpError(404, 'That video isn’t there any more.');
  if (job.status !== 'pending') return { status: job.status, url: job.url || null, error: job.error || null, cost: job.cost, model: job.model, settled: true };
  if (Date.now() - job.at > 30 * 60_000) {
    await ref.set({ status: 'error', error: 'The video took too long and was stopped.' }, { merge: true });
    return { status: 'error', error: 'The video took too long and was stopped.', cost: job.cost, model: job.model };
  }
  const s = await getVideoStatus(gatewayFor(key).videoModel(job.model), { operation: job.operation });
  if (s.status === 'pending') return { status: 'pending', model: job.model };
  if (s.status === 'error') {
    await ref.set({ status: 'error', error: String(s.message || 'The video couldn’t be made.').slice(0, 300) }, { merge: true });
    return { status: 'error', error: s.message || 'The video couldn’t be made.', cost: job.cost, model: job.model };
  }
  const v = s.videos?.[0];
  let bytes = null;
  let type = v?.mediaType || 'video/mp4';
  if (v?.type === 'url') {
    const r = await fetch(v.url);
    if (!r.ok) throw new HttpError(502, 'The finished video couldn’t be downloaded. Try again in a moment.');
    type = r.headers.get('content-type') || type;
    bytes = Buffer.from(await r.arrayBuffer());
  } else if (v?.type === 'base64') bytes = Buffer.from(v.data, 'base64');
  else if (v?.data) bytes = Buffer.from(v.data);
  if (!bytes?.length) {
    await ref.set({ status: 'error', error: 'No video came back.' }, { merge: true });
    return { status: 'error', error: 'No video came back.', cost: job.cost, model: job.model };
  }
  const url = await saveFile(uid, 'videos', 'video.mp4', bytes, type.startsWith('video/') ? type : 'video/mp4');
  await ref.set({ status: 'completed', url, operation: null }, { merge: true });
  return { status: 'completed', url, cost: job.cost, model: job.model };
}
