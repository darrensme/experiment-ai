// POST /api/usage — the signed-in person's plan, what they've spent today and this week, and their budgets (dollars).
// The app shows these as percentages and uses the plan to unlock models and features.
import { handle, requireUser } from './_shared.js';
import { budgetsFor, planOf, readSpent, requireAccess } from './_ai.js';

export default handle(async (req, res) => {
  const user = await requireUser(req);
  requireAccess(user);
  const plan = await planOf(user.uid);
  res.status(200).json({ plan, spent: await readSpent(user.uid), budgets: budgetsFor(plan) });
});
