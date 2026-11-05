// POST /api/settings { action, … } — the signed-in person's settings, one endpoint for the whole Settings panel:
//   get                      → { settings, avatar }
//   save   { settings }      → saves the given fields (checked against FIELDS in _profile.js) → { settings }
//   memories { memories }    → replaces the Memory list [{ id?, text }] → { memories }
//   avatar { image | null }  → a 256×256 picture as a data URL, or null to remove it → { avatar }
//   export                   → everything stored about them, as JSON
//   signout-all              → signs them out on every device (Firebase revokes their sessions)
import { HttpError, auth, db, handle, requireUser } from './_shared.js';
import { requireVerified } from './_ai.js';
import { readProfile, saveAvatar, saveMemories, saveSettings } from './_profile.js';
import { chatsOf } from './chats.js';

export default handle(async (req, res) => {
  const user = await requireUser(req);
  requireVerified(user);
  const action = String(req.body?.action || '');

  if (action === 'get') {
    const { avatar = null, memories = [], updatedAt, ...settings } = await readProfile(user.uid);
    return res.status(200).json({ settings, avatar, memories });
  }
  if (action === 'save') {
    return res.status(200).json({ settings: await saveSettings(user.uid, req.body.settings) });
  }
  if (action === 'memories') {
    return res.status(200).json({ memories: await saveMemories(user.uid, req.body.memories) });
  }
  if (action === 'avatar') {
    return res.status(200).json({ avatar: await saveAvatar(user.uid, req.body.image ?? null) });
  }
  if (action === 'export') {
    const store = db();
    const read = async (c) => (await store.collection(c).doc(user.uid).get()).data() || null;
    const [profile, plan, usage, waitlist] = await Promise.all(['profiles', 'plans', 'usage', 'waitlist'].map(read));
    const chatDocs = (await chatsOf(user.uid).orderBy('updatedAt', 'desc').get()).docs;
    const chats = chatDocs.map((d) => {
      const { text, count, ...rest } = d.data();
      return { id: d.id, ...rest };
    });
    res.setHeader('Content-Disposition', 'attachment; filename="experiment-ai-data.json"');
    return res.status(200).json({
      exportedAt: new Date().toISOString(),
      account: {
        uid: user.uid, email: user.email, name: user.displayName || null, emailVerified: user.emailVerified,
        signInMethods: user.providerData.map((p) => p.providerId),
        created: user.metadata.creationTime, lastSignIn: user.metadata.lastSignInTime,
      },
      settings: profile, plan, usage, waitlist, chats,
      note: 'Projects are kept in your browser for now, so they are not part of this file.',
    });
  }
  if (action === 'signout-all') {
    await auth().revokeRefreshTokens(user.uid);
    return res.status(200).json({ signedOut: true });
  }
  throw new HttpError(400, 'Unknown settings action.');
});
