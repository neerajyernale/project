// Serves the production builds the way they are deployed (docs/MICROFRONTEND.md §3, §7):
//   /                     dist/shell (SPA fallback to index.html)
//   /mfe/<name>/          dist/mfe-<name>
//   /assets/config/mf.manifest.json   rendered at startup, pointing at /mfe/<name>/remoteEntry.js
// remoteEntry.js and index.html are served no-cache; hashed files immutable.
//   npm run serve:dist            (after npm run build) → http://localhost:8080
//   PORT=9000 npm run serve:dist
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize, sep } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const remotes = JSON.parse(readFileSync(new URL('../federation.remotes.json', import.meta.url), 'utf8'));
const port = Number(process.env.PORT) || 8080;

const missing = ['shell', ...remotes.map((r) => `mfe-${r.name}`)].filter((p) => !existsSync(join(root, p, 'index.html')));
if (missing.length) console.warn(`Not built yet (run npm run build): ${missing.join(', ')}. Those remotes will show as unavailable.`);

const manifest = JSON.stringify(Object.fromEntries(remotes.map((r) => [r.name, `/mfe/${r.name}/remoteEntry.js`])), null, 2);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', cache = 'no-cache') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': cache, ...SECURITY });
  res.end(body);
}

function sendFile(res, file) {
  const name = file.split(sep).pop();
  const hashed = /\.[0-9a-f]{16,}\./.test(name);
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...SECURITY,
  });
  createReadStream(file).pipe(res);
}

/** Resolves a URL path inside `base`, refusing anything that escapes it. */
function inside(base, urlPath) {
  const file = normalize(join(base, decodeURIComponent(urlPath)));
  return file.startsWith(base) && existsSync(file) && statSync(file).isFile() ? file : null;
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (path === '/assets/config/mf.manifest.json') return send(res, 200, manifest, TYPES['.json']);

  const mfe = /^\/mfe\/([a-z-]+)(\/.*)$/.exec(path);
  if (mfe) {
    const file = inside(join(root, `mfe-${mfe[1]}`) + sep, mfe[2]);
    return file ? sendFile(res, file) : send(res, 404, 'Not found');
  }

  const shell = join(root, 'shell') + sep;
  const file = inside(shell, path);
  if (file) return sendFile(res, file);
  // Unknown files are 404; any other path is an app route.
  if (extname(path)) return send(res, 404, 'Not found');
  const index = join(shell, 'index.html');
  return existsSync(index) ? sendFile(res, index) : send(res, 503, 'dist/shell is missing: run npm run build');
}).listen(port, () => console.log(`WMS360 (production build) on http://localhost:${port}`));
