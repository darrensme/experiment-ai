# Experiment AI

The website for **Experiment AI** by **Experiment Labs**: a landing page, real sign up / log in, and a
signed-in chat app. No dependencies: Node's built-in `http`, `crypto` and `sqlite`.

```bash
npm start          # http://localhost:3000
npm run dev        # same, restarts on server changes
PORT=8080 npm start
```

Requires Node 22.13+ (built-in SQLite).

## How it works

```
server.js      HTTP server: static files, auth + chat API, members-only /app
db.js          SQLite schema + queries (database lives in data/, git-ignored)
public/
  index.html   landing page (hero, model orbit, comparison, features)
  app.html     signed-in chat app (/app)
  styles.css   shared sky theme, glass, landing styles
  app.css      app layout
  script.js    landing interactions + auth modal
  app.js       chat, model picker, account menu
  assets/      logos (sky bottle = Experiment AI, potion orb = Experiment Labs) + AI logos
```

| Route | |
|---|---|
| `POST /api/signup` | `{name, email, password}` → creates user, starts session |
| `POST /api/login` | `{email, password}` |
| `POST /api/logout` | ends session |
| `GET /api/me` | current user |
| `GET/POST/DELETE /api/messages` | chat history for the signed-in user |

- Passwords are hashed with scrypt; sessions are random tokens stored hashed, sent as an
  `HttpOnly; SameSite=Lax` cookie (add `Secure` by running with `NODE_ENV=production` behind HTTPS).
- Login/sign-up are rate limited (10 tries / 15 min per IP).
- **AI replies are placeholders.** Connect the real models in `reply()` in `server.js`;
  `pickModel()` is the stub that decides which model "Auto" uses.

## Hosting

Needs a host that runs Node with a writable disk for `data/` (e.g. Render, Railway, Fly.io, a VPS).
Static-only hosts (GitHub Pages, plain Vercel static) will show the landing page but sign up won't work.

## Notes

- AI logos come from `@lobehub/icons` (MIT). Check each company's brand guidelines before launch.
- The "Meta Muse" chip uses Meta's logo. Swap `public/assets/ai/meta-color.svg` for the official Muse mark if you have it.
- Comparison-table copy is marketing placeholder. Make sure every claim matches the product.

## License

Proprietary. © 2026 Experiment Labs. All rights reserved. See [LICENSE](LICENSE).
