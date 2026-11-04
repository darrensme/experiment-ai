// POST /api/chats { action, … } — your chats, saved to your account in Firestore at profiles/{uid}/chats/{id}
// (server-only, like the rest of profiles/: no Firestore rule lets a browser read or write them).
//   list                         → { chats: [{ id, title, createdAt, updatedAt, pinned, model, count, text }] }
//                                  (no messages; `text` is the start of the conversation, for search)
//   get     { id }               → { chat } with its messages
//   save    { chat }             → creates or updates one chat ({ id, title?, messages, model? }) → { chat } (no messages)
//   update  { id, title?, pinned? } → rename or pin → { chat }
//   delete  { id }               → { deleted: true }
//   delete-all                   → { deleted: n }
//   import  { chats: [...] }     → saves chats that were kept in this browser before (once) → { imported: n }
import { HttpError, db, handle, requireUser } from './_shared.js';
import { requireAccess } from './_ai.js';

export const CHAT_LIMIT = 500; // chats per person
const MESSAGE_LIMIT = 500; // messages per chat
const CONTENT_MAX = 100_000; // characters per message
const DOC_MAX = 900_000; // characters per chat (Firestore's limit is 1 MiB per document)
const TEXT_MAX = 2000; // characters kept for search in the list

export const chatsOf = (uid) => db().collection('profiles').doc(uid).collection('chats');
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);

function cleanMessages(list) {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'A chat needs at least one message.');
  if (list.length > MESSAGE_LIMIT) throw new HttpError(413, 'This chat is too long to save. Start a new chat.');
  return list.map((m) => {
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m.content !== 'string') throw new HttpError(400, 'That chat couldn’t be saved.');
    return { role: m.role, content: m.content.slice(0, CONTENT_MAX) };
  });
}
const titleOf = (text) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return (t.length > 60 ? `${t.slice(0, 57)}…` : t) || 'New chat';
};
const searchText = (messages) => messages.map((m) => m.content).join(' ').replace(/\s+/g, ' ').slice(0, TEXT_MAX);
// What the list shows for a chat (everything but the messages).
export const summary = (id, d) => ({
  id, title: d.title, createdAt: d.createdAt, updatedAt: d.updatedAt, pinned: Boolean(d.pinned),
  model: d.model || null, count: d.count ?? d.messages?.length ?? 0, text: d.text || '',
});

async function saveChat(uid, chat, { importing = false } = {}) {
  if (!validId(chat?.id)) throw new HttpError(400, 'That chat couldn’t be saved.');
  const messages = cleanMessages(chat.messages);
  const ref = chatsOf(uid).doc(chat.id);
  const existing = (await ref.get()).data();
  if (!existing) {
    const count = (await chatsOf(uid).get()).size;
    if (count >= CHAT_LIMIT) throw new HttpError(409, `You have ${CHAT_LIMIT} saved chats. Delete some to save new ones.`);
  }
  const now = Date.now();
  const doc = {
    title: existing?.title || (typeof chat.title === 'string' && chat.title.trim() ? chat.title.trim().slice(0, 120) : titleOf(messages[0].content)),
    messages,
    count: messages.length,
    text: searchText(messages),
    model: typeof chat.model === 'string' ? chat.model.slice(0, 80) : existing?.model || null,
    pinned: existing ? Boolean(existing.pinned) : Boolean(importing && chat.pinned),
    createdAt: existing?.createdAt || (importing && Number.isFinite(chat.createdAt) ? chat.createdAt : now),
    updatedAt: importing && Number.isFinite(chat.updatedAt) ? chat.updatedAt : now,
  };
  if (JSON.stringify(doc).length > DOC_MAX) throw new HttpError(413, 'This chat is too long to save. Start a new chat.');
  await ref.set(doc);
  return summary(chat.id, doc);
}

export default handle(async (req, res) => {
  const user = await requireUser(req);
  requireAccess(user);
  const action = String(req.body?.action || '');
  const col = chatsOf(user.uid);

  if (action === 'list') {
    const snap = await col.orderBy('updatedAt', 'desc').limit(CHAT_LIMIT).get();
    return res.status(200).json({ chats: snap.docs.map((d) => summary(d.id, d.data())) });
  }
  if (action === 'get') {
    if (!validId(req.body.id)) throw new HttpError(400, 'Unknown chat.');
    const d = (await col.doc(req.body.id).get()).data();
    if (!d) throw new HttpError(404, 'That chat isn’t there any more.');
    return res.status(200).json({ chat: { ...summary(req.body.id, d), messages: d.messages } });
  }
  if (action === 'save') {
    return res.status(200).json({ chat: await saveChat(user.uid, req.body.chat) });
  }
  if (action === 'update') {
    if (!validId(req.body.id)) throw new HttpError(400, 'Unknown chat.');
    const ref = col.doc(req.body.id);
    const d = (await ref.get()).data();
    if (!d) throw new HttpError(404, 'That chat isn’t there any more.');
    const patch = {};
    if (typeof req.body.title === 'string') {
      const t = req.body.title.trim().slice(0, 120);
      if (!t) throw new HttpError(400, 'Give the chat a name.');
      patch.title = t;
    }
    if (typeof req.body.pinned === 'boolean') patch.pinned = req.body.pinned;
    if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to change.');
    await ref.set(patch, { merge: true });
    return res.status(200).json({ chat: summary(req.body.id, { ...d, ...patch }) });
  }
  if (action === 'delete') {
    if (!validId(req.body.id)) throw new HttpError(400, 'Unknown chat.');
    await col.doc(req.body.id).delete();
    return res.status(200).json({ deleted: true });
  }
  if (action === 'delete-all') {
    const snap = await col.get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db().batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return res.status(200).json({ deleted: snap.docs.length });
  }
  if (action === 'import') {
    const list = Array.isArray(req.body.chats) ? req.body.chats.slice(0, 200) : [];
    let imported = 0;
    for (const chat of list) {
      try {
        if ((await col.doc(String(chat?.id)).get()).data()) continue; // already saved
        await saveChat(user.uid, chat, { importing: true });
        imported++;
      } catch {} // skip one that doesn't fit; keep going
    }
    return res.status(200).json({ imported });
  }
  throw new HttpError(400, 'Unknown chats action.');
});
