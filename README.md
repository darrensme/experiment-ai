# Experiment AI

The website for **Experiment AI** by **Experiment Labs**: a landing page with a waitlist.
People join with **Google** or **email + password** (Firebase Authentication), and each person's spot is
saved in **Firestore** at `waitlist/{uid}` (name, email, provider, joinedAt).

The site is static. Everything ships from `public/`, so Vercel serves it as-is with no functions.

```bash
npm start          # local preview → http://localhost:3000
```

(Pages use ES modules, so open them through the server, not by double-clicking the HTML file.)

## Files

```
public/
  index.html   landing page (hero, model orbit, comparison, features, waitlist modal)
  styles.css   sky theme, glass, layout
  script.js    animations + waitlist flow
  firebase.js  Firebase config, Auth, Firestore, Analytics
  assets/      logos (sky bottle = Experiment AI, potion orb = Experiment Labs) + AI logos
firestore.rules  security rules to publish in the Firebase console
server.js        tiny local preview server (not used on Vercel)
vercel.json      serves public/ + basic security headers
```

## Firebase setup (one time)

1. **Authentication → Sign-in method:** enable **Google** and **Email/Password**.
2. **Authentication → Settings → Authorized domains:** add every domain the site runs on
   (e.g. `your-project.vercel.app` and any custom domain). `localhost` is there by default.
   Google sign-in fails on domains that aren't listed.
3. **Firestore Database → Rules:** paste `firestore.rules` and **Publish**. Until then, sign-in works but
   saving the waitlist spot is refused.

See who joined in **Firestore Database → Data → waitlist** (or **Authentication → Users**).

## Notes

- The Firebase web config in `public/firebase.js` is meant to be public. Security comes from
  `firestore.rules`: each person can create and read only their own entry, and nobody can list the
  waitlist from the browser.
- AI logos come from `@lobehub/icons` (MIT). Check each company's brand guidelines before launch.
- The "Meta Muse" chip uses Meta's logo. Swap `public/assets/ai/meta-color.svg` for the official Muse mark if you have it.
- Comparison-table copy is marketing placeholder. Make sure every claim matches the product.

## License

Proprietary. © 2026 Experiment Labs. All rights reserved. See [LICENSE](LICENSE).
