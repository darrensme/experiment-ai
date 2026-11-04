// Local preview server, routed like vercel.json: /assets/… from public/assets, every other page or file from
// public/waitlist (experimentai.dev) or public/secret (secret.experimentai.dev), with clean URLs (/pricing → pricing.html).
//   npm start                 → the waitlist site at http://localhost:3000
//   SITE=secret npm start     → the secret site (the app)
// It doesn't run api/ (verification codes, chat, Stripe); use `npx vercel dev` for those.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), 'public');
const SITE = process.env.SITE === 'secret' ? 'secret' : 'waitlist';
const PORT = Number(process.env.PORT) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  const clean = path === '/' ? '/index.html' : extname(path) ? path : `${path.replace(/\/$/, '')}.html`;
  const file = normalize(path.startsWith('/assets/') ? join(PUBLIC, clean) : join(PUBLIC, SITE, clean));
  if (!file.startsWith(PUBLIC + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(PORT, () => console.log(`Experiment AI (${SITE} site) → http://localhost:${PORT}`));
