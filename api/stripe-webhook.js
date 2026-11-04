// POST /api/stripe-webhook — Stripe tells us when a subscription starts, changes, renews or ends, and plans/{uid} follows.
// Add it in Stripe → Developers → Webhooks with: checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted.
// If STRIPE_WEBHOOK_SECRET is set, the signature is checked. Without it, the event is fetched again from Stripe by its
// ID, so a forged request can't change anything either. Either way the subscription itself is always re-read from Stripe.
import { HttpError, handle } from './_shared.js';
import { stripe, syncSubscription } from './_stripe.js';

async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

const SUBSCRIPTION_EVENTS = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'];

export default handle(async (req, res) => {
  const s = stripe();
  const raw = await rawBody(req);
  let event;
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    try {
      event = s.webhooks.constructEvent(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw new HttpError(400, 'Bad signature.');
    }
  } else {
    let id;
    try { id = JSON.parse(raw.toString('utf8')).id; } catch {}
    if (!/^evt_[A-Za-z0-9_]+$/.test(id || '')) throw new HttpError(400, 'Not an event.');
    event = await s.events.retrieve(id).catch(() => null);
    if (!event) throw new HttpError(400, 'Unknown event.');
  }

  const obj = event.data.object;
  let subId = null;
  if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') subId = obj.subscription;
  else if (SUBSCRIPTION_EVENTS.includes(event.type)) subId = obj.id;
  if (subId) {
    const sub = await s.subscriptions.retrieve(typeof subId === 'string' ? subId : subId.id);
    await syncSubscription(sub);
  }
  res.status(200).json({ received: true });
});
