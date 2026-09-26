// Assembles the production builds into one static site, dist/deploy (docs/MICROFRONTEND.md §3, §7):
//   /                                 the shell (dist/shell)
//   /mfe/<name>/                      each remote (dist/mfe-<name>)
//   /assets/config/mf.manifest.json   remote name → /mfe/<name>/remoteEntry.js
//   /vercel.json                      SPA fallback and security headers for Vercel
// Any static host works; `npm run serve:dist` serves the folder locally the same way.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const dist = join(workspace, 'dist');
const out = join(dist, 'deploy');
const remotes = JSON.parse(readFileSync(join(workspace, 'federation.remotes.json'), 'utf8'));

const missing = ['shell', ...remotes.map((r) => `mfe-${r.name}`)].filter((p) => !existsSync(join(dist, p, 'index.html')));
if (missing.length) {
  console.error(`Not built: ${missing.join(', ')}. Run npm run build.`);
  process.exit(1);
}

// Start clean, but keep .vercel (the link to the Vercel project) so redeploys don't ask again.
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) if (entry !== '.vercel') rmSync(join(out, entry), { recursive: true, force: true });

cpSync(join(dist, 'shell'), out, { recursive: true });
for (const r of remotes) cpSync(join(dist, `mfe-${r.name}`), join(out, 'mfe', r.name), { recursive: true });

const manifest = Object.fromEntries(remotes.map((r) => [r.name, `/mfe/${r.name}/remoteEntry.js`]));
writeFileSync(join(out, 'assets', 'config', 'mf.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Static files are served first; any other path is an app route. /mfe and /assets stay 404 when
// missing, so a missing remote shows "unavailable" instead of receiving index.html.
const vercel = {
  rewrites: [{ source: '/((?!mfe/|assets/).*)', destination: '/index.html' }],
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    },
  ],
};
writeFileSync(join(out, 'vercel.json'), JSON.stringify(vercel, null, 2) + '\n');

console.log(`Assembled ${out}: shell + ${remotes.map((r) => `/mfe/${r.name}`).join(', ')}`);
