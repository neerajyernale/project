// Builds the shell and every remote (production) into dist/<project>.
//   npm run build                  everything
//   npm run build -- inventory     one remote (independent release)
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { fileURLToPath } from 'url';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const remotes = JSON.parse(readFileSync(join(workspace, 'federation.remotes.json'), 'utf8'));
const { WORKSPACE_LIBS } = createRequire(import.meta.url)('../federation.webpack.js');

const wanted = process.argv.slice(2);
const projects = wanted.length
  ? wanted.map((n) => (n === 'shell' ? n : `mfe-${n}`))
  : ['shell', ...remotes.map((r) => `mfe-${r.name}`)];

for (const project of projects) {
  console.log(`\n=== ${project} ===`);
  execFileSync('npx', ['ng', 'build', project], { stdio: 'inherit', shell: true });
}

// Every build must offer @wms/core and @wms/design-system to the share scope; one that doesn't
// would run a private copy (an empty session) without any build error.
const problems = [];
for (const project of projects) {
  const dir = join(workspace, 'dist', project);
  const entry = project === 'shell' ? readdirSync(dir).find((f) => /^main\..*\.js$/.test(f)) : 'remoteEntry.js';
  const code = entry ? readFileSync(join(dir, entry), 'utf8') : '';
  for (const [lib, { version }] of Object.entries(WORKSPACE_LIBS)) {
    if (!code.includes(`"${lib}","${version}"`)) problems.push(`${project} does not share ${lib}@${version}`);
  }
}
if (problems.length) {
  console.error(`\nShared-library check failed:\n  ${problems.join('\n  ')}\nClear .angular/cache and build again.`);
  process.exit(1);
}
console.log(`\nBuilt and verified: ${projects.join(', ')}`);

// A full build also produces the deployable site (dist/deploy).
if (!wanted.length) execFileSync(process.execPath, [join(workspace, 'scripts', 'assemble-deploy.mjs')], { stdio: 'inherit' });
