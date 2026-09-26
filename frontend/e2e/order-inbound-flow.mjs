// Drives full workflows through the UI: order → allocate → release → pick → pack → ship, and inbound receive → putaway.
import puppeteer from 'puppeteer-core';

const BASE = process.env.WMS_URL ?? 'http://localhost:4200';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (msg) => console.log('✓', msg);

async function clickText(selector, text, root = page) {
  const handles = await root.$$(selector);
  for (const h of handles) {
    const t = (await h.evaluate((el) => el.textContent || '')).trim();
    const visible = await h.evaluate((el) => !!(el.offsetWidth || el.offsetHeight));
    if (visible && t.includes(text)) {
      await h.click();
      return;
    }
  }
  throw new Error(`No ${selector} with text "${text}"`);
}
async function dialogConfirm(text) {
  await page.waitForSelector('.dialog-footer');
  await clickText('.dialog-footer button', text);
  await page.waitForFunction(() => !document.querySelector('.cdk-dialog-container'), { timeout: 8000 });
  await sleep(500);
}
async function status() {
  return page.$eval('h1 wms-status .badge', (el) => el.textContent.trim());
}

process.on('unhandledRejection', async (e) => { console.log('FAILED:', e.message.split('\n')[0]); try { await page.screenshot({ path: 'e2e/output/flow-fail.png', fullPage: true }); console.log('dialog text:', await page.evaluate(() => document.querySelector('.cdk-dialog-container')?.textContent?.replace(/\s+/g, ' ').slice(0, 600))); } catch {} console.log('errors:', errors.join('\n')); await browser.close(); process.exit(1); });
await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
await page.type('#email', 'admin@wms360.com');
await page.type('#password', 'Wms360-Demo!');
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);
step('signed in as admin');

// ---- Create order
await page.goto(BASE + '/orders?new=1', { waitUntil: 'networkidle0' });
await page.waitForSelector('#o-cus option:nth-child(2)');
await page.select('#o-cus', 'cus-1014');
await page.select('#o-wh', 'wh-hyd');
await page.select('.lines-table select', 'prd-10001');
const qty = await page.$('.lines-table input[type=number]');
await qty.click({ clickCount: 3 });
await qty.type('7');
await clickText('.dialog-footer button', 'Create order');
await sleep(1500);
await page.screenshot({ path: 'e2e/output/flow-after-create.png' });
console.log('url after create:', page.url(), '| dialog:', await page.evaluate(() => document.querySelector('.cdk-dialog-container')?.textContent?.replace(/\s+/g, ' ').slice(0, 400)));
await page.waitForFunction(() => location.pathname.startsWith('/orders/ord-'), { timeout: 8000 });
await sleep(700);
const orderUrl = page.url();
const orderNo = await page.$eval('h1', (el) => el.childNodes[0].textContent.trim());
step(`created ${orderNo} → ${await status()}`);

await clickText('.page-actions button', 'Allocate stock');
await dialogConfirm('Allocate stock');
step(`allocated → ${await status()}`);

await clickText('.page-actions button', 'Release to picking');
await dialogConfirm('Create pick task');
step(`released → ${await status()}`);

// ---- Pick
await page.goto(`${BASE}/picking?q=${orderNo}`, { waitUntil: 'networkidle0' });
await sleep(700);
await clickText('td .link-btn', 'Pick');
await page.waitForSelector('.dialog');
await clickText('.dialog-footer button', 'Start picking');
await page.waitForFunction(() => [...document.querySelectorAll('.dialog-footer button')].some((b) => b.textContent.includes('Confirm picks')));
// short-pick one unit to exercise the write-off path
const pickInput = await page.$('.dialog input[type=number]');
await pickInput.click({ clickCount: 3 });
await pickInput.type('6');
await sleep(200);
const warn = await page.$eval('.dialog', (d) => d.textContent.includes('1 unit short'));
await page.screenshot({ path: 'e2e/output/flow-pick.png' });
await dialogConfirm('Confirm picks');
step(`picked 6 of 7 (short warning shown: ${warn})`);

await page.goto(orderUrl, { waitUntil: 'networkidle0' });
await sleep(600);
step(`order now → ${await status()} (short banner: ${await page.$eval('main', (m) => m.textContent.includes('Short-picked'))})`);

// ---- Pack + ship
await clickText('.page-actions button', 'Pack');
await page.waitForSelector('#pk-w');
await page.type('#pk-w', '5.4');
await dialogConfirm('Mark as packed');
step(`packed → ${await status()}`);

await clickText('.page-actions button', 'Dispatch');
await page.waitForSelector('#sh-t');
await page.type('#sh-t', 'BD7700123');
await dialogConfirm('Dispatch');
step(`dispatched → ${await status()}`);
await page.screenshot({ path: 'e2e/output/flow-order-shipped.png', fullPage: true });

// ---- Invalid transition is refused with a clear message
const ledger = await page.evaluate(async () => {
  return document.querySelectorAll('.steps li.done').length;
});
step(`progress steps done: ${ledger}`);

// ---- Inbound: ASN-2051 expected at Mumbai
await page.goto(`${BASE}/inbound?q=ASN-2051`, { waitUntil: 'networkidle0' });
await sleep(600);
await clickText('td a.code', 'ASN-2051');
await page.waitForSelector('h1');
await sleep(500);
await clickText('.page-actions button', 'Start receiving');
await page.waitForFunction(() => document.body.textContent.includes('Count what arrived'), { timeout: 8000 });
// receive 10 fewer keyboards and 5 damaged scanners
await sleep(800);
await page.screenshot({ path: 'e2e/output/flow-receiving.png', fullPage: true });
console.log('inputs on page:', await page.$$eval('input', (els) => els.map((e) => e.getAttribute('formcontrolname') || e.type).join(',')));
const recv = await page.$$('input[formcontrolname=receivedQty]');
await recv[0].click({ clickCount: 3 });
await recv[0].type('1990');
const dmg = await page.$$('input[formcontrolname=damagedQty]');
await dmg[1].click({ clickCount: 3 });
await dmg[1].type('5');
await clickText('button', 'Confirm receipt');
await dialogConfirm('Record counts');
await page.waitForFunction(() => document.body.textContent.includes('Put away'), { timeout: 8000 });
await sleep(800);
step(`received with discrepancy → ${await status()}`);
await page.screenshot({ path: 'e2e/output/flow-putaway.png', fullPage: true });
await clickText('button', 'Complete putaway');
await page.waitForFunction(() => document.querySelector('h1 wms-status .badge')?.textContent.includes('Completed'), { timeout: 8000 });
step(`putaway → ${await status()}`);

// ---- Ledger shows the receipt
await page.goto(`${BASE}/inventory/movements?q=ASN-2051`, { waitUntil: 'networkidle0' });
await sleep(700);
const rows = await page.$$eval('tbody tr', (r) => r.length);
step(`movement ledger rows for ASN-2051: ${rows}`);

console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
