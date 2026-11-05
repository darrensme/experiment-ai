// Settings → Connectors, in one function (Vercel's plan allows 12).
// POST /api/connectors { action, tool? }
//   list                → { connectors: [{ tool, setUp, connected, account, connectedAt }] } (never the tokens)
//   connect { tool }    → { url } the provider's sign-in page
//   disconnect { tool } → revokes the access where the provider allows it and forgets it → { disconnected: true }
//   picker { tool: 'google' } → { token, key, appId } for the Google Drive picker in the + menu
// GET /api/connect/<tool>/callback?code=…&state=… (vercel.json rewrites it here with ?tool=) — where Google, Notion,
// GitHub and Canva send people back. Saves the connection, then returns to /home?connected=<tool> or ?connect_error=…
import { HttpError, handle, requireUser } from './_shared.js';
import { requireVerified } from './_ai.js';
import { PROVIDERS, TOOLS, connectorsOf, disconnect, finishConnect, isSetUp, startConnect } from './_connectors.js';
import { accessToken } from './_tools.js';

const api = handle(async (req, res) => {
  const user = await requireUser(req);
  requireVerified(user);
  const action = String(req.body?.action || '');
  const tool = String(req.body?.tool || '');

  if (action === 'list') {
    const docs = (await connectorsOf(user.uid).get()).docs;
    const saved = Object.fromEntries(docs.map((d) => [d.id, d.data()]));
    return res.status(200).json({
      connectors: TOOLS.map((t) => ({
        tool: t, setUp: isSetUp(t), connected: Boolean(saved[t]),
        account: saved[t]?.account || null, connectedAt: saved[t]?.connectedAt || null,
      })),
    });
  }
  if (!TOOLS.includes(tool)) throw new HttpError(400, 'Unknown tool.');
  if (action === 'connect') return res.status(200).json({ url: await startConnect(user.uid, tool) });
  if (action === 'disconnect') {
    await disconnect(user.uid, tool);
    return res.status(200).json({ disconnected: true });
  }
  if (action === 'picker' && tool === 'google') {
    // Google Picker runs in the browser with the person's own (drive.file) token; files they pick become readable here
    const key = process.env.GOOGLE_PICKER_KEY;
    if (!key) throw new HttpError(503, 'The Google Drive picker isn’t set up yet.');
    return res.status(200).json({ token: await accessToken(user.uid, 'google'), key, appId: String(process.env.GOOGLE_CLIENT_ID || '').split('-')[0] });
  }
  throw new HttpError(400, 'Unknown connectors action.');
});

async function callback(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const tool = String(req.query.tool || '');
  const back = (q) => { res.statusCode = 302; res.setHeader('Location', `/home?${new URLSearchParams(q)}`); res.end(); };
  if (!PROVIDERS[tool]) return back({ connect_error: 'Unknown tool.' });
  if (req.query.error) { // they said no, or the tool refused (bad scope, app not allowed…): say what it said
    const why = String(req.query.error_description || req.query.error).slice(0, 200);
    console.error('connect refused', tool, JSON.stringify({ error: req.query.error, description: req.query.error_description || null }));
    return back({ connect_error: `${PROVIDERS[tool].name} wasn’t connected: ${why}` });
  }
  try {
    await finishConnect(tool, String(req.query.state || ''), String(req.query.code || ''));
    back({ connected: tool });
  } catch (err) {
    console.error('connect failed', tool, err instanceof HttpError ? err.message : err);
    back({ connect_error: err instanceof HttpError ? err.message : 'Something went wrong. Please try again.' });
  }
}

export default function connectors(req, res) {
  return req.method === 'GET' ? callback(req, res) : api(req, res);
}
