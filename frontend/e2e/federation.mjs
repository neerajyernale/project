// Module Federation behaviour (docs/MICROFRONTEND.md §3–§5):
//  - no remote code on the login page; a remote is fetched only when its route is opened
//  - remotes reuse the shell's Angular (no second copy downloaded)
//  - a remote that fails to load shows "unavailable" in place; the shell and other remotes keep working
import puppeteer from 'puppeteer-core';

const BASE = process.env.WMS_URL ?? 'http://localhost:4200';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const problems = [];
let checks = 0;
const check = (ok, msg) => {
  checks++;
  if (!ok) problems.push(msg);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Remote files are recognised by their URL: /mfe/<name>/… (serve:dist) or http://localhost:420<n>/… (npm start).
const REMOTE_PORTS = { 4201: 'dashboard', 4202: 'warehouse', 4203: 'catalog', 4204: 'inventory', 4205: 'inbound', 4206: 'fulfillment', 4207: 'reports', 4208: 'admin' };
function remoteOf(url) {
  const u = new URL(url);
  const mfe = /^\/mfe\/([a-z-]+)\//.exec(u.pathname);
  if (mfe) return mfe[1];
  return REMOTE_PORTS[u.port] ?? null;
}

const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const fetched = []; // { remote, url, angular }
page.on('response', async (res) => {
  const remote = remoteOf(res.url());
  if (!remote || !res.url().endsWith('.js')) return;
  let body = '';
  try {
    body = await res.text();
  } catch {
    /* aborted */
  }
  // "ng-version" is written by @angular/core on the root element: present in any copy of Angular core.
  fetched.push({ remote, url: res.url(), angular: body.includes('ng-version') });
});
const remotesFetched = () => [...new Set(fetched.map((f) => f.remote))].sort();

// Fresh demo data and signed out.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
check(remotesFetched().length === 0, `login page fetched remote code: ${remotesFetched().join(', ')}`);

await page.type('#email', 'admin@wms360.com');
await page.type('#password', 'Wms360-Demo!');
await page.click('button[type=submit]');
const landed = await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 }).then(
  () => true,
  () => false,
);
await page.waitForNetworkIdle({ idleTime: 500 });
check(landed, `sign-in landed on ${page.url()}`);
check(remotesFetched().join() === 'dashboard', `after sign-in expected only the dashboard remote, got: ${remotesFetched().join(', ')}`);

// Open one route per remote.
const ROUTES = { warehouse: '/warehouses', catalog: '/products', inventory: '/inventory', inbound: '/inbound', fulfillment: '/orders', reports: '/reports', admin: '/admin/users' };
for (const [remote, route] of Object.entries(ROUTES)) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0' });
  await pause(300);
  const path = new URL(page.url()).pathname;
  const unavailable = await page.$eval('body', (b) => b.innerText.includes("couldn't load"));
  check(path === route && !unavailable, `${route} (${remote}) did not render: at ${path}${unavailable ? ', shows unavailable' : ''}`);
  check(remotesFetched().includes(remote), `${route} did not fetch the ${remote} remote`);
}
const duplicated = fetched.filter((f) => f.angular);
check(duplicated.length === 0, `remotes downloaded their own Angular: ${duplicated.map((f) => f.url).join(', ')}`);
check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);

// One remote down: its pages show "unavailable", everything else keeps working.
const broken = await browser.newPage();
await broken.setRequestInterception(true);
broken.on('request', (req) => (remoteOf(req.url()) === 'reports' ? req.abort() : req.continue()));
await broken.goto(`${BASE}/reports`, { waitUntil: 'networkidle0' });
await pause(300);
const reportsText = await broken.$eval('body', (b) => b.innerText);
check(reportsText.includes("couldn't load"), '/reports with its remote down does not show the unavailable page');
check(new URL(broken.url()).pathname === '/reports', `/reports with its remote down moved to ${broken.url()}`);
check(!!(await broken.$('.nav a.nav-item')), 'sidebar missing while a remote is down');
await broken.goto(`${BASE}/inventory`, { waitUntil: 'networkidle0' });
const inventoryOk = await broken
  .waitForFunction(() => !!document.querySelector('table tbody tr') && !document.body.innerText.includes("couldn't load"), { timeout: 20000 })
  .then(
    () => true,
    () => false,
  );
check(inventoryOk, '/inventory stopped working while the reports remote is down');

await browser.close();
console.log(`${checks} checks, ${problems.length} problems`);
for (const p of problems) console.log(` ✗ ${p}`);
process.exit(problems.length ? 1 : 0);
