// POST /api/usage — the signed-in person's plan and billing, what they've spent today and this week, and their budgets
// (dollars). The app shows these as percentages and uses the plan to unlock models and features.
// A paid plan is re-checked with Stripe every few hours, in case a webhook was missed.
import { db, handle, requireUser } from './_shared.js';
import { budgetsFor, isUnlimited, planOf, readSpent, requireVerified } from './_ai.js';
import { secretKey, stripe, syncSubscription } from './_stripe.js';

const RECHECK_MS = 6 * 3600_000;

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
    unlimited: isUnlimited(user), // no limits and every model, whatever the plan
    billing: record ? {
      billing: record.billing || null,
      status: record.status || null,
      periodEnd: record.periodEnd || null,
      cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
      canManage: Boolean(record.customerId),
    } : null,
    spent: await readSpent(user.uid),
    budgets: budgetsFor(plan),
  });
});
