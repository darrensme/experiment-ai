// Deleting an account and everything stored for it: used by api/delete-account.js (you, from Settings › Account) and by
// the admin panel (api/settings.js 'admin-delete'). Cancels a paid subscription in Stripe right away (so they're never
// charged again), then deletes their files and media (Vercel Blob), waitlist entry, email code, plan, usage, app access,
// ban record, settings, Memory, chats, projects, connected services, video jobs, and the Firebase account itself.
import { auth, db } from './_shared.js';
import { stripe } from './_stripe.js';
import { deleteUserFiles } from './_media.js';

const LIVE = ['active', 'trialing', 'past_due', 'incomplete', 'unpaid'];

export async function deleteAccount(uid) {
  await deleteUserFiles(uid).catch((err) => console.error('delete files', err?.message));
  const store = db();
  const plan = (await store.collection('plans').doc(uid).get()).data();
  if (plan?.subscriptionId && LIVE.includes(plan.status)) {
    await stripe().subscriptions.cancel(plan.subscriptionId).catch((err) => {
      if (err?.statusCode !== 404) throw err; // already gone in Stripe is fine
    });
  }
  await Promise.all([
    store.collection('waitlist').doc(uid).delete(),
    store.collection('emailCodes').doc(uid).delete(),
    store.collection('plans').doc(uid).delete(),
    store.collection('usage').doc(uid).delete(),
    store.collection('access').doc(uid).delete(),
    store.collection('bans').doc(uid).delete(),
    // settings, Memory, chats, projects, connected services, video jobs
    store.recursiveDelete(store.collection('profiles').doc(uid)),
  ]);
  await auth().deleteUser(uid).catch((err) => { if (err?.code !== 'auth/user-not-found') throw err; });
}
