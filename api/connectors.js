// Settings → Connectors, in one function (Vercel's plan allows 12).
// POST /api/connectors { action, tool? }
//   list                → { connectors: [{ tool, setUp, connected, account, connectedAt }] } (never the tokens)
//   connect { tool }    → { url } the provider's sign-in page
//   disconnect { tool } → revokes the access where the provider allows it and forgets it → { disconnected: true }
// GET /api/connect/<tool>/callback?code=…&state=… (vercel.json rewrites it here with ?tool=) — where Google, Notion,
// GitHub and Canva send people back. Saves the connection, then returns to /home?connected=<tool> or ?connect_error=…
import { HttpError, handle, requireUser } from './_shared.js';
import { requireVerified } from './_ai.js';
import { PROVIDERS, TOOLS, connectorsOf, disconnect, finishConnect, isSetUp, startConnect } from './_connectors.js';

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
  throw new HttpError(400, 'Unknown connectors action.');
});

async function callback(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const tool = String(req.query.tool || '');
  const back = (q) => { res.statusCode = 302; res.setHeader('Location', `/home?${new URLSearchParams(q)}`); res.end(); };
  if (!PROVIDERS[tool]) return back({ connect_error: 'Unknown tool.' });
  if (req.query.error) return back({ connect_error: `${PROVIDERS[tool].name} wasn’t connected.` }); // they said no
  try {
    await finishConnect(tool, String(req.query.state || ''), String(req.query.code || ''));
    back({ connected: tool });
  } catch (err) {
    if (!(err instanceof HttpError)) console.error('connect', tool, err);
    back({ connect_error: err instanceof HttpError ? err.message : 'Something went wrong. Please try again.' });
  }
}

export default function connectors(req, res) {
  return req.method === 'GET' ? callback(req, res) : api(req, res);
}
