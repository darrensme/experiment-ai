// POST /api/chats { action, … } — your chats and projects, saved to your account in Firestore (server-only, like the rest
// of profiles/: no Firestore rule lets a browser read or write them). The app keeps a copy in the browser and syncs:
// it loads everything after sign-in, then saves each chat or project that changes and deletes the ones you delete.
//   all { after? }            → { chats: [full chats], projects (first page only), next } — 40 chats a page, newest first
//   save { chat }             → creates or replaces one chat → { saved: id }
//   delete { id }             → { deleted: true }
//   project-save { project }  → creates or replaces one project → { saved: id }
//   project-delete { id }     → { deleted: true }
//   bug { text, model, screen, inSession } → { sent: true }: saves a bug report to bugReports/ for admins
// Chats live at profiles/{uid}/chats/{id}, projects at profiles/{uid}/projects/{id}.
// POST /api/chats?upload=1&name=…&type=… with the file as the body → { url, type, size }: saves a file to attach to a
// message (Vercel Blob; up to 4 MB; the app shrinks big photos first).
import { HttpError, db, handle, requireUser } from './_shared.js';
import { requireVerified } from './_ai.js';
import { isBlobUrl, saveUpload } from './_media.js';

export const CHAT_LIMIT = 1000; // chats per person
const PROJECT_LIMIT = 200;
const MESSAGE_LIMIT = 500; // messages per chat
const CONTENT_MAX = 100_000; // characters per message
const DOC_MAX = 900_000; // characters per document (Firestore's limit is 1 MiB)
const PAGE = 40;
const BUG_MAX = 2000; // characters per bug report
const BUG_DAILY = 20; // bug reports per person per day

export const chatsOf = (uid) => db().collection('profiles').doc(uid).collection('chats');
const projectsOf = (uid) => db().collection('profiles').doc(uid).collection('projects');
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const fileMeta = (f) => ({ name: str(f?.name, 200), path: str(f?.path, 400), size: num(f?.size), type: str(f?.type, 100), ...(Number.isFinite(f?.addedAt) && { addedAt: f.addedAt }) });
const TOOLS = ['google', 'notion', 'github', 'canva'];
const EFFORTS = ['low', 'medium', 'high'];

function cleanChat(c) {
  if (!validId(c?.id)) throw new HttpError(400, 'That session couldn’t be saved.');
  const messages = list(c.messages, MESSAGE_LIMIT).map((m) => {
    const out = { role: m?.role === 'assistant' ? 'assistant' : 'user', text: str(m?.text ?? m?.content, CONTENT_MAX), at: num(m?.at, Date.now()) };
    if (typeof m?.model === 'string') out.model = str(m.model, 80);
    if (out.role === 'user') {
      if (['chat', 'image', 'video'].includes(m?.kind)) out.kind = m.kind;
      if (EFFORTS.includes(m?.effort)) out.effort = m.effort;
      const atts = list(m?.attachments, 50).map((a) => ({
        kind: ['file', 'folder', 'drive'].includes(a?.kind) ? a.kind : 'file', name: str(a?.name, 200), count: num(a?.count),
        ...(typeof a?.id === 'string' && /^[\w-]{10,}$/.test(a.id) && { id: a.id }),
        ...(isBlobUrl(a?.url) && { url: a.url, type: str(a.type, 100), size: num(a.size) }), // uploaded, so the AI can read it
        ...(Array.isArray(a?.uploads) && { uploads: list(a.uploads, 20).filter((u) => isBlobUrl(u?.url)).map((u) => ({ url: u.url, name: str(u.name, 200), type: str(u.type, 100), size: num(u.size) })) }),
      }));
      if (atts.length) out.attachments = atts;
      const files = list(m?.files, 200).map(fileMeta);
      if (files.length) out.files = files;
    } else {
      const steps = list(m?.steps, 12).map((s) => str(s, 120)).filter(Boolean);
      if (steps.length) out.steps = steps;
      const media = list(m?.media, 8).filter((x) => ['image', 'video'].includes(x?.type) && isBlobUrl(x.url)).map((x) => ({ type: x.type, url: x.url }));
      if (media.length) out.media = media;
      // pictures found with image search (links to other sites)
      const https = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(u) ? u : null);
      const found = list(m?.found, 8).filter((x) => https(x?.thumb) && https(x?.page))
        .map((x) => ({ thumb: x.thumb, full: https(x.full) || x.thumb, page: x.page, title: str(x.title, 140), source: str(x.source, 80) }));
      if (found.length) out.found = found;
      if (m?.job && /^[A-Za-z0-9]{10,40}$/.test(m.job.id || '')) out.job = { id: m.job.id, status: ['pending', 'error'].includes(m.job.status) ? m.job.status : 'pending', ...(m.job.error && { error: str(m.job.error, 300) }) };
      if (m?.error) out.error = str(m.error, 300);
      if (m?.rating === 'up' || m?.rating === 'down') out.rating = m.rating; // thumbs
      if (m?.stopped === true) out.stopped = true; // they pressed Stop
      // side by side: both answers until one is kept
      const pair = list(m?.pair, 2).filter((p) => typeof p?.model === 'string')
        .map((p) => ({ model: str(p.model, 80), text: str(p.text, CONTENT_MAX), ...(EFFORTS.includes(p.effort) && { effort: p.effort }), ...(p.error && { error: str(p.error, 300) }) }));
      if (pair.length === 2) out.pair = pair;
      if (pair.length === 2 && (m.picked === 0 || m.picked === 1)) out.picked = m.picked; // which answer the session uses
    }
    return out;
  });
  const now = Date.now();
  return {
    title: str(c.title, 120).trim() || 'New session',
    projectId: validId(c.projectId) ? c.projectId : null,
    memory: c.memory !== false,
    tools: list(c.tools, 4).filter((t) => TOOLS.includes(t)),
    model: str(c.model, 80) || null,
    compare: str(c.compare, 80) || null, // side by side: the session's second model
    compareEffort: EFFORTS.includes(c.compareEffort) ? c.compareEffort : null, // …and its own effort
    effort: EFFORTS.includes(c.effort) ? c.effort : null,
    createdAt: num(c.createdAt, now),
    updatedAt: num(c.updatedAt, now),
    messages,
  };
}
function cleanProject(p) {
  if (!validId(p?.id)) throw new HttpError(400, 'That project couldn’t be saved.');
  const now = Date.now();
  return {
    name: str(p.name, 80).trim() || 'Untitled project',
    description: str(p.description, 500),
    files: list(p.files, 1000).map(fileMeta),
    createdAt: num(p.createdAt, now),
    updatedAt: num(p.updatedAt, now),
  };
}
// Older chats (from the first version of the app) stored { role, content }; give them the app's shape.
const asChat = (id, d) => ({
  id, ...d,
  title: d.title || 'New session',
  messages: (d.messages || []).map((m) => (m.text != null ? m : { role: m.role, text: m.content || '', at: d.updatedAt || 0 })),
});

async function fits(doc, what) {
  if (JSON.stringify(doc).length > DOC_MAX) throw new HttpError(413, `This ${what} is too big to save to your account.`);
}

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'binary');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

export default handle(async (req, res) => {
  const user = await requireUser(req);
  requireVerified(user);
  if (req.query?.upload) {
    const name = String(req.query.name || 'file').slice(0, 200);
    return res.status(200).json(await saveUpload(user.uid, name, String(req.query.type || ''), await rawBody(req)));
  }
  const action = String(req.body?.action || '');
  const chats = chatsOf(user.uid);
  const projects = projectsOf(user.uid);

  if (action === 'all') {
    let q = chats.orderBy('updatedAt', 'desc').limit(PAGE + 1);
    const after = req.body.after;
    if (after && Number.isFinite(after.updatedAt) && validId(after.id)) {
      const cursor = await chats.doc(after.id).get();
      if (cursor.exists) q = q.startAfter(cursor);
    }
    const snap = await q.get();
    const docs = snap.docs.slice(0, PAGE);
    const out = { chats: docs.map((d) => asChat(d.id, d.data())) };
    const last = docs.at(-1);
    out.next = snap.docs.length > PAGE && last ? { id: last.id, updatedAt: last.data().updatedAt } : null;
    if (!after) out.projects = (await projects.limit(PROJECT_LIMIT).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.status(200).json(out);
  }
  if (action === 'save') {
    const doc = cleanChat(req.body.chat);
    await fits(doc, 'chat');
    const ref = chats.doc(req.body.chat.id);
    if (!(await ref.get()).exists && (await chats.count().get()).data().count >= CHAT_LIMIT) {
      throw new HttpError(409, `You have ${CHAT_LIMIT} saved sessions. Delete some to save new ones.`);
    }
    await ref.set(doc);
    return res.status(200).json({ saved: req.body.chat.id });
  }
  // thumbs up/down on a reply: kept for admins (Settings › Admin › Reply feedback). rating null = taken back.
  if (action === 'rate') {
    const b = req.body || {};
    if (!validId(b.chatId) || !Number.isFinite(b.at)) throw new HttpError(400, 'Unknown reply.');
    const ref = db().collection('feedback').doc(`${user.uid}_${b.chatId}_${Math.trunc(b.at)}`.slice(0, 200));
    if (b.rating !== 'up' && b.rating !== 'down') { await ref.delete(); return res.status(200).json({ rated: null }); }
    await ref.set({
      uid: user.uid, email: user.email || null, rating: b.rating, model: str(b.model, 80), reply: str(b.reply, 400), ratedAt: Date.now(),
    });
    return res.status(200).json({ rated: b.rating });
  }
  // the Report a bug button: kept for admins (Settings › Admin › Bug reports)
  if (action === 'bug') {
    const b = req.body || {};
    const text = str(b.text, BUG_MAX).trim();
    if (!text) throw new HttpError(400, 'Tell us what went wrong first.');
    const reports = db().collection('bugReports');
    const now = Date.now();
    const mine = await reports.where('uid', '==', user.uid).select('at').get();
    if (mine.docs.filter((d) => d.data().at > now - 86_400_000).length >= BUG_DAILY) {
      throw new HttpError(429, 'You’ve sent a lot of reports today. Please try again tomorrow.');
    }
    await reports.add({
      uid: user.uid, email: user.email || null, text, model: str(b.model, 80), screen: str(b.screen, 20), inSession: b.inSession === true,
      browser: str(req.headers?.['user-agent'], 300), at: now,
    });
    return res.status(200).json({ sent: true });
  }
  if (action === 'delete') {
    if (!validId(req.body.id)) throw new HttpError(400, 'Unknown session.');
    await chats.doc(req.body.id).delete();
    return res.status(200).json({ deleted: true });
  }
  if (action === 'project-save') {
    const doc = cleanProject(req.body.project);
    await fits(doc, 'project');
    const ref = projects.doc(req.body.project.id);
    if (!(await ref.get()).exists && (await projects.count().get()).data().count >= PROJECT_LIMIT) {
      throw new HttpError(409, `You have ${PROJECT_LIMIT} projects. Delete some to make new ones.`);
    }
    await ref.set(doc);
    return res.status(200).json({ saved: req.body.project.id });
  }
  if (action === 'project-delete') {
    if (!validId(req.body.id)) throw new HttpError(400, 'Unknown project.');
    await projects.doc(req.body.id).delete();
    return res.status(200).json({ deleted: true });
  }
  throw new HttpError(400, 'Unknown chats action.');
});
