// Each role performs its real job through the UI, on one shared database (same browser profile).
import puppeteer from 'puppeteer-core';

const BASE = process.env.WMS_URL ?? 'http://localhost:4200';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

// ---------------------------------------------------------------- helpers
async function go(path) {
  await page.goto(BASE + path, { waitUntil: 'networkidle0' });
  await sleep(500);
}
async function waitText(text, timeout = 8000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
}
async function hasText(text) {
  return page.evaluate((t) => document.body.innerText.includes(t), text);
}
/** Polls until a visible, enabled element matches, then clicks it (data loads asynchronously). */
async function click(selector, text, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const ok = await page.evaluate(
      (sel, txt) => {
        const el = [...document.querySelectorAll(sel)].find((e) => (e.offsetWidth || e.offsetHeight) && !e.disabled && e.textContent.trim().includes(txt));
        if (!el) return false;
        el.click();
        return true;
      },
      selector,
      text,
    );
    if (ok) return sleep(300);
    await sleep(200);
  }
  throw new Error(`no visible ${selector} containing "${text}"`);
}
/** Clicks an action inside the table row that contains `rowText`. */
async function clickInRow(rowText, actionText, timeout = 8000) {
  const until = Date.now() + timeout;
  let ok = false;
  while (!ok && Date.now() < until) {
    ok = await page.evaluate(
    (rt, at) => {
      const row = [...document.querySelectorAll('tbody tr')].find((r) => r.innerText.includes(rt));
      const el = row && [...row.querySelectorAll('button, a')].find((e) => e.textContent.trim().includes(at));
      if (!el) return false;
      el.click();
      return true;
    },
    rowText,
    actionText,
  );
    if (!ok) await sleep(200);
  }
  if (!ok) throw new Error(`row "${rowText}" has no "${actionText}"`);
  await sleep(400);
}
async function confirmDialog(label) {
  await page.waitForSelector('.dialog-footer');
  await click('.dialog-footer button', label);
  await page.waitForFunction(() => !document.querySelector('.cdk-dialog-container'), { timeout: 8000 });
  await sleep(500);
}
async function typeInto(selector, value) {
  const el = await page.waitForSelector(selector);
  await el.click({ clickCount: 3 });
  await el.type(String(value));
}
async function status() {
  return page.$eval('h1 wms-status .badge', (e) => e.textContent.trim());
}
async function pageActions() {
  return page.$$eval('.page-actions button, .page-actions a', (els) => els.map((e) => e.textContent.trim()));
}
async function login(email) {
  await go('/login');
  // A previous scenario may have failed while signed in: sign out first.
  if (new URL(page.url()).pathname !== '/login') {
    await page.keyboard.press('Escape');
    await logout();
  }
  await page.type('#email', email);
  await page.type('#password', 'Wms360-Demo!');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);
  await sleep(500);
}
async function logout() {
  await click('.profile-btn', '');
  await click('.profile-menu button', 'Sign out');
  await page.waitForFunction(() => location.pathname === '/login', { timeout: 8000 });
}
async function scenario(name, fn) {
  const before = errors.length;
  try {
    await fn();
    const newErrors = errors.slice(before);
    results.push([newErrors.length ? '✗' : '✓', name, newErrors.join(' | ')]);
  } catch (e) {
    await page.screenshot({ path: `e2e/output/fail-${name.replace(/\W+/g, '_').slice(0, 40)}.png`, fullPage: true });
    results.push(['✗', name, e.message.split('\n')[0]]);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// Fresh, deterministic demo data.
await go('/login');
await page.evaluate(() => localStorage.clear());
await go('/login');

// ---------------------------------------------------------------- Picker
await scenario('Picker confirms his assigned pick (ORD-10462)', async () => {
  await login('rohit.verma@wms360.com');
  await go('/picking?picker=me');
  assert(await hasText('ORD-10462'), 'task for ORD-10462 not in "My tasks"');
  await clickInRow('ORD-10462', 'Pick');
  await click('.dialog-footer button', 'Start picking');
  await page.waitForFunction(() => [...document.querySelectorAll('.dialog-footer button')].some((b) => b.textContent.includes('Confirm picks')));
  await confirmDialog('Confirm picks');
  await waitText('ready to pack');
});
await scenario('Picker cannot allocate orders or open admin pages', async () => {
  await go('/orders?status=CREATED');
  const labels = await page.$$eval('tbody .row-actions', (rs) => rs.map((r) => r.innerText));
  assert(labels.length > 0 && labels.every((l) => !l.includes('Allocate')), 'Allocate offered to a picker');
  await go('/settings');
  assert(new URL(page.url()).pathname === '/forbidden', 'picker reached settings');
  await logout();
});

// ---------------------------------------------------------------- Packer
await scenario('Packer packs ORD-10462 and dispatches it', async () => {
  await login('sneha.iyer@wms360.com');
  await go('/packing');
  await clickInRow('ORD-10462', 'Pack');
  await typeInto('#pk-w', '14.5');
  await confirmDialog('Mark as packed');
  await go('/shipping');
  await clickInRow('ORD-10462', 'Dispatch');
  await typeInto('#sh-t', 'DL5550001');
  await confirmDialog('Dispatch');
  await waitText('DL5550001');
});
await scenario('Packer marks a shipment delivered and reports a problem on another', async () => {
  await clickInRow('DL5550001', 'Mark delivered');
  await confirmDialog('Mark delivered');
  await go('/shipping?status=IN_TRANSIT');
  await click('tbody button', 'Report problem');
  const row = await page.$eval('.dialog-header h2', (h) => h.textContent.replace('Report a problem with', '').trim());
  await page.type('#confirm-reason', 'Customer refused delivery');
  await confirmDialog('Report problem');
  await go(`/shipping?q=${row}`);
  assert(await hasText('Customer refused delivery'), 'exception note not shown');
  await logout();
});

// ---------------------------------------------------------------- Transfers across two warehouses
let trfUrl = '';
await scenario('Mumbai manager approves and dispatches TRF-3046; cannot receive it', async () => {
  await login('rajesh.kumar@wms360.com');
  await go('/transfers?q=TRF-3046');
  await click('tbody a.code', 'TRF-3046');
  await page.waitForSelector('h1 wms-status');
  trfUrl = new URL(page.url()).pathname;
  await click('.page-actions button', 'Approve');
  await confirmDialog('Approve and reserve');
  assert((await status()) === 'Approved', 'not approved');
  await click('.page-actions button', 'Dispatch');
  await confirmDialog('Confirm dispatch');
  assert((await status()) === 'In transit', 'not in transit');
  const actions = await pageActions();
  assert(!actions.some((a) => a.includes('Receive')), 'source can see Receive');
  assert(await hasText('Hyderabad Warehouse will receive it'), 'waiting note missing');
});
await scenario('Mumbai manager only sees Mumbai orders', async () => {
  await go('/orders?size=100');
  const whs = await page.$$eval('tbody tr', (rs) => [...new Set(rs.map((r) => r.children[2].innerText.trim()))]);
  assert(whs.length === 1 && whs[0] === 'Mumbai Central Warehouse', `saw ${whs.join(', ')}`);
  await logout();
});
await scenario('Hyderabad manager receives TRF-3046 and moves it out of the dock', async () => {
  await login('suresh.rao@wms360.com');
  await go(trfUrl);
  await click('.page-actions button', 'Receive at destination');
  await confirmDialog('Confirm receipt');
  assert((await status()) === 'Completed', 'not completed');
  assert(await hasText('Move it to storage'), 'dock hint missing');
  await go('/inventory?q=SKU-10092');
  await clickInRow('Hyderabad', 'bin');
  await page.waitForSelector('.dialog');
  const rcvRow = await page.$$eval('.dialog tbody tr', (rs) => rs.map((r) => r.innerText).find((t) => t.includes('RCV')));
  assert(rcvRow, 'no dock (RCV) row after receipt');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.dialog tbody tr')].find((r) => r.innerText.includes('RCV'));
    [...row.querySelectorAll('button')].find((b) => b.textContent.includes('Move')).click();
  });
  await page.waitForFunction(() => document.querySelectorAll('#mv-bin option').length > 2);
  const firstBin = await page.$eval('#mv-bin option:nth-child(2)', (o) => o.value);
  await page.select('#mv-bin', firstBin);
  await click('.dialog-footer button', 'Move stock');
  await waitText('units moved to');
  await logout();
});

// ---------------------------------------------------------------- Inventory manager
await scenario('Inventory manager receives ASN-2049 and puts it away', async () => {
  await login('priya.menon@wms360.com');
  await go('/inbound?q=ASN-2049');
  await click('tbody a.code', 'ASN-2049');
  await waitText('Count what arrived');
  await click('button', 'Confirm receipt');
  await waitText('Put away', 10000);
  await page.waitForFunction(() => {
    const s = [...document.querySelectorAll('select[formcontrolname=binId]')];
    return s.length > 0 && s.every((x) => x.value);
  });
  await click('button', 'Complete putaway');
  await page.waitForFunction(() => document.querySelector('h1 wms-status .badge')?.textContent.includes('Completed'), { timeout: 8000 });
});
await scenario('Inventory manager requests Pune → Bengaluru (outside her scope) and approves it', async () => {
  await go('/transfers?new=1');
  await page.waitForSelector('#t-dst option[value="wh-blr"]');
  await page.select('#t-src', 'wh-pun');
  await page.select('#t-dst', 'wh-blr');
  await page.select('.lines-table select', 'prd-10163');
  await typeInto('.lines-table input[type=number]', 25);
  await click('.dialog-footer button', 'Request transfer');
  await page.waitForFunction(() => /\/transfers\/trf-/.test(location.pathname), { timeout: 8000 });
  await sleep(500);
  await click('.page-actions button', 'Approve');
  await confirmDialog('Approve and reserve');
  assert((await status()) === 'Approved', 'not approved');
});
await scenario('Inventory manager corrects a stock count', async () => {
  await go('/inventory?q=SKU-10171');
  await clickInRow('Pune', 'bin');
  await page.waitForSelector('.dialog tbody tr');
  await page.evaluate(() => [...document.querySelectorAll('.dialog tbody tr button')].find((b) => b.textContent.includes('Adjust')).click());
  await typeInto('#adj-qty', -3);
  await page.select('#adj-reason', 'Cycle count correction');
  await click('.dialog-footer button', 'Record adjustment');
  await waitText('Stock adjusted');
  await logout();
});

// ---------------------------------------------------------------- Supervisor
await scenario('Supervisor releases ORD-10481 to picking; no approve on transfers', async () => {
  await login('amit.sharma@wms360.com');
  await go('/orders?q=ORD-10481');
  await clickInRow('ORD-10481', 'Release to picking');
  await confirmDialog('Create pick task');
  await waitText('Pick task created');
  await go('/transfers?status=REQUESTED');
  const first = await page.$('tbody a.code');
  if (first) {
    await first.click();
    await page.waitForSelector('h1 wms-status');
    await sleep(400);
    const actions = await pageActions();
    assert(!actions.some((a) => a.includes('Approve')), 'supervisor offered Approve');
  }
  await logout();
});

// ---------------------------------------------------------------- Seller
await scenario('Seller creates an order but cannot allocate it', async () => {
  await login('meera.joshi@wms360.com');
  await go('/orders?new=1');
  await page.waitForSelector('#o-wh option[value="wh-blr"]');
  await page.select('#o-cus', 'cus-1022');
  await page.select('#o-wh', 'wh-blr');
  await page.select('.lines-table select', 'prd-10045');
  await typeInto('.lines-table input[type=number]', 4);
  await click('.dialog-footer button', 'Create order');
  await page.waitForFunction(() => /\/orders\/ord-/.test(location.pathname), { timeout: 8000 });
  await sleep(500);
  const actions = await pageActions();
  assert(!actions.some((a) => a.includes('Allocate')), 'seller offered Allocate');
  assert(actions.some((a) => a.includes('Cancel order')), 'seller cannot cancel own order');
});
await scenario('Past required-by date is rejected with a field error', async () => {
  await go('/orders?new=1');
  await page.waitForSelector('#o-wh option[value="wh-mum"]');
  await page.select('#o-cus', 'cus-1001');
  await page.select('#o-wh', 'wh-mum');
  await page.select('.lines-table select', 'prd-10001');
  await page.$eval('#o-due', (el) => {
    el.value = '2020-01-01';
    el.dispatchEvent(new Event('input'));
  });
  await click('.dialog-footer button', 'Create order');
  await waitText('in the past');
  await page.keyboard.press('Escape');
  await sleep(400);
  await logout();
});

// ---------------------------------------------------------------- Viewer
await scenario('Viewer sees everything read-only', async () => {
  await login('vivek.nair@wms360.com');
  await go('/orders?q=ORD-10448');
  await click('tbody a.code', 'ORD-10448');
  await page.waitForSelector('h1 wms-status');
  assert((await pageActions()).length === 0, 'viewer has order actions');
  await go('/warehouses/wh-mum/overview');
  assert(!(await pageActions()).some((a) => a.includes('Edit')), 'viewer can edit warehouse');
  await go('/admin/roles');
  assert(new URL(page.url()).pathname === '/forbidden', 'viewer reached roles');
  await logout();
});

// ---------------------------------------------------------------- Admin
await scenario('Admin: global search opens an order with the keyboard', async () => {
  await login('admin@wms360.com');
  await page.keyboard.down('Control');
  await page.keyboard.press('k');
  await page.keyboard.up('Control');
  await page.keyboard.type('ORD-10482');
  await page.waitForSelector('.search-results button');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /\/orders\/ord-/.test(location.pathname), { timeout: 8000 });
});
await scenario('Admin: creates a warehouse, a zone and a bin', async () => {
  await go('/warehouses?new=1');
  await typeInto('#wh-code', 'WH-CHN-001');
  await typeInto('#wh-name', 'Chennai Port Warehouse');
  await typeInto('#wh-city', 'Chennai');
  await typeInto('#wh-manager', 'Lakshmi Iyer');
  await typeInto('#wh-area', 22000);
  await click('.dialog-footer button', 'Create warehouse');
  await page.waitForFunction(() => /\/warehouses\/wh-\d+/.test(location.pathname), { timeout: 8000 });
  await go(new URL(page.url()).pathname.replace(/\/[a-z]+$/, '') + '/zones');
  await click('button', 'Add zone');
  await typeInto('#z-code', 'STR-B');
  await typeInto('#z-name', 'Storage');
  await page.select('#z-type', 'STORAGE');
  await click('.dialog-footer button', 'Save zone');
  await waitText('STR-B');
  await go(new URL(page.url()).pathname.replace('/zones', '/bins'));
  await click('button', 'Add bin');
  await page.waitForSelector('#b-zone option:nth-child(3)');
  const zoneId = await page.$$eval('#b-zone option', (os) => os.find((o) => o.textContent.includes('STR-B'))?.value);
  await page.select('#b-zone', zoneId);
  await typeInto('#b-code', 'STR-B-001');
  await click('.dialog-footer button', 'Add bin');
  await waitText('STR-B-001');
});
await scenario('Admin: duplicate SKU is shown under the field', async () => {
  await go('/products?new=1');
  await typeInto('#p-sku', 'SKU-10001');
  await typeInto('#p-name', 'Duplicate');
  await typeInto('#p-cat', 'Electronics');
  await click('.dialog-footer button', 'Add product');
  await waitText('already uses this SKU');
  await page.keyboard.press('Escape');
  await sleep(300);
});
await scenario('Admin: runs a report for all warehouses', async () => {
  await go('/reports');
  await clickInRow; // (report rows are not a table)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.report-row')].find((r) => r.innerText.includes('Inventory Summary'));
    row.querySelector('button').click();
  });
  await page.waitForSelector('.report .data-table tbody tr', { timeout: 8000 });
  const warehouses = await page.$$eval('.report .data-table tbody tr', (rs) => new Set(rs.map((r) => r.children[0].innerText)).size);
  assert(warehouses >= 5, `report covered ${warehouses} warehouses`);
  await page.keyboard.press('Escape');
  await sleep(300);
});
await scenario('Admin: marks notifications read', async () => {
  await click('.pop-wrap button[aria-label^=Notifications]', '');
  await page.waitForSelector('.notif-pop');
  await click('.notif-pop button', 'Mark all read');
  await sleep(800);
  const dot = await page.$('.pop-wrap .dot');
  assert(!dot, 'unread badge still shown');
  await page.keyboard.press('Escape');
});
await scenario('Admin: disables the viewer, who can then no longer sign in', async () => {
  await go('/admin/users?q=vivek');
  await clickInRow('Vivek Nair', 'Disable');
  await confirmDialog('Disable user');
  await logout();
  await go('/login');
  await page.type('#email', 'vivek.nair@wms360.com');
  await page.type('#password', 'Wms360-Demo!');
  await page.click('button[type=submit]');
  await waitText('disabled');
});

console.log(results.map(([s, n, e]) => `${s} ${n}${e ? `  —  ${e}` : ''}`).join('\n'));
console.log(`\n${results.filter((r) => r[0] === '✓').length}/${results.length} scenarios passed`);
await browser.close();
