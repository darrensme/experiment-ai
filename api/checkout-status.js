// POST /api/checkout-status { sessionId } — called when Stripe sends someone back to /home?checkout=…
// Turns the plan on straight away (the webhook does the same, this just doesn't wait for it). Returns { status, plan }.
import { HttpError, handle, requireUser } from './_shared.js';
import { stripe, syncSubscription } from './_stripe.js';

export default handle(async (req, res) => {
  const user = await requireUser(req);
  const id = String(req.body?.sessionId || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) throw new HttpError(400, 'Unknown checkout.');
  const session = await stripe().checkout.sessions.retrieve(id, { expand: ['subscription'] }).catch(() => null);
  if (!session || session.client_reference_id !== user.uid) throw new HttpError(404, 'Unknown checkout.');
  let plan = null;
  if (session.status === 'complete' && session.subscription && typeof session.subscription === 'object') {
    plan = (await syncSubscription(session.subscription))?.plan ?? null;
  }
  res.status(200).json({ status: session.status, plan });
});
