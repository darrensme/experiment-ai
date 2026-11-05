// POST /api/usage — the signed-in person's plan and billing, what they've spent today and this week, and their budgets
// (dollars). The app shows these as percentages and uses the plan to unlock models and features.
// A paid plan is re-checked with Stripe every few hours, in case a webhook was missed.
import { db, handle, requireUser } from './_shared.js';
import { budgetsFor, planOf, readSpent, requireVerified, unlimitedFor } from './_ai.js';
import { secretKey, stripe, syncSubscription } from './_stripe.js';

const RECHECK_MS = 6 * 3600_000;

// The card (or wallet / Link) the plan is paid with, for Settings › Billing: { brand, last4, expMonth, expYear, wallet }
// Only the subscription's own payment method, else the customer's default, else their first saved card.
async function paymentMethodOf(record) {
  if (!record?.customerId || !secretKey()) return null;
  const s = stripe();
  let pm = null;
  if (record.subscriptionId) pm = (await s.subscriptions.retrieve(record.subscriptionId, { expand: ['default_payment_method'] })).default_payment_method;
  if (!pm || typeof pm === 'string') pm = (await s.customers.retrieve(record.customerId, { expand: ['invoice_settings.default_payment_method'] })).invoice_settings?.default_payment_method;
  if (!pm || typeof pm === 'string') pm = (await s.paymentMethods.list({ customer: record.customerId, limit: 1 })).data[0];
  if (!pm) return null;
  if (pm.card) {
    return { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year, wallet: pm.card.wallet?.type || null };
  }
  if (pm.type === 'link') return { brand: 'link', email: pm.link?.email || null };
  return { brand: pm.type };
}

export default handle(async (req, res) => {
  const user = await requireUser(req);
  requireVerified(user);
  let record = (await db().collection('plans').doc(user.uid).get()).data() || null;
  if (record?.subscriptionId && secretKey() && Date.now() - (record.checkedAt || 0) > RECHECK_MS) {
    try {
      record = (await syncSubscription(await stripe().subscriptions.retrieve(record.subscriptionId))) || record;
    } catch (err) {
      console.error('stripe recheck', err?.message);
    }
  }
  const plan = await planOf(user.uid);
  res.status(200).json({
    plan,
    unlimited: await unlimitedFor(user), // no limits and every model, whatever the plan
    billing: record ? {
      billing: record.billing || null,
      status: record.status || null,
      periodEnd: record.periodEnd || null,
      cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
      canManage: Boolean(record.customerId),
      // only when Billing asks ({ card: true }): it's a few Stripe calls
      ...(req.body?.card === true && { card: await paymentMethodOf(record).catch((err) => { console.error('stripe card', err?.message); return null; }) }),
    } : null,
    spent: await readSpent(user.uid),
    budgets: budgetsFor(plan),
  });
});
