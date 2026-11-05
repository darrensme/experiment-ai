// Shared Stripe pieces: the client, the plan prices (created in Stripe on first use, so there's nothing to set up in the
// Dashboard), and keeping Firestore plans/{uid} in step with the person's Stripe subscription.
// Env: STRIPE_SECRET_KEY (sk_test_… or sk_live_…), STRIPE_PUBLISHABLE_KEY (pk_…), optional STRIPE_WEBHOOK_SECRET.
import Stripe from 'stripe';
import { HttpError, db } from './_shared.js';

// The two keys are told apart by their prefix, not by which variable holds them (they were saved the other way round
// once): sk_/rk_ is the secret key, pk_ the publishable one.
// Keys are pulled out of the values even if they were saved with quotes, spaces or "NAME=" in front.
const VARS = ['STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY'];
const find = (re) => {
  for (const name of VARS) {
    const m = re.exec(String(process.env[name] || ''));
    if (m) return m[0];
  }
  return null;
};
// a value without quotes, spaces or "NAME=" in front
const clean = (name) => String(process.env[name] || '').trim().replace(/^[A-Z_]+=/, '').replace(/^["']|["']$/g, '').trim() || null;
// The two variables are saved the other way round: the secret key is in STRIPE_PUBLISHABLE_KEY and the publishable
// key in STRIPE_SECRET_KEY. A key recognised by its prefix (sk_/rk_ secret, pk_ publishable) wins; otherwise flip them.
// (A publishable pk_ key is never used as the secret one: Stripe refuses it, so say plainly that the secret is missing.)
const notPublishable = (v) => (v && !/^pk_/.test(v) ? v : null);
const stripeKeys = () => ({
  secret: find(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/) || notPublishable(clean('STRIPE_PUBLISHABLE_KEY')),
  publishable: find(/\bpk_(?:live|test)_[A-Za-z0-9]+/) || clean('STRIPE_SECRET_KEY'),
});
export const secretKey = () => stripeKeys().secret;
// What each variable holds, by kind only (never the key): for the logs and the error message
const kinds = () => VARS.map((name) => {
  const v = String(process.env[name] || '').trim();
  const kind = !v ? 'empty' : /(?:sk|rk)_(?:live|test)_/.test(v) ? 'a secret key' : /pk_(?:live|test)_/.test(v) ? 'a publishable key' : `something else (starts “${v.slice(0, 3)}”)`;
  return `${name} has ${kind}`;
}).join('; ');
function missing(which) {
  console.error(`stripe: no ${which} key found. ${kinds()}`);
  return new HttpError(503, `Payments aren’t set up: no ${which} key found (${kinds()}).`);
}

let client = null;
export function stripe() {
  if (client) return client;
  const key = secretKey();
  if (!key) throw missing('secret (sk_…)');
  client = new Stripe(key, { appInfo: { name: 'Experiment AI' } });
  return client;
}
export const publishableKey = () => {
  const key = stripeKeys().publishable;
  if (!key) throw missing('publishable (pk_…)');
  return key;
};

/* ── Plans and their Stripe prices (made in the Stripe Dashboard; live mode). Monthly $10/$20/$100/$200; yearly is
      10 months' price (2 months free), as on /pricing. Price IDs aren't secret. ── */
export const PAID = { light: 1000, pro: 2000, 'max-5x': 10000, 'max-10x': 20000 };
export const BILLINGS = ['monthly', 'yearly'];
export const PRICES = {
  light: { monthly: 'price_1UWcDtBgLtESXgVqieSCaNQg', yearly: 'price_1UWcEOBgLtESXgVqcOsxGcHa' },
  pro: { monthly: 'price_1UWcErBgLtESXgVqQ0Tz2Lbm', yearly: 'price_1UWcF2BgLtESXgVq4PoGmq9q' },
  'max-5x': { monthly: 'price_1UWcFiBgLtESXgVqexKpGEGS', yearly: 'price_1UWcG6BgLtESXgVqYSgx2LEn' },
  'max-10x': { monthly: 'price_1UWcGWBgLtESXgVqVY6twGd6', yearly: 'price_1UWcGiBgLtESXgVqbStq7PCv' },
};
const BY_PRICE = new Map(Object.entries(PRICES).flatMap(([plan, b]) => Object.entries(b).map(([billing, id]) => [id, { plan, billing }])));

export async function priceFor(plan, billing) {
  const id = PRICES[plan]?.[billing];
  if (!id) throw new HttpError(400, 'That plan isn’t available.');
  return id;
}

// Which plan and billing a subscription is on, from its price ID (or, for older test subscriptions, the lookup key).
export function planOfSubscription(sub) {
  const price = sub.items?.data?.[0]?.price;
  const known = BY_PRICE.get(price?.id);
  if (known) return known;
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
