// POST /api/connectors { action, tool? } — Settings → Connectors.
//   list               → { connectors: [{ tool, setUp, connected, account, connectedAt }] } (never the tokens)
//   connect { tool }   → { url } the provider's sign-in page; it comes back to /api/connect/<tool>/callback
//   disconnect { tool } → revokes the access where the provider allows it and forgets it → { disconnected: true }
import { HttpError, handle, requireUser } from './_shared.js';
import { requireVerified } from './_ai.js';
import { TOOLS, connectorsOf, disconnect, isSetUp, startConnect } from './_connectors.js';

export default handle(async (req, res) => {
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
