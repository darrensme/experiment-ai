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

## The AI (app at /home)

Messages go to `api/chat.js`, which calls the **Vercel AI Gateway** (`https://ai-gateway.vercel.sh/v1`, OpenAI-compatible)
with the key in **`VERCEL_AI_GATEWAY`** and streams the reply back. Before each reply the server checks, in this order:

1. signed in (Firebase ID token) and on the access list (`ACCESS` in `api/_ai.js`, plus `APP_ACCESS_HASHES`);
2. the plan, from Firestore `plans/{uid}` `{ plan }` (no document = Free): Free gets Haiku 5.5, GPT-6 Luna and the two
   Gemini Flash models at Low/Medium effort; Light and up get every model and High;
3. the budget, in dollars of AI cost at the Gateway's list prices:

| Plan | Price | Week (price ÷ 4) | Day (week ÷ 7) |
|---|---|---|---|
| Free | (counts as $3) | $0.75 | ≈ $0.107 |
| Light | $10 | $2.50 | ≈ $0.357 |
| Pro | $20 | $5 | ≈ $0.714 |
| Max 5× | $100 | $25 | ≈ $3.57 |
| Max 10× | $200 | $50 | ≈ $7.14 |

Days and weeks are UTC (weeks start Monday). The most a reply could cost is held back first, so two chats at once
can't overspend, and the reply's length is capped to what's left; the real cost replaces the hold when it finishes.
Spending is in `usage/{uid}`; `api/usage.js` gives the app the plan and the numbers for the Usage bars.

Stripe sets plans (see Payments). To give someone a plan by hand without paying: Firestore → `plans` → document ID =
their UID → field `plan` (string) = `light`, `pro`, `max-5x` or `max-10x` (a Stripe event for them later overwrites it).

**secret.experimentai.dev** runs as a *Preview* deployment, so `VERCEL_AI_GATEWAY` and `FIREBASE_SERVICE_ACCOUNT` must
be enabled for **Preview** too (Vercel → Settings → Environment Variables → edit → tick Preview), then redeploy.
`.vercelignore` leaves out `send-code`/`verify-code` and `vercel.json` forwards them to experimentai.dev, which has the
Production email key.

## Payments (Stripe, embedded checkout)

Upgrade / See plans → pick a plan → Stripe's checkout opens **inside the plans pop-up** (embedded, `ui_mode:
'embedded_page'`). Paying sends them back to `/home?checkout=…`, which turns the plan on at once.

| Function | What it does |
|---|---|
| `api/checkout.js` | New subscriber: makes an embedded Checkout Session. Already paying: switches the subscription to the new plan or billing period right away, prorated, and only if that payment goes through. |
| `api/checkout-status.js` | Back from checkout: confirms the session belongs to this person and writes their plan. |
| `api/stripe-webhook.js` | Renewals, changes, failed payments and cancellations keep `plans/{uid}` in step. |
| `api/billing-portal.js` | "Manage billing" in Settings and the Free card: Stripe's billing page (cancel at period end, card, invoices). |
| `api/_stripe.js` | Prices and syncing. Products and prices are **created in Stripe automatically** on first use (lookup keys `experimentai_<plan>_<monthly|yearly>`): $10/$20/$100/$200 a month, yearly = 10 months. |

Deleting an account cancels its subscription in Stripe first. `/api/usage` re-checks a paid plan with Stripe every 6 hours,
in case a webhook is missed.

**No cookies.** Stripe.js loads only when checkout opens, from `js.stripe.com/endive/stripe.js?advancedFraudSignals=false`.
Tested in Chrome: the default Stripe.js sets `__stripe_mid` and `__stripe_sid` on the site; with this flag it sets no cookies
and no storage, and doesn't contact Stripe's fraud-signal hosts. The card form is Stripe's own frame on Stripe's domain
(Stripe still runs its fraud checks there), and the billing portal is a page on billing.stripe.com.

### Connect it

1. **Keys:** Stripe Dashboard → Developers → API keys. Start with **test mode** (`sk_test_…`, `pk_test_…`).
2. **Vercel env vars** (Preview for secret.experimentai.dev, Production for the main site), then redeploy:
   `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.
3. **Webhook:** Stripe → Developers → Webhooks → Add endpoint `https://secret.experimentai.dev/api/stripe-webhook`, events
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`. Optionally copy its signing secret (`whsec_…`) to `STRIPE_WEBHOOK_SECRET`; without it,
   each event is re-fetched from Stripe by ID instead, so forged calls can't change anything.
4. Try it with card `4242 4242 4242 4242`, any future date, any CVC. For live: switch both keys to live ones and add the
   webhook again in live mode.

## Notes

- Gmail's code features ("Copy code" and similar) are Gmail's own detection. The email gives it every signal
  (code in the subject, first line and set apart in the body, authenticated sender), but Google decides when to show them.
- AI logos come from `@lobehub/icons` (MIT). Check each company's brand guidelines before launch.
- The "Meta Muse" chip uses Meta's logo. Swap `public/assets/ai/meta-color.svg` for the official Muse mark if you have it.
- Comparison-table, About, pricing-feature and FAQ copy are placeholders. Make sure every claim matches the product.

## License

Proprietary. © 2026 Experiment Labs. All rights reserved. See [LICENSE](LICENSE).
