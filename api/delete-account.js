// POST /api/delete-account — permanently deletes the signed-in person's account and everything stored for them
// (see _account.js). A paid subscription is cancelled in Stripe first. The app confirms first. Suspended accounts can
// do this too.
import { handle, requireUser } from './_shared.js';
import { deleteAccount } from './_account.js';

export default handle(async (req, res) => {
  const user = await requireUser(req, { allowBanned: true });
  await deleteAccount(user.uid);
  res.status(200).json({ deleted: true });
});
