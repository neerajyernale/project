// Accessibility: axe-core (WCAG 2.1 A and AA rules) on every screen, signed in as admin,
// plus the sign-in page and an open dialog.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import puppeteer from 'puppeteer-core';

const BASE = process.env.WMS_URL ?? 'http://localhost:4200';
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 900 });

const problems = [];
let checks = 0;

async function audit(label) {
  await page.waitForNetworkIdle({ idleTime: 400 });
  // Wait for the page's own loading state to finish so the audited DOM is the real one.
  await page.waitForFunction(() => !document.querySelector('.skeleton, [aria-busy="true"]'), { timeout: 15000 }).catch(() => undefined);
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')), count: v.nodes.length }));
  });
  checks++;
  for (const v of result) problems.push(`${label}: [${v.impact}] ${v.id} — ${v.help} (${v.count}×, e.g. ${v.targets.join(' | ')})`);
}

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
await audit('/login');

await page.type('#email', 'admin@wms360.com');
await page.type('#password', 'Wms360-Demo!');
await page.click('button[type=submit]');
await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });

const ROUTES = [
  '/dashboard', '/warehouses', '/warehouses/wh-mum/overview', '/warehouses/wh-mum/zones', '/warehouses/wh-mum/bins',
  '/warehouses/wh-mum/inventory', '/warehouses/wh-mum/orders', '/warehouses/wh-mum/activity', '/warehouses/wh-mum/performance',
  '/products', '/suppliers', '/customers', '/inventory', '/inventory/movements', '/transfers',
  '/inbound', '/orders', '/outbound', '/picking', '/packing', '/shipping', '/reports',
  '/admin/users', '/admin/roles', '/settings',
];
for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0' });
  await audit(route);
}

// A detail page and a dialog.
await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle0' });
const firstOrder = await page.$('tbody a.code');
if (firstOrder) {
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), firstOrder.click()]);
  await audit('order detail');
}
await page.goto(`${BASE}/orders`, { waitUntil: 'networkidle0' });
const newOrder = await page.$$eval('.page-actions button', (bs) => bs.findIndex((b) => b.textContent?.includes('New order')));
if (newOrder >= 0) {
  await (await page.$$('.page-actions button'))[newOrder].click();
  await page.waitForSelector('[role=dialog]', { timeout: 10000 });
  await audit('new order dialog');
}

await browser.close();
console.log(`${checks} pages audited, ${problems.length} problems`);
for (const p of problems) console.log(` ✗ ${p}`);
process.exit(problems.length ? 1 : 0);
