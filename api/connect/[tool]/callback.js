// GET /api/connect/<tool>/callback?code=…&state=… — where Google, Notion, GitHub and Canva send people back after they
// allow Experiment AI. Saves the connection, then returns to the app: /home?connected=<tool> or /home?connect_error=…
import { HttpError } from '../../_shared.js';
import { PROVIDERS, finishConnect } from '../../_connectors.js';

export default async function callback(req, res) {
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
