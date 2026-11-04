// POST /api/delete-account — permanently deletes the signed-in person's account and everything stored for them:
// their waitlist entry, any pending email code, their plan, usage, settings and saved chats, and the Firebase account itself.
// A paid subscription is cancelled in Stripe first (right away, so they're never charged again). The app confirms first.
import { auth, db, handle, requireUser } from './_shared.js';
import { stripe } from './_stripe.js';

const LIVE = ['active', 'trialing', 'past_due', 'incomplete', 'unpaid'];

export default handle(async (req, res) => {
  const user = await requireUser(req);
  const store = db();
  const plan = (await store.collection('plans').doc(user.uid).get()).data();
  if (plan?.subscriptionId && LIVE.includes(plan.status)) {
    await stripe().subscriptions.cancel(plan.subscriptionId).catch((err) => {
      if (err?.statusCode !== 404) throw err; // already gone in Stripe is fine
    });
  }
  await Promise.all([
    store.collection('waitlist').doc(user.uid).delete(),
    store.collection('emailCodes').doc(user.uid).delete(),
    store.collection('plans').doc(user.uid).delete(),
    store.collection('usage').doc(user.uid).delete(),
    store.recursiveDelete(store.collection('profiles').doc(user.uid)), // settings, memory and every saved chat
  ]);
  await auth().deleteUser(user.uid);
  res.status(200).json({ deleted: true });
});
