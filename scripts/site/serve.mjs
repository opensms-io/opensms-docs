// Local preview of the built docs site, mounted at /docs/ like production.
//
//   node scripts/site/serve.mjs [port]
//
// LANDING_DIST=<path to the landing's dist/> also serves the landing at / so the
// shared favicons and header links resolve the way they do on opensms.io.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../../site/', import.meta.url));
const LANDING = process.env.LANDING_DIST;
const port = Number(process.argv[2] ?? 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

async function resolveFile(root, rel) {
  const p = normalize(join(root, rel));
  if (!p.startsWith(root)) return null;
  try {
    const s = await stat(p);
    if (s.isDirectory()) {
      const idx = join(p, 'index.html');
      await stat(idx);
      return idx;
    }
    return p;
  } catch { return null; }
}

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = null;
  let notFound = null;
  if (path === '/docs') { res.writeHead(301, { location: '/docs/' }); return res.end(); }
  if (path.startsWith('/docs/')) {
    const rel = path.slice('/docs/'.length);
    if (rel && !rel.endsWith('/') && !extname(rel) && (await resolveFile(SITE, rel))) {
      res.writeHead(301, { location: `${path}/` }); return res.end();
    }
    file = await resolveFile(SITE, rel);
    notFound = join(SITE, '404.html');
  } else if (LANDING) {
    file = await resolveFile(LANDING, path.slice(1));
    notFound = join(LANDING, '404.html');
  }
  if (!file) {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    try { return res.end(await readFile(notFound ?? join(SITE, '404.html'))); } catch { return res.end('not found'); }
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, '127.0.0.1', () => console.log(`docs preview on http://127.0.0.1:${port}/docs/`));
