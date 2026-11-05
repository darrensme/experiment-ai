// Connectors (Settings → Connectors): Google Drive, Notion, GitHub and Canva, each with its own OAuth sign-in.
// Tokens are kept server-side in Firestore at profiles/{uid}/connectors/{tool} (no Firestore rule lets a browser read
// them) and are never sent to the app. A sign-in in progress is connectStates/{state} for up to 10 minutes.
//
// Env (Vercel): GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, NOTION_CLIENT_SECRET (+ NOTION_CLIENT_ID),
// GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET (the GitHub App's), CANVA_CLIENT_SECRET (+ CANVA_CLIENT_ID).
// Each provider must list https://secret.experimentai.dev/api/connect/<tool>/callback as a redirect / callback URL.
import { createHash, randomBytes } from 'node:crypto';
import { HttpError, db } from './_shared.js';

const ORIGIN = process.env.CONNECT_ORIGIN || 'https://secret.experimentai.dev';
export const redirectUri = (tool) => `${ORIGIN}/api/connect/${tool}/callback`;
const STATE_MS = 10 * 60_000;
const basic = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
const form = (o) => new URLSearchParams(o).toString();

async function json(r, what) {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error(what, r.status, JSON.stringify(data).slice(0, 400));
    const why = data.error_description || data.message || data.error || `error ${r.status}`;
    throw new HttpError(502, `That sign-in didn’t work (${String(why).slice(0, 160)}). Please try again.`);
  }
  return data;
}

// Only what the AI's Canva tools use (find designs, create one, show who's connected). Asking for scopes the Canva
// integration doesn't have switched on fails with "requested scope not allowed in client". Override with CANVA_SCOPES.
const CANVA_SCOPES = (process.env.CANVA_SCOPES || 'profile:read design:meta:read design:content:read design:content:write').trim();

export const PROVIDERS = {
  google: {
    name: 'Google Drive',
    id: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorize: (p, state) => `https://accounts.google.com/o/oauth2/v2/auth?${form({
      client_id: p.id(), redirect_uri: redirectUri('google'), response_type: 'code', state,
      scope: 'https://www.googleapis.com/auth/drive.file openid email', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    })}`,
    async exchange(p, code) {
      const t = await json(await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ code, client_id: p.id(), client_secret: p.secret(), redirect_uri: redirectUri('google'), grant_type: 'authorization_code' }),
      }), 'google token');
      const me = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
      return { accessToken: t.access_token, refreshToken: t.refresh_token || null, expiresAt: Date.now() + (t.expires_in || 3600) * 1000, scope: t.scope || '', account: me.email || 'Google account' };
    },
    async revoke(p, saved) {
      const token = saved.refreshToken || saved.accessToken;
      await fetch(`https://oauth2.googleapis.com/revoke?${form({ token })}`, { method: 'POST' });
    },
  },
  notion: {
    name: 'Notion',
    id: () => process.env.NOTION_CLIENT_ID || '40bd872b-594c-81f2-a240-003787b47a04',
    secret: () => process.env.NOTION_CLIENT_SECRET,
    authorize: (p, state) => `https://api.notion.com/v1/oauth/authorize?${form({
      client_id: p.id(), redirect_uri: redirectUri('notion'), response_type: 'code', owner: 'user', state,
    })}`,
    async exchange(p, code) {
      const t = await json(await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: { Authorization: basic(p.id(), p.secret()), 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
        body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri('notion') }),
      }), 'notion token');
      return { accessToken: t.access_token, refreshToken: t.refresh_token || null, expiresAt: null, scope: '', account: t.workspace_name || t.owner?.user?.name || 'Notion workspace', workspaceId: t.workspace_id || null };
    },
    async revoke() {}, // Notion has no revoke call; they can remove the connection in Notion's settings too
  },
  github: {
    name: 'GitHub',
    id: () => process.env.GITHUB_CLIENT_ID,
    secret: () => process.env.GITHUB_CLIENT_SECRET,
    authorize: (p, state) => `https://github.com/login/oauth/authorize?${form({ client_id: p.id(), redirect_uri: redirectUri('github'), state })}`,
    async exchange(p, code) {
      const t = await json(await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: p.id(), client_secret: p.secret(), code, redirect_uri: redirectUri('github') }),
      }), 'github token');
      if (t.error) { console.error('github token', t.error); throw new HttpError(502, 'That sign-in didn’t work. Please try again.'); }
      const me = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${t.access_token}`, 'User-Agent': 'Experiment-AI' } }).then((r) => r.json()).catch(() => ({}));
      return {
        accessToken: t.access_token, refreshToken: t.refresh_token || null,
        expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : null, scope: t.scope || '', account: me.login ? `@${me.login}` : 'GitHub account',
      };
    },
    async revoke(p, saved) {
      await fetch(`https://api.github.com/applications/${p.id()}/grant`, {
        method: 'DELETE',
        headers: { Authorization: basic(p.id(), p.secret()), Accept: 'application/vnd.github+json', 'User-Agent': 'Experiment-AI', 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: saved.accessToken }),
      });
    },
  },
  canva: {
    name: 'Canva',
    pkce: true,
    id: () => process.env.CANVA_CLIENT_ID || 'OC-AaGY9OnsfMj2',
    secret: () => process.env.CANVA_CLIENT_SECRET,
    authorize: (p, state, challenge) => `https://www.canva.com/api/oauth/authorize?${form({
      client_id: p.id(), redirect_uri: redirectUri('canva'), response_type: 'code', scope: CANVA_SCOPES, state,
      code_challenge: challenge, code_challenge_method: 's256',
    })}`,
    async exchange(p, code, verifier) {
      const t = await json(await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: { Authorization: basic(p.id(), p.secret()), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri('canva') }),
      }), 'canva token');
      const me = await fetch('https://api.canva.com/rest/v1/users/me/profile', { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
      return { accessToken: t.access_token, refreshToken: t.refresh_token || null, expiresAt: Date.now() + (t.expires_in || 14400) * 1000, scope: t.scope || '', account: me.profile?.display_name || 'Canva account' };
    },
    async revoke(p, saved) {
      await fetch('https://api.canva.com/rest/v1/oauth/revoke', {
        method: 'POST',
        headers: { Authorization: basic(p.id(), p.secret()), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({ token: saved.refreshToken || saved.accessToken }),
      });
    },
  },
};
export const TOOLS = Object.keys(PROVIDERS);
export const isSetUp = (tool) => Boolean(PROVIDERS[tool]?.id() && PROVIDERS[tool]?.secret());
export const connectorsOf = (uid) => db().collection('profiles').doc(uid).collection('connectors');

// Start a sign-in: remember who it's for, return the provider's sign-in page.
export async function startConnect(uid, tool) {
  const p = PROVIDERS[tool];
  if (!p) throw new HttpError(400, 'Unknown tool.');
  if (!isSetUp(tool)) throw new HttpError(503, `${p.name} isn’t set up yet.`);
  const state = randomBytes(24).toString('hex');
  const verifier = p.pkce ? randomBytes(48).toString('base64url') : null;
  const challenge = verifier ? createHash('sha256').update(verifier).digest('base64url') : null;
  await db().collection('connectStates').doc(state).set({ uid, tool, verifier, at: Date.now() });
  return p.authorize(p, state, challenge);
}

// The provider sent them back: check the state, swap the code for tokens, save them.
export async function finishConnect(tool, state, code) {
  const p = PROVIDERS[tool];
  if (!p || !/^[a-f0-9]{48}$/.test(state || '') || !code) throw new HttpError(400, 'That sign-in link isn’t valid. Please try again.');
  const ref = db().collection('connectStates').doc(state);
  const saved = (await ref.get()).data();
  await ref.delete();
  if (!saved || saved.tool !== tool || Date.now() - saved.at > STATE_MS) throw new HttpError(400, 'That sign-in took too long. Please try again.');
  const tokens = await p.exchange(p, code, saved.verifier);
  await connectorsOf(saved.uid).doc(tool).set({ ...tokens, connectedAt: Date.now() });
  return tokens.account;
}

export async function disconnect(uid, tool) {
  const p = PROVIDERS[tool];
  if (!p) throw new HttpError(400, 'Unknown tool.');
  const ref = connectorsOf(uid).doc(tool);
  const saved = (await ref.get()).data();
  if (saved && isSetUp(tool)) await p.revoke(p, saved).catch((err) => console.error('revoke', tool, err?.message));
  await ref.delete();
}
