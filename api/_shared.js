// Shared helpers for the email-verification functions. Files starting with "_" aren't routes on Vercel.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let serviceAccount;
function admin() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new HttpError(503, 'Email verification isn’t set up yet. Please try again later.');
  // Accept the service-account JSON as-is or base64-encoded.
  serviceAccount = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  return initializeApp({ credential: cert(serviceAccount) });
}

export const auth = () => getAuth(admin());
export const db = () => getFirestore(admin());

/* The caller proves who they are with their Firebase ID token. */
export async function requireUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) throw new HttpError(401, 'Please sign in first.');
  try {
    const { uid } = await auth().verifyIdToken(token);
    return await auth().getUser(uid);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, 'Your session expired. Please sign in again.');
  }
}

/* Codes are stored only as an HMAC, keyed with the service account's private key. */
export function hashCode(uid, code) {
  admin();
  return createHmac('sha256', serviceAccount.private_key).update(`${uid}:${code}`).digest('hex');
}

export function sameHash(a, b) {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function handle(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
    try {
      await fn(req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      res.status(status).json({ error: status === 500 ? 'Something went wrong. Please try again.' : err.message });
    }
  };
}
