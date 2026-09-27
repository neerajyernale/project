// End-to-end against the real Spring Boot API (not the in-browser mock):
//   backend:  SPRING_PROFILES_ACTIVE=local,seed java -jar wms360-api.jar   (port 8080)
//   frontend: npm run start:backend                                         (port 4200, proxies /api)
//
// Covers every navigation page, a cycle count from start to approval, the audit log, password
// reset through the emailed link, and two-factor sign-in with real TOTP codes.
// Needs a psql on PATH or PSQL, and DB_URL-style access (PGPASSWORD) to read the email outbox.
import { createHmac } from 'crypto';
import { execFileSync } from 'child_process';
import puppeteer from 'puppeteer-core';

const BASE = process.env.WMS_URL ?? 'http://localhost:4200';
const PSQL = process.env.PSQL ?? 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe';
const PASSWORD = 'Wms360-Demo!';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  defaultViewport: { width: 1440, height: 900 },
});
const results = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function sql(query) {
  return execFileSync(PSQL, ['-h', 'localhost', '-U', process.env.PGUSER ?? 'postgres', '-d', process.env.PGDATABASE ?? 'wms360', '-Atc', query], {
    encoding: 'utf8',
  }).trim();
}

/** RFC 6238 TOTP, as an authenticator app computes it. */
function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/\s/g, '')) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, '0');
}

/** Each scenario gets its own incognito context: no cookies or storage from the previous one. */
async function newPage() {
  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();
  page.ctx = context;
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`page error: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) page.problems.push(`${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return page;
}

async function clickText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, t) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t) && !e.disabled);
      if (el) el.click();
      return !!el;
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`no ${selector} with text "${text}"`);
}

async function login(page, email, password = PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', password);
  await page.click('button[type=submit]');
}

async function scenario(name, fn) {
  const page = await newPage();
  const started = Date.now();
  try {
    await fn(page);
    if (page.problems.length) throw new Error(page.problems.join('\n'));
    results.push({ name, ok: true, ms: Date.now() - started });
  } catch (e) {
    results.push({ name, ok: false, error: e.message.split('\n').slice(0, 4).join(' | ') });
    await page.screenshot({ path: `e2e/output/backend-fail-${name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => undefined);
  } finally {
    await page.ctx.close();
  }
}

// ---------------------------------------------------------------------------------------------

await scenario('Admin signs in and every page loads from the API', async (page) => {
  await login(page, 'admin@wms360.com');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  const pages = ['/dashboard', '/warehouses', '/inventory', '/inventory/movements', '/inventory/counts', '/products', '/inbound', '/outbound',
    '/orders', '/picking', '/packing', '/shipping', '/transfers', '/suppliers', '/customers', '/reports', '/admin/users', '/admin/roles',
    '/admin/audit', '/settings'];
  for (const p of pages) {
    await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle0' });
    const shown = await page.evaluate(() => {
      const t = document.body.innerText;
      return { heading: document.querySelector('h1')?.textContent ?? '', broken: /Something went wrong|unavailable|Page not found/i.test(t) };
    });
    if (!shown.heading || shown.broken) throw new Error(`${p}: heading "${shown.heading}", broken=${shown.broken}`);
  }
});

await scenario('Inventory manager runs a cycle count to approval', async (page) => {
  await login(page, 'priya.menon@wms360.com');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  await page.goto(`${BASE}/inventory/counts`, { waitUntil: 'networkidle0' });
  await clickText(page, 'button', 'New count');
  await page.waitForSelector('#cc-wh');
  await page.waitForFunction(() => document.querySelectorAll('#cc-wh option').length > 1);
  await page.evaluate(() => {
    const s = document.querySelector('#cc-wh');
    s.value = [...s.options].find((o) => o.textContent.includes('Pune')).value;
    s.dispatchEvent(new Event('change'));
  });
  await page.type('#cc-note', 'E2E count');
  await clickText(page, 'button[type=submit]', 'Start count');
  await page.waitForFunction(() => /\/inventory\/counts\/.+/.test(location.pathname), { timeout: 15000 });
  await page.waitForSelector('.count-input');
  await clickText(page, 'button', 'Fill blanks with expected');
  // One bin is short by 2.
  const first = await page.$('.count-input');
  const expected = Number(await page.evaluate((el) => el.value, first));
  await first.click({ clickCount: 3 });
  await first.type(String(Math.max(0, expected - 2)));
  await clickText(page, 'button', 'Save counts');
  await page.waitForFunction(() => document.body.innerText.includes('Approve and adjust stock'), { timeout: 15000 });
  await clickText(page, 'button', 'Approve and adjust stock');
  await page.waitForSelector('.dialog');
  await clickText(page, '.dialog button', 'Approve and adjust');
  await page.waitForFunction(() => /Approved/i.test(document.querySelector('h1')?.textContent ?? ''), { timeout: 15000 });
  const number = await page.evaluate(() => document.querySelector('h1').textContent.trim().split(' ')[0]);
  const posted = sql(`select count(*) from wms.inventory_movements where reference = '${number}' and type = 'ADJUST'`);
  if (posted !== '1') throw new Error(`expected 1 ledger adjustment for ${number}, found ${posted}`);
});

await scenario('Admin reads the audit log', async (page) => {
  await login(page, 'admin@wms360.com');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelectorAll('.data-table tbody tr').length > 0, { timeout: 15000 });
  const text = await page.evaluate(() => document.querySelector('.data-table').innerText);
  if (!/Login succeeded/i.test(text)) throw new Error('no sign-in events in the audit log');
});

await scenario('Password reset through the emailed link', async (page) => {
  const email = 'vivek.nair@wms360.com';
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await clickText(page, 'button', 'Forgot password?');
  await page.waitForSelector('input[aria-label="Email for the reset link"]');
  await page.type('input[aria-label="Email for the reset link"]', email);
  await clickText(page, 'button', 'Send link');
  await page.waitForFunction(() => document.body.innerText.includes('reset link is on its way'), { timeout: 10000 });
  const body = sql(`select body from wms.outbound_emails where to_address = '${email}' order by created_at desc limit 1`);
  const link = /(http\S+reset-password\?token=[\w-]+)/.exec(body)?.[1];
  if (!link) throw new Error('no reset link in the outbox');
  await page.goto(link.replace('http://localhost:4200', BASE), { waitUntil: 'networkidle0' });
  await page.type('#al-password', 'Vivek-E2E-Pass-2026');
  await page.type('#al-confirm', 'Vivek-E2E-Pass-2026');
  await clickText(page, 'button[type=submit]', 'Set new password');
  await page.waitForFunction(() => document.body.innerText.includes('Password changed'), { timeout: 10000 });
  await login(page, email, 'Vivek-E2E-Pass-2026');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
});

await scenario('Two-factor sign-in with an authenticator code', async (page) => {
  const email = 'meera.joshi@wms360.com';
  await login(page, email);
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  await page.click('.profile-btn');
  await clickText(page, '.profile-menu button', 'Two-factor sign-in');
  await clickText(page, '.dialog button', 'Set up');
  await page.waitForSelector('.mfa-key');
  const secret = await page.evaluate(() => document.querySelector('.mfa-key').textContent.replace(/\s/g, ''));
  await page.type('#mfa-code', totp(secret));
  await clickText(page, '.dialog button', 'Turn on');
  await page.waitForFunction(() => !document.querySelector('.dialog'), { timeout: 10000 });
  await page.click('.profile-btn');
  await clickText(page, '.profile-menu button', 'Sign out');
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 10000 });
  await login(page, email);
  await page.waitForSelector('#otp', { timeout: 10000 });
  await page.type('#otp', totp(secret, Date.now() + 30_000));
  await page.click('button[type=submit]');
  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 20000 });
  // Leave the demo user as it was.
  sql(`update wms.users set mfa_enabled = false, mfa_secret = null, mfa_last_step = null where email = '${email}'`);
});

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? `  (${(r.ms / 1000).toFixed(1)} s)` : `\n      ${r.error}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} scenarios passed against the real API`);
process.exit(failed ? 1 : 0);
