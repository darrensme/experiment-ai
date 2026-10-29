// POST /api/send-code — emails a 6-digit verification code to the signed-in user.
import { randomInt } from 'node:crypto';
import { sendCodeEmail } from './_email.js';
import { HttpError, db, handle, hashCode, requireUser } from './_shared.js';

const RESEND_AFTER_MS = 60 * 1000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const CODE_TTL_MS = 10 * 60 * 1000;

export default handle(async (req, res) => {
  const user = await requireUser(req);
  if (user.emailVerified) return res.status(200).json({ verified: true });
  if (!user.email) throw new HttpError(400, 'This account has no email address.');

  const ref = db().collection('emailCodes').doc(user.uid);
  const prev = (await ref.get()).data();
  const now = Date.now();
  if (prev && now - prev.sentAt < RESEND_AFTER_MS) {
    throw new HttpError(429, 'We just sent a code. Please wait a minute before asking for another.');
  }
  const inWindow = prev && now - prev.windowStart < WINDOW_MS;
  const sends = inWindow ? prev.sends + 1 : 1;
  if (sends > MAX_SENDS_PER_WINDOW) throw new HttpError(429, 'Too many codes requested. Please try again in an hour.');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await ref.set({
    hash: hashCode(user.uid, code),
    sentAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    sends,
    windowStart: inWindow ? prev.windowStart : now,
  });
  await sendCodeEmail(user.email, code);
  res.status(200).json({ sent: true });
});
