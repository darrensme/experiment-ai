// POST /api/checkout { plan, billing } — buy or change a plan.
// No subscription yet: starts an embedded Stripe Checkout and returns { clientSecret, publishableKey } for the page.
// Already subscribed: switches the subscription to the new price right away (the difference is charged or credited
// now; nothing changes unless that payment goes through) and returns { changed: true, plan }.
import { HttpError, db, handle, requireUser } from './_shared.js';
import { requireAccess } from './_ai.js';
import { BILLINGS, PAID, priceFor, publishableKey, siteOrigin, stripe, syncSubscription } from './_stripe.js';

const LIVE = ['active', 'trialing', 'past_due'];

export default handle(async (req, res) => {
  const user = await requireUser(req);
  requireAccess(user);
  const plan = String(req.body?.plan || '');
  const billing = String(req.body?.billing || 'monthly');
  if (!(plan in PAID)) throw new HttpError(400, 'Pick a plan.');
  if (!BILLINGS.includes(billing)) throw new HttpError(400, 'Pick monthly or yearly.');

  const s = stripe();
  const price = await priceFor(plan, billing);
  const current = (await db().collection('plans').doc(user.uid).get()).data() || {};

  if (current.subscriptionId && LIVE.includes(current.status)) {
    const sub = await s.subscriptions.retrieve(current.subscriptionId);
    if (LIVE.includes(sub.status)) {
      const item = sub.items.data[0];
      if (item.price.id === price && !sub.cancel_at_period_end) throw new HttpError(400, 'You’re already on this plan.');
      if (sub.cancel_at_period_end) await s.subscriptions.update(sub.id, { cancel_at_period_end: false });
      let updated = sub;
      if (item.price.id !== price) {
        updated = await s.subscriptions.update(sub.id, {
          items: [{ id: item.id, price }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'pending_if_incomplete',
        });
        if (updated.pending_update) {
          throw new HttpError(402, 'Your card couldn’t be charged for the change. Update it in Manage billing, then try again.');
        }
      } else updated = await s.subscriptions.retrieve(sub.id); // only un-cancelled
      const saved = await syncSubscription(updated);
      return res.status(200).json({ changed: true, plan: saved?.plan || plan });
    }
  }

  const session = await s.checkout.sessions.create({
    ui_mode: 'embedded_page',
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    ...(current.customerId ? { customer: current.customerId } : { customer_email: user.email }),
    client_reference_id: user.uid,
    metadata: { uid: user.uid },
    subscription_data: { metadata: { uid: user.uid } },
    return_url: `${siteOrigin(req)}/home?checkout={CHECKOUT_SESSION_ID}`,
  });
  res.status(200).json({ clientSecret: session.client_secret, publishableKey: publishableKey() });
});
