// POST /api/billing-portal — a link to Stripe's billing page for this person: cancel, change card, see invoices.
// (Plan changes happen in the app's plans pop-up.) The portal's settings are made here on first use, once per mode.
import { HttpError, db, handle, requireUser } from './_shared.js';
import { secretKey, siteOrigin, stripe } from './_stripe.js';

async function portalConfig(s) {
  const mode = /^(sk|rk)_live/.test(secretKey() || '') ? 'live' : 'test';
  const ref = db().collection('meta').doc(`stripePortal_${mode}`);
  const saved = (await ref.get()).data()?.id;
  if (saved) return saved;
  const config = await s.billingPortal.configurations.create({
    business_profile: { headline: 'Experiment AI: manage your plan' },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
  });
  await ref.set({ id: config.id });
  return config.id;
}

export default handle(async (req, res) => {
  const user = await requireUser(req);
  const customer = (await db().collection('plans').doc(user.uid).get()).data()?.customerId;
  if (!customer) throw new HttpError(400, 'You don’t have a paid plan yet.');
  const s = stripe();
  const back = `${siteOrigin(req)}/home?open=billing`;
  const session = await s.billingPortal.sessions.create({
    customer,
    configuration: await portalConfig(s),
    return_url: back,
    // "Change card": open straight on Stripe's update-your-card screen, then come back to Settings › Billing
    ...(req.body?.flow === 'card' && {
      flow_data: { type: 'payment_method_update', after_completion: { type: 'redirect', redirect: { return_url: back } } },
    }),
  });
  res.status(200).json({ url: session.url });
});
