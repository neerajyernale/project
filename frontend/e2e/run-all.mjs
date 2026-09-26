// Runs every browser suite against a running app: npm start (or set WMS_URL), then npm run e2e.
import { execFileSync } from 'child_process';
import { mkdirSync } from 'fs';

mkdirSync('e2e/output', { recursive: true });
let failed = false;
for (const suite of ['federation.mjs', 'a11y.mjs', 'role-matrix.mjs', 'role-workflows.mjs', 'order-inbound-flow.mjs']) {
  console.log(`\n=== ${suite} ===`);
  try {
    const out = execFileSync(process.execPath, [`e2e/${suite}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    process.stdout.write(out);
    if (/[1-9]\d* problems|✗|errors: (?!none)/.test(out)) failed = true;
  } catch (e) {
    process.stdout.write(e.stdout ?? '');
    failed = true;
  }
}
process.exit(failed ? 1 : 0);