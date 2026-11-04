// Firebase: Authentication (Google or email + password) for waitlist accounts, Firestore for the waitlist, Analytics for page views.
// This web config is public by design. Data is protected by firestore.rules, not by hiding these values.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import { getAnalytics, isSupported, setConsent } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-analytics.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

// On the live site, Google sign-in runs through experimentai.dev/__/auth (vercel.json proxies it to Firebase),
// so Google's account chooser says "continue to experimentai.dev". Elsewhere (localhost, previews) use Firebase's own domain.
const LIVE = /(^|\.)experimentai\.dev$/.test(location.hostname);

const firebaseConfig = {
  apiKey: 'AIzaSyDoU9pR0JMc_kmipBBv8Q25_tgAa5UnBxE',
  authDomain: LIVE ? 'experimentai.dev' : 'experiment-labs-ai.firebaseapp.com',
  projectId: 'experiment-labs-ai',
  storageBucket: 'experiment-labs-ai.firebasestorage.app',
  messagingSenderId: '358435225551',
  appId: '1:358435225551:web:a2aeadeced1699bb51dcba',
  measurementId: 'G-LS4CG7DZ8W',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Cookie-free analytics: with storage consent denied, Google Analytics sends cookieless pings and never
// writes its _ga cookies. Keep it this way — the site promises "no cookies".
setConsent({ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
isSupported().then((ok) => ok && getAnalytics(app)).catch(() => {});

/* Friendly text for the Firebase Auth errors people actually hit. */
const AUTH_ERRORS = {
  'auth/account-exists-with-different-credential': 'That email already joined another way. Try the other sign-in option.',
  'auth/invalid-credential': 'That email and password don’t match.',
  'auth/wrong-password': 'That email and password don’t match.',
  'auth/invalid-email': 'Enter a valid email.',
  'auth/weak-password': 'Password needs at least 8 characters.',
  'auth/unauthorized-domain': 'This site isn’t approved for sign-in yet (Firebase → Authentication → Settings → Authorized domains).',
  'auth/operation-not-allowed': 'That sign-in option isn’t switched on yet (Firebase → Authentication → Sign-in method).',
  'auth/configuration-not-found': 'Sign-in isn’t set up yet (Firebase → Authentication → Get started).',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/user-disabled': 'This account has been disabled.',
};
export const authMessage = (err) => AUTH_ERRORS[err?.code] || 'Something went wrong. Please try again.';
