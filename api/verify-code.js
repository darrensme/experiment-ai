// POST /api/verify-code { code } — checks the code and marks the Firebase account's email as verified.
import { HttpError, auth, db, handle, hashCode, requireUser, sameHash } from './_shared.js';

const MAX_ATTEMPTS = 5;

export default handle(async (req, res) => {
  const user = await requireUser(req);
  if (user.emailVerified) return res.status(200).json({ verified: true });

  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code from the email.');

  const ref = db().collection('emailCodes').doc(user.uid);
  const entry = (await ref.get()).data();
  if (!entry) throw new HttpError(400, 'Send yourself a new code first.');
  if (Date.now() > entry.expiresAt) throw new HttpError(400, 'That code expired. Send a new one.');
  if (entry.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many tries. Send a new code.');

  if (!sameHash(entry.hash, hashCode(user.uid, code))) {
    await ref.update({ attempts: entry.attempts + 1 });
    throw new HttpError(400, 'That code isn’t right. Check the email and try again.');
  }

  await auth().updateUser(user.uid, { emailVerified: true });
  await ref.delete();
  res.status(200).json({ verified: true });
});
