// Serves dist/deploy (built by `npm run build`) with the same rules as its vercel.json:
// files first; /mfe/** and /assets/** are 404 when missing; any other path is an app route.
//   npm run serve:dist            → http://localhost:8080
//   PORT=9000 npm run serve:dist
import { createReadStream, existsSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join, normalize, sep } from 'path';
import { fileURLToPath } from 'url';

const root = fileURLToPath(new URL('../dist/deploy/', import.meta.url));
const port = Number(process.env.PORT) || 8080;

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/deploy is missing: run npm run build first.');
  process.exit(1);
}

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

function sendFile(res, file) {
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache', ...SECURITY });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  const file = normalize(join(root, path));
  if (file.startsWith(root) && existsSync(file) && statSync(file).isFile()) return sendFile(res, file);
  if (/^\/(mfe|assets)\//.test(path)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY });
    return res.end('Not found');
  }
  return sendFile(res, join(root, 'index.html'));
}).listen(port, () => console.log(`WMS360 (dist/deploy) on http://localhost:${port}`));
