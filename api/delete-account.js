// POST /api/delete-account — permanently deletes the signed-in person's account and everything stored for them:
// their waitlist entry, any pending email code, and the Firebase account itself. The app confirms first.
import { auth, db, handle, requireUser } from './_shared.js';

export default handle(async (req, res) => {
  const user = await requireUser(req);
  const store = db();
  await Promise.all([
    store.collection('waitlist').doc(user.uid).delete(),
    store.collection('emailCodes').doc(user.uid).delete(),
  ]);
  await auth().deleteUser(user.uid);
  res.status(200).json({ deleted: true });
});
