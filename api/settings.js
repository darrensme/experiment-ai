// POST /api/settings { action, … } — the signed-in person's settings, one endpoint for the whole Settings panel:
//   get                      → { settings, avatar }
//   save   { settings }      → saves the given fields (checked against FIELDS in _profile.js) → { settings }
//   memories { memories }    → replaces the Memory list [{ id?, text }] → { memories }
//   avatar { image | null }  → a 256×256 picture as a data URL, or null to remove it → { avatar }
//   export                   → everything stored about them, as JSON
//   signout-all              → signs them out on every device (Firebase revokes their sessions)
// Admins only (Settings › Admin):
//   admin-users { query?, filter?: 'all' | 'banned', pageToken? } → { users, nextPageToken }
//   admin-user { uid }                    → { user } with usage and counts
//   admin-ban { uid, reason } / admin-unban { uid }
//   admin-plan { uid, plan | null }       → override the plan Stripe says (null = back to Stripe)
//   admin-unlimited { uid, on }           → no limits, every model
//   admin-access { uid, on }              → let them into the app
//   admin-reset-usage { uid }             → today and this week back to 0
//   admin-delete { uid, confirm: email }  → deletes the account and everything stored for it (see _account.js)
import { HttpError, auth, db, handle, requireUser } from './_shared.js';
import {
  PLANS, budgetsFor, hasAccess, isAdmin, isUnlimited, planOf, readSpent, requireAdmin, requireVerified,
} from './_ai.js';
import { ageOn, readProfile, saveAvatar, saveBirthDate, saveMemories, saveSettings, validBirthDate } from './_profile.js';
import { chatsOf } from './chats.js';
import { deleteAccount } from './_account.js';

/* ── Admin helpers ── */
async function describe(u, { detail = false } = {}) {
  const store = db();
  const [planDoc, banDoc, access] = await Promise.all([
    store.collection('plans').doc(u.uid).get(), store.collection('bans').doc(u.uid).get(), hasAccess(u),
  ]);
  const p = planDoc.data() || {};
  const out = {
    uid: u.uid, email: u.email || null, name: u.displayName || null, photo: u.photoURL || null,
    created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime,
    verified: u.emailVerified || u.providerData.some((x) => x.providerId === 'google.com'),
    providers: u.providerData.map((x) => x.providerId),
    plan: PLANS.includes(p.override) ? p.override : PLANS.includes(p.plan) ? p.plan : 'free',
    stripePlan: PLANS.includes(p.plan) ? p.plan : 'free', override: PLANS.includes(p.override) ? p.override : null,
    status: p.status || null, billing: p.billing || null, periodEnd: p.periodEnd || null, cancelAtPeriodEnd: Boolean(p.cancelAtPeriodEnd),
    unlimited: p.unlimited === true || isUnlimited(u), unlimitedBuiltIn: isUnlimited(u),
    access, admin: isAdmin(u),
    banned: banDoc.exists ? { reason: banDoc.data().reason || '', at: banDoc.data().at || null, by: banDoc.data().by || null } : null,
  };
  if (detail) {
    const plan = await planOf(u.uid);
    const [spent, chats] = await Promise.all([readSpent(u.uid), chatsOf(u.uid).count().get()]);
    out.usage = { spent: { day: spent.day, week: spent.week }, budgets: budgetsFor(plan) };
    out.chats = chats.data().count;
  }
  return out;
}
async function adminAction(user, action, body) {
  requireAdmin(user);
  const store = db();
  // thumbs up/down on replies (api/chats.js 'rate'): the newest 300, with totals per model
  if (action === 'admin-feedback') {
    const snap = await store.collection('feedback').orderBy('ratedAt', 'desc').limit(300).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const models = {};
    for (const f of items) {
      models[f.model] ||= { up: 0, down: 0 };
      models[f.model][f.rating === 'up' ? 'up' : 'down']++;
    }
    return { items, models };
  }
  if (action === 'admin-users') {
    const q = String(body.query || '').trim();
    let users = [];
    let nextPageToken = null;
    if (body.filter === 'banned') {
      const bans = (await store.collection('bans').limit(200).get()).docs.map((d) => ({ uid: d.id }));
      if (bans.length) users = (await auth().getUsers(bans)).users;
    } else if (q.includes('@')) {
      users = await auth().getUserByEmail(q.toLowerCase()).then((u) => [u]).catch(() => []);
    } else if (/^[A-Za-z0-9]{20,40}$/.test(q)) {
      users = await auth().getUser(q).then((u) => [u]).catch(() => []);
    } else {
      const page = await auth().listUsers(100, body.pageToken || undefined);
      users = page.users;
      nextPageToken = page.pageToken || null;
      if (q) users = users.filter((u) => `${u.displayName || ''} ${u.email || ''}`.toLowerCase().includes(q.toLowerCase()));
    }
    users.sort((a, b) => new Date(b.metadata.creationTime) - new Date(a.metadata.creationTime));
    return { users: await Promise.all(users.map((u) => describe(u))), nextPageToken };
  }
  const uid = String(body.uid || '');
  if (!/^[A-Za-z0-9]{10,128}$/.test(uid)) throw new HttpError(400, 'Pick a user.');
  const target = await auth().getUser(uid).catch(() => null);
  if (!target) throw new HttpError(404, 'That user isn’t there any more.');
  if (action === 'admin-user') return { user: await describe(target, { detail: true }) };
  if (action === 'admin-ban') {
    if (uid === user.uid) throw new HttpError(400, 'You can’t ban yourself.');
    if (isAdmin(target)) throw new HttpError(400, 'Admins can’t be banned.');
    const reason = String(body.reason || '').trim().slice(0, 500);
    if (!reason) throw new HttpError(400, 'Give a reason. They’ll see it.');
    await store.collection('bans').doc(uid).set({ reason, at: Date.now(), by: user.email || user.uid });
    await auth().revokeRefreshTokens(uid);
  } else if (action === 'admin-unban') {
    await store.collection('bans').doc(uid).delete();
  } else if (action === 'admin-plan') {
    const plan = body.plan == null ? null : String(body.plan);
    if (plan !== null && !PLANS.includes(plan)) throw new HttpError(400, 'Unknown plan.');
    await store.collection('plans').doc(uid).set({ override: plan }, { merge: true });
  } else if (action === 'admin-unlimited') {
    await store.collection('plans').doc(uid).set({ unlimited: body.on === true }, { merge: true });
  } else if (action === 'admin-access') {
    if (body.on === true) await store.collection('access').doc(uid).set({ at: Date.now(), by: user.email || user.uid });
    else await store.collection('access').doc(uid).delete();
  } else if (action === 'admin-reset-usage') {
    await store.collection('usage').doc(uid).delete();
  } else if (action === 'admin-delete') {
    if (uid === user.uid) throw new HttpError(400, 'Delete your own account in Settings › Account.');
    if (isAdmin(target)) throw new HttpError(400, 'Admins can’t be deleted here.');
    if (String(body.confirm || '').trim().toLowerCase() !== String(target.email || target.uid).toLowerCase()) {
      throw new HttpError(400, 'Type their email to confirm.');
    }
    await deleteAccount(uid);
    console.log('admin', action, uid, target.email, 'by', user.email);
    return { deleted: true };
  } else throw new HttpError(400, 'Unknown admin action.');
  console.log('admin', action, uid, 'by', user.email);
  return { user: await describe(target, { detail: true }) };
}

export default handle(async (req, res) => {
  const user = await requireUser(req);
  requireVerified(user);
  const action = String(req.body?.action || '');

  if (action.startsWith('admin-')) return res.status(200).json(await adminAction(user, action, req.body || {}));
  if (action === 'get') {
    const { avatar = null, memories = [], updatedAt, ...settings } = await readProfile(user.uid);
    return res.status(200).json({ settings, avatar, memories, isAdmin: isAdmin(user) });
  }
  if (action === 'save') {
    return res.status(200).json({ settings: await saveSettings(user.uid, req.body.settings) });
  }
  // birthday: set once. Under 13 → the account is deleted (we can't keep a child's data). Admins are never deleted here.
  if (action === 'birthday') {
    const profile = await readProfile(user.uid);
    if (profile.birthDate) return res.status(200).json({ birthDate: profile.birthDate, age: ageOn(profile.birthDate) });
    const birthDate = String(req.body?.birthDate || '');
    if (!validBirthDate(birthDate)) throw new HttpError(400, 'Enter your real date of birth.');
    const age = ageOn(birthDate);
    if (age < 13) {
      if (!isAdmin(user)) await deleteAccount(user.uid);
      console.log('under-13 birthday', user.uid, isAdmin(user) ? '(admin, kept)' : 'account deleted');
      return res.status(403).json({ underage: true, error: 'Experiment AI is only for people 13 and older, so this account has been deleted.' });
    }
    await saveBirthDate(user.uid, birthDate);
    return res.status(200).json({ birthDate, age });
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
    const projects = (await store.collection('profiles').doc(user.uid).collection('projects').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    const connectors = (await store.collection('profiles').doc(user.uid).collection('connectors').get()).docs
      .map((d) => ({ tool: d.id, account: d.data().account || null, connectedAt: d.data().connectedAt || null })); // never the tokens
    if (profile) delete profile.avatar; // a big picture string; it's in your account, not useful here
    res.setHeader('Content-Disposition', 'attachment; filename="experiment-ai-data.json"');
    return res.status(200).json({
      exportedAt: new Date().toISOString(),
      account: {
        uid: user.uid, email: user.email, name: user.displayName || null, emailVerified: user.emailVerified,
        signInMethods: user.providerData.map((p) => p.providerId),
        created: user.metadata.creationTime, lastSignIn: user.metadata.lastSignInTime,
      },
      settings: profile, plan, usage, waitlist, chats, projects, connectors,
    });
  }
  if (action === 'signout-all') {
    await auth().revokeRefreshTokens(user.uid);
    return res.status(200).json({ signedOut: true });
  }
  throw new HttpError(400, 'Unknown settings action.');
});
