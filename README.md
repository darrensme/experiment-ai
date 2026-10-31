# Experiment AI

The website for **Experiment AI** by **Experiment Labs**, live at https://experimentai.dev.

| Page | URL |
|---|---|
| Home (hero, model orbit, comparison, features) | `/` |
| About us (Experiment Labs) | `/aboutus` |
| Contact (contact@experimentai.dev) | `/contact` |
| Pricing (Free, Light, Pro, Max 5× / 10×) | `/pricing` |
| The app: greeting, message bar, sidebar with chats + profile (signed-in only, noindex; AI not connected yet) | `/home` |

People join the **waitlist** with **Google** or **email + password** (Firebase Authentication). Email sign-ups
confirm a **6-digit code** emailed from `noreply@experimentai.dev`; Google accounts are already verified. Each
verified person's spot is saved in **Firestore** at `waitlist/{uid}` with their **place in line** (`position`),
numbered by the `meta/waitlist` counter. Anyone signed in who opens `/` is sent to `/home`, the app
(`home.html` + `app.css` + `app.js`).

**No cookies:** Analytics runs with storage consent denied (cookieless pings), sign-in lives in browser storage,
and the "no cookies" note remembers its dismissal in `localStorage`. Keep it that way. The note promises it.

```bash
npm install
npm start          # static preview → http://localhost:3000 (pages only)
npx vercel dev     # pages + the api/ functions, with env vars from Vercel
```

## Files

```
public/              static site (Vercel serves it with clean URLs)
  index.html  aboutus.html  contact.html  pricing.html  home.html
  styles.css         sky theme, glass, every page's layout
  script.js          GSAP + Lenis, waitlist + code verification, pricing toggle, no-cookies note
  firebase.js        Firebase config, Auth, Firestore, cookieless Analytics
  assets/            logos, AI logos, plan icons (assets/plans), email-logo.png
  sitemap.xml  robots.txt
api/                 Vercel functions (Node)
  send-code.js       POST: emails a 6-digit code (1/min, 5/hour, expires in 10 min)
  verify-code.js     POST {code}: checks it (5 tries) and marks the Firebase account emailVerified
  delete-account.js  POST: deletes the signed-in account, its waitlist entry and email code (Settings → Delete)
  _email.js          the code email (HTML + text), sent with Resend
  _shared.js         Firebase Admin, ID-token check, code hashing
firestore.rules      publish in the Firebase console
server.js            static preview server
vercel.json          clean URLs + security headers
```

Nav, footer and the waitlist modal are repeated in each page. Change them in all five.

## Setup

### Vercel environment variables (Production)

| Name | Value |
|---|---|
| `RESEND_API_KEY` | Resend API key with **Full access** (lets setup add the domain) |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service-account JSON (Project settings → Service accounts → Generate new private key) |

Without them the site works, but email sign-ups stop at "Email verification isn't set up yet" (Google still works).

### Email

- **Inboxes** (contact@ and others) are **Zoho Mail**: MX `mx/mx2/mx3.zoho.com`, DKIM `zmail._domainkey`. Leave them alone.
- **Sending** the verification code (noreply@experimentai.dev) goes through **Resend** (free: 100/day, 3,000/month;
  no postal address needed for transactional email). Add `experimentai.dev` in Resend and create its DNS records in
  Vercel: DKIM `resend._domainkey`, plus MX and SPF on the `send` subdomain. Resend's SPF lives on `send.`, so the
  root SPF (`include:zohomail.com`) stays as it is. Add DMARC: `_dmarc` TXT `v=DMARC1; p=none;`.
- Emailing the whole waitlist at launch is marketing email and legally needs a postal address (e.g. a P.O. box).

### Firebase

1. **Authentication → Sign-in method:** enable **Google** and **Email/Password**.
2. **Authentication → Settings → Authorized domains:** `experimentai.dev`, `www.experimentai.dev`.
3. **Firestore Database → Rules:** paste `firestore.rules` and **Publish**.

See who joined in **Firestore → Data → waitlist** (or **Authentication → Users**).

## Notes

- Gmail's code features ("Copy code" and similar) are Gmail's own detection. The email gives it every signal
  (code in the subject, first line and set apart in the body, authenticated sender), but Google decides when to show them.
- AI logos come from `@lobehub/icons` (MIT). Check each company's brand guidelines before launch.
- The "Meta Muse" chip uses Meta's logo. Swap `public/assets/ai/meta-color.svg` for the official Muse mark if you have it.
- Comparison-table, About, pricing-feature and FAQ copy are placeholders. Make sure every claim matches the product.

## License

Proprietary. © 2026 Experiment Labs. All rights reserved. See [LICENSE](LICENSE).
