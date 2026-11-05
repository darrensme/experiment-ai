// What the AI can do with a person's connected tools (the + menu → Connectors turns them on for a chat).
// api/chat.js offers these as function tools and runs them with the person's own tokens, refreshing expired ones.
// Every result is cut to RESULT_MAX characters so one big file can't swamp the conversation.
import { HttpError } from './_shared.js';
import { PROVIDERS, connectorsOf } from './_connectors.js';
import { GATEWAY } from './_ai.js';

const RESULT_MAX = 15_000;
const UA = 'Experiment-AI';
const GITHUB_INSTALL = 'https://github.com/apps/experiment-ai-by-experiment-labs/installations/new';
const form = (o) => new URLSearchParams(o).toString();
const basic = (id, secret) => `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
const cut = (s, max = RESULT_MAX) => (s.length > max ? `${s.slice(0, max)}\n…(cut off: ${s.length - max} more characters)` : s);

/* ── Tokens: refresh the ones that expire (Google 1 h, Canva 4 h, GitHub App user tokens 8 h) ── */
const REFRESH = {
  google: async (p, t) => fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ grant_type: 'refresh_token', refresh_token: t, client_id: p.id(), client_secret: p.secret() }),
  }),
  canva: async (p, t) => fetch('https://api.canva.com/rest/v1/oauth/token', {
    method: 'POST', headers: { Authorization: basic(p.id(), p.secret()), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form({ grant_type: 'refresh_token', refresh_token: t }),
  }),
  github: async (p, t) => fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: p.id(), client_secret: p.secret(), grant_type: 'refresh_token', refresh_token: t }),
  }),
};
export async function accessToken(uid, tool) {
  const ref = connectorsOf(uid).doc(tool);
  const saved = (await ref.get()).data();
  if (!saved) throw new HttpError(400, `${PROVIDERS[tool].name} isn’t connected. Connect it in Settings → Connectors.`);
  if (!saved.expiresAt || saved.expiresAt - 60_000 > Date.now() || !saved.refreshToken || !REFRESH[tool]) return saved.accessToken;
  const r = await REFRESH[tool](PROVIDERS[tool], saved.refreshToken);
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.access_token) {
    console.error('refresh', tool, r.status, JSON.stringify(t).slice(0, 300));
    throw new HttpError(401, `${PROVIDERS[tool].name} needs to be connected again (Settings → Connectors).`);
  }
  const next = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token || saved.refreshToken,
    expiresAt: t.expires_in ? Date.now() + t.expires_in * 1000 : null,
  };
  await ref.set(next, { merge: true });
  return next.accessToken;
}
// Which of the asked-for tools this person has actually connected
export async function connectedOf(uid, wanted) {
  const docs = await Promise.all(wanted.map((t) => connectorsOf(uid).doc(t).get()));
  return wanted.filter((t, i) => docs[i].exists);
}

/* ── Calling each tool's API ── */
async function call(url, init, what) {
  const r = await fetch(url, init);
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  if (!r.ok) {
    const msg = data?.message || data?.error?.message || data?.error || data?.code || r.statusText;
    throw new Error(`${what} said: ${typeof msg === 'string' ? msg : r.status}`);
  }
  return data;
}
const google = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const notion = (token, extra = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' } });
const gh = (token) => ({ headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': UA } });
const canva = (token, extra = {}) => ({ ...extra, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
const repoOk = (r) => /^[\w.-]+\/[\w.-]+$/.test(r || '');
const notionTitle = (o) => {
  if (o.object === 'database') return (o.title || []).map((t) => t.plain_text).join('') || 'Untitled';
  const prop = Object.values(o.properties || {}).find((p) => p.type === 'title');
  return (prop?.title || []).map((t) => t.plain_text).join('') || 'Untitled';
};
const DRIVE_EXPORT = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

const RUN = {
  async drive_search(uid, { query = '' }) {
    const t = await accessToken(uid, 'google');
    const q = String(query).replace(/['\\]/g, ' ').trim();
    const params = { q: `trashed=false${q ? ` and (name contains '${q}' or fullText contains '${q}')` : ''}`, pageSize: '15', fields: 'files(id,name,mimeType,modifiedTime,webViewLink)' };
    if (!q) params.orderBy = 'modifiedTime desc';
    const d = await call(`https://www.googleapis.com/drive/v3/files?${form(params)}`, google(t), 'Google Drive');
    if (!d.files?.length) return 'No files found. Experiment AI can only see Drive files the person picked with “Pick files from Google Drive” in the + menu.';
    return JSON.stringify(d.files);
  },
  async drive_read(uid, { file_id }) {
    if (!/^[\w-]{10,}$/.test(file_id || '')) return 'That file id isn’t valid.';
    const t = await accessToken(uid, 'google');
    const base = `https://www.googleapis.com/drive/v3/files/${file_id}`;
    const meta = await call(`${base}?fields=id,name,mimeType,size,webViewLink,modifiedTime`, google(t), 'Google Drive');
    let text = null;
    if (DRIVE_EXPORT[meta.mimeType]) text = await call(`${base}/export?${form({ mimeType: DRIVE_EXPORT[meta.mimeType] })}`, google(t), 'Google Drive');
    else if (/^text\/|json|xml|csv|markdown|javascript/.test(meta.mimeType) && Number(meta.size || 0) < 5_000_000) text = await call(`${base}?alt=media`, google(t), 'Google Drive');
    if (text == null) return `${JSON.stringify(meta)}\nThis kind of file (${meta.mimeType}) can’t be read as text yet; share the link instead.`;
    return `${meta.name} (${meta.webViewLink})\n\n${cut(typeof text === 'string' ? text : JSON.stringify(text))}`;
  },
  async notion_search(uid, { query = '' }) {
    const t = await accessToken(uid, 'notion');
    const d = await call('https://api.notion.com/v1/search', notion(t, { method: 'POST', body: JSON.stringify({ query: String(query), page_size: 10 }) }), 'Notion');
    if (!d.results?.length) return 'Nothing found. Experiment AI can only see the Notion pages the person shared when connecting.';
    return JSON.stringify(d.results.map((o) => ({ id: o.id, type: o.object, title: notionTitle(o), url: o.url, edited: o.last_edited_time })));
  },
  async notion_read(uid, { page_id }) {
    const id = String(page_id || '').replace(/-/g, '');
    if (!/^[a-f0-9]{32}$/i.test(id)) return 'That page id isn’t valid.';
    const t = await accessToken(uid, 'notion');
    const lines = [];
    let cursor;
    for (let i = 0; i < 3; i++) { // up to 300 blocks
      const d = await call(`https://api.notion.com/v1/blocks/${id}/children?${form({ page_size: '100', ...(cursor && { start_cursor: cursor }) })}`, notion(t), 'Notion');
      for (const b of d.results || []) {
        const rich = b[b.type]?.rich_text;
        const text = rich ? rich.map((r) => r.plain_text).join('') : b.type === 'child_page' ? `[page] ${b.child_page.title}` : b.type === 'child_database' ? `[database] ${b.child_database.title}` : '';
        if (!text) continue;
        const pre = { heading_1: '# ', heading_2: '## ', heading_3: '### ', bulleted_list_item: '- ', numbered_list_item: '1. ', to_do: b.to_do?.checked ? '[x] ' : '[ ] ', quote: '> ' }[b.type] || '';
        lines.push(b.type === 'code' ? `\`\`\`\n${text}\n\`\`\`` : pre + text);
      }
      if (!d.has_more) break;
      cursor = d.next_cursor;
    }
    return lines.length ? cut(lines.join('\n')) : 'That page is empty (or is a database; use notion_search to find its pages).';
  },
  async github_repos(uid) {
    const t = await accessToken(uid, 'github');
    const d = await call('https://api.github.com/user/repos?sort=updated&per_page=30', gh(t), 'GitHub');
    if (!d.length) return `No repositories yet. The person needs to install the Experiment AI GitHub App on their repos: ${GITHUB_INSTALL}`;
    return JSON.stringify(d.map((r) => ({ repo: r.full_name, private: r.private, description: r.description, branch: r.default_branch, updated: r.pushed_at })));
  },
  async github_read(uid, { repo, path = '', ref }) {
    if (!repoOk(repo)) return 'Give the repo as owner/name.';
    const t = await accessToken(uid, 'github');
    const clean = String(path).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/');
    const d = await call(`https://api.github.com/repos/${repo}/contents/${clean}${ref ? `?${form({ ref })}` : ''}`, gh(t), 'GitHub');
    if (Array.isArray(d)) return JSON.stringify(d.map((f) => ({ name: f.name, path: f.path, type: f.type, size: f.size })));
    if (d.encoding === 'base64' && d.content) return `${d.path} (${d.html_url})\n\n${cut(Buffer.from(d.content, 'base64').toString('utf8'))}`;
    return `${d.path}: ${d.size} bytes, too big or not text. Link: ${d.html_url}`;
  },
  async github_issues(uid, { repo, state = 'open' }) {
    if (!repoOk(repo)) return 'Give the repo as owner/name.';
    const t = await accessToken(uid, 'github');
    const st = ['open', 'closed', 'all'].includes(state) ? state : 'open';
    const d = await call(`https://api.github.com/repos/${repo}/issues?${form({ state: st, per_page: '20' })}`, gh(t), 'GitHub');
    return JSON.stringify(d.map((i) => ({
      number: i.number, title: i.title, kind: i.pull_request ? 'pull request' : 'issue', state: i.state,
      by: i.user?.login, url: i.html_url, body: (i.body || '').slice(0, 400),
    })));
  },
  async canva_designs(uid, { query = '' }) {
    const t = await accessToken(uid, 'canva');
    const d = await call(`https://api.canva.com/rest/v1/designs?${form({ ...(query && { query: String(query) }), ownership: 'any', sort_by: 'modified_descending' })}`, canva(t), 'Canva');
    const items = (d.items || []).slice(0, 20);
    if (!items.length) return 'No designs found.';
    return JSON.stringify(items.map((x) => ({ id: x.id, title: x.title || 'Untitled', edit: x.urls?.edit_url, view: x.urls?.view_url, updated: x.updated_at })));
  },
  async canva_create(uid, { title = 'Untitled design', kind = 'doc' }) {
    const t = await accessToken(uid, 'canva');
    const name = ['doc', 'presentation', 'whiteboard'].includes(kind) ? kind : 'doc';
    const d = await call('https://api.canva.com/rest/v1/designs', canva(t, {
      method: 'POST', body: JSON.stringify({ design_type: { type: 'preset', name }, title: String(title).slice(0, 255) || 'Untitled design' }),
    }), 'Canva');
    return JSON.stringify({ id: d.design?.id, title: d.design?.title, edit: d.design?.urls?.edit_url, view: d.design?.urls?.view_url });
  },
};

/* ── The function tools the model sees, per connector ── */
const fn = (name, description, properties = {}, required = []) => ({
  type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
const str = (description) => ({ type: 'string', description });
export const TOOL_DEFS = {
  google: [
    fn('drive_search', 'Search the Google Drive files the person has shared with Experiment AI. Returns names, ids and links. An empty query lists recent files.', { query: str('Words in the file name or contents') }),
    fn('drive_read', 'Read the text of one Google Drive file (Docs, Sheets as CSV, Slides, text files).', { file_id: str('The file id') }, ['file_id']),
  ],
  notion: [
    fn('notion_search', 'Search the Notion pages and databases the person shared with Experiment AI. Returns titles, ids and links.', { query: str('Words to look for; empty lists recent pages') }),
    fn('notion_read', 'Read the content of one Notion page.', { page_id: str('The page id') }, ['page_id']),
  ],
  github: [
    fn('github_repos', 'List the GitHub repositories Experiment AI can see for this person, most recently updated first.'),
    fn('github_read', 'Read a file, or list a folder, in a GitHub repository.', { repo: str('owner/name'), path: str('File or folder path; empty for the top folder'), ref: str('Branch, tag or commit (optional)') }, ['repo']),
    fn('github_issues', 'List issues and pull requests in a GitHub repository.', { repo: str('owner/name'), state: { type: 'string', enum: ['open', 'closed', 'all'] } }, ['repo']),
  ],
  canva: [
    fn('canva_designs', 'Find the person’s Canva designs. Returns titles and edit/view links.', { query: str('Words in the design title; empty lists recent designs') }),
    fn('canva_create', 'Create a new, empty Canva design and return its edit link.', { title: str('The design’s title'), kind: { type: 'string', enum: ['doc', 'presentation', 'whiteboard'] } }, ['title']),
  ],
};
const OWNER = Object.fromEntries(Object.entries(TOOL_DEFS).flatMap(([tool, defs]) => defs.map((d) => [d.function.name, tool])));

// A short line for the app while a tool runs ("Searching Notion for “roadmap”")
export function labelFor(name, args = {}) {
  const q = args.query ? ` for “${String(args.query).slice(0, 40)}”` : '';
  return {
    drive_search: `Searching Google Drive${q}`, drive_read: 'Reading a Google Drive file',
    notion_search: `Searching Notion${q}`, notion_read: 'Reading a Notion page',
    github_repos: 'Looking at your GitHub repos', github_read: `Reading ${args.path ? args.path.split('/').pop() : args.repo || 'a repo'} on GitHub`,
    github_issues: `Checking ${args.repo || 'GitHub'} issues`,
    canva_designs: `Searching Canva${q}`, canva_create: `Creating “${String(args.title || 'a design').slice(0, 40)}” in Canva`,
  }[name] || 'Using a tool';
}
export const toolOf = (name) => OWNER[name] || null;

// Run one tool call the model asked for. Never throws: problems go back to the model as text.
export async function runTool(uid, allowed, name, rawArgs) {
  const tool = OWNER[name];
  if (!tool || !allowed.includes(tool)) return `Error: ${name} isn’t available in this chat.`;
  let args = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { return 'Error: the arguments weren’t valid JSON.'; }
  try {
    return cut(await RUN[name](uid, args || {}));
  } catch (err) {
    return `Error: ${err.message || 'that didn’t work'}`;
  }
}

/* ── Web search: the AI Gateway's Perplexity search, run through a fast model that hands back the facts with sources.
      Works the same whichever model is chatting. (Brave is only used for image search, below.) ── */
const SEARCH_MODEL = 'google/gemini-3.8-flash';
export const SEARCH_COST = 0.005; // Perplexity: $5 per 1,000 searches
export const WEB_TOOL = fn('web_search',
  'Search the web for current or recent information: news, today’s or tonight’s games and scores, schedules, weather, prices, recent releases, or a fact you’re not sure about. Don’t use it for maths, writing, coding or general knowledge you already know.',
  { query: str('What to look up, in plain words (include dates or places when they matter)') },
  ['query']);
// Returns { text, usage } (usage of the helper model, for the bill)
export async function webSearch(key, uid, { query }, clockLine = '') {
  const q = String(query || '').trim().slice(0, 400);
  if (!q) return { text: 'Error: empty search.', usage: null };
  const r = await fetch(`${GATEWAY}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: SEARCH_MODEL,
      user: uid,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: `You are a web research helper. Search the web, then report the facts that answer the request: short bullet points, each with its source URL. Include exact dates, times (with time zones) and numbers. Say plainly if you couldn't find it. ${clockLine}` },
        { role: 'user', content: q },
      ],
      tools: [{ type: 'vercel:perplexity_search', config: { max_results: 6 } }],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('web search', r.status, JSON.stringify(d).slice(0, 300));
    return { text: 'Error: the web search didn’t work right now. Answer from what you know and say it may be out of date.', usage: null };
  }
  const text = d.choices?.[0]?.message?.content;
  return { text: cut(typeof text === 'string' && text.trim() ? text : 'No results found.', 8000), usage: d.usage || null, model: SEARCH_MODEL };
}

/* ── Image search (Brave Images, env BRAVE_API_KEY): the pictures are shown in the reply ── */
export const IMAGE_SEARCH_TOOL = fn('image_search',
  'Find real photos or pictures on the web when the person wants to see what something looks like (a place, animal, product, person in the news…). The images are shown to them automatically under your answer; don’t paste image links.',
  { query: str('What to find pictures of') },
  ['query']);
export const imageSearchOn = () => Boolean(process.env.BRAVE_API_KEY);
const untag = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{4,600}$/.test(u) ? u : null);
// Returns { text for the model, items for the app: [{ thumb, full, title, page, source }] }
export async function imageSearch({ query }) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) return { text: 'Error: empty search.', items: [] };
  const r = await fetch(`https://api.search.brave.com/res/v1/images/search?${form({ q, count: '12', safesearch: 'strict' })}`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY },
  });
  if (!r.ok) { console.error('brave images', r.status, (await r.text()).slice(0, 300)); return { text: 'Error: image search didn’t work right now.', items: [] }; }
  const d = await r.json();
  const items = (d.results || []).map((x) => ({
    thumb: httpsUrl(x.thumbnail?.src), full: httpsUrl(x.properties?.url) || httpsUrl(x.thumbnail?.src),
    title: untag(x.title).slice(0, 140), page: httpsUrl(x.url), source: untag(x.source || x.meta_url?.hostname || '').slice(0, 80),
  })).filter((x) => x.thumb && x.page).slice(0, 8);
  if (!items.length) return { text: 'No pictures found.', items: [] };
  return { text: `Showed ${items.length} pictures to the person: ${items.map((x, i) => `${i + 1}. ${x.title} (${x.source})`).join('; ')}`, items };
}

export const toolsPrompt = (tools, driveFiles = []) => {
  if (!tools.length) return '';
  const names = tools.map((t) => PROVIDERS[t].name).join(', ');
  const lines = [`The person connected ${names} for this chat. Use those tools when their question is about their own files, pages, code or designs, and say which tool you used. Give links when you mention a file, page or design. Don't make up contents you didn't read.`];
  if (driveFiles.length) lines.push(`They picked these Google Drive files for this chat (read them with drive_read when relevant):\n${driveFiles.map((f) => `- ${f.name} (id: ${f.id})`).join('\n')}`);
  return lines.join('\n');
};
