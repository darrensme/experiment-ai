// Shared Stripe pieces: the client, the plan prices (created in Stripe on first use, so there's nothing to set up in the
// Dashboard), and keeping Firestore plans/{uid} in step with the person's Stripe subscription.
// Env: STRIPE_SECRET_KEY (sk_test_… or sk_live_…), STRIPE_PUBLISHABLE_KEY (pk_…), optional STRIPE_WEBHOOK_SECRET.
import Stripe from 'stripe';
import { HttpError, db } from './_shared.js';

let client = null;
export function stripe() {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'Payments aren’t set up yet. Please try again later.');
  client = new Stripe(key, { appInfo: { name: 'Experiment AI' } });
  return client;
}
export const publishableKey = () => {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new HttpError(503, 'Payments aren’t set up yet. Please try again later.');
  return key;
};

/* ── Prices in US cents. Yearly is 10 months' price (2 months free), as on /pricing. ── */
export const PAID = { light: 1000, pro: 2000, 'max-5x': 10000, 'max-10x': 20000 };
const NAMES = { light: 'Light', pro: 'Pro', 'max-5x': 'Max 5×', 'max-10x': 'Max 10×' };
export const BILLINGS = ['monthly', 'yearly'];
const lookupKey = (plan, billing) => `experimentai_${plan}_${billing}`;

// The Stripe price for a plan, found by its lookup key; made (with its product) the first time it's needed.
const priceCache = new Map();
export async function priceFor(plan, billing) {
  const key = lookupKey(plan, billing);
  if (priceCache.has(key)) return priceCache.get(key);
  const s = stripe();
  let price = (await s.prices.list({ lookup_keys: [key], active: true, limit: 1 })).data[0];
  if (!price) {
    const productId = `experimentai_${plan.replace('-', '_')}`;
    await s.products.retrieve(productId).catch(async (err) => {
      if (err?.statusCode !== 404) throw err;
      await s.products.create({ id: productId, name: `Experiment AI ${NAMES[plan]}`, metadata: { plan } })
        .catch((e) => { if (e?.code !== 'resource_already_exists') throw e; });
    });
    price = await s.prices.create({
      product: productId, currency: 'usd', lookup_key: key, transfer_lookup_key: true,
      unit_amount: billing === 'yearly' ? PAID[plan] * 10 : PAID[plan],
      recurring: { interval: billing === 'yearly' ? 'year' : 'month' },
      metadata: { plan, billing },
    });
  }
  priceCache.set(key, price.id);
  return price.id;
}

// Which plan and billing a subscription is on, from its price's lookup key.
export function planOfSubscription(sub) {
  const price = sub.items?.data?.[0]?.price;
  const m = /^experimentai_(.+)_(monthly|yearly)$/.exec(price?.lookup_key || '');
  const plan = m?.[1] || price?.metadata?.plan;
  return { plan: plan in PAID ? plan : null, billing: m?.[2] || price?.metadata?.billing || null };
}

// These statuses keep the plan on (past_due: Stripe is still retrying the card).
const LIVE = ['active', 'trialing', 'past_due'];

/* Write plans/{uid} from a Stripe subscription. Ended or unpaid subscriptions drop back to Free but keep the customer
   (so they can use the billing portal and pay again). Only the newest subscription counts. */
export async function syncSubscription(sub) {
  const uid = sub.metadata?.uid;
  if (!uid) return null; // not one of ours
  const ref = db().collection('plans').doc(uid);
  const { plan, billing } = planOfSubscription(sub);
  const item = sub.items?.data?.[0];
  return db().runTransaction(async (tx) => {
    const now = (await tx.get(ref)).data() || {};
    // an older subscription's late event must not undo a newer one
    if (now.subscriptionId && now.subscriptionId !== sub.id && (now.subscriptionCreated || 0) > sub.created) return now;
    const on = LIVE.includes(sub.status) && plan;
    const next = {
      plan: on ? plan : 'free',
      billing: on ? billing : null,
      status: sub.status,
      customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      subscriptionId: sub.id,
      subscriptionCreated: sub.created,
      periodEnd: item?.current_period_end ?? sub.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      checkedAt: Date.now(),
    };
    tx.set(ref, next);
    return next;
  });
}

// Where Stripe sends people back to: only our own sites (never a Host header we don't know).
export function siteOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  const ok = /^([a-z0-9-]+\.)*experimentai\.dev$/.test(host) || /^[a-z0-9-]+-experimentlabs\.vercel\.app$/.test(host) || /^localhost(:\d+)?$/.test(host);
  if (!ok) return 'https://experimentai.dev';
  return `${host.startsWith('localhost') ? 'http' : 'https'}://${host}`;
}
