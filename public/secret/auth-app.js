// /home is for signed-in accounts: fills the sidebar with your real name and picture, and handles Log out.
// Same rule as the landing page (script.js): email confirmed with the 6-digit code, or signed in with Google.
// Also gives settings.js what it needs from Firebase: a sign-in token for the API, renaming, and signing out.
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';

const LIVE = /(^|\.)experimentai\.dev$/.test(location.hostname);
const isVerified = (user) => user.emailVerified || user.providerData.some((p) => p.providerId === 'google.com');

document.querySelectorAll('[data-signout]').forEach((b) => b.addEventListener('click', async () => {
  if (window.eaAuth && typeof window.logOut === 'function') return window.logOut(); // settings.js: saves, clears this browser's copy
  try { await signOut(auth); } finally { location.replace('/'); }
}));

if (LIVE) {
  onAuthStateChanged(auth, (user) => {
    if (!user || !isVerified(user)) { location.replace('/?login'); return; } // not signed in, or email not confirmed
    window.eaAuth = {
      uid: user.uid,
      token: () => auth.currentUser.getIdToken(),
      updateName: (displayName) => updateProfile(auth.currentUser, { displayName }),
      signOut: () => signOut(auth),
    };
    window.setAccount({
      name: user.displayName || (user.email || '').split('@')[0] || 'You',
      email: user.email || '',
      photo: user.photoURL || '',
      providers: user.providerData.map((p) => p.providerId),
    });
  });
} else {
  window.setAccount(null); // local preview: no sign-in, stays "Guest"
}
