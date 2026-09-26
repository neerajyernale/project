// Role × screen matrix: every demo role against every route, nav item and create action.
import puppeteer from 'puppeteer-core';

const BASE = process.env.WMS_URL ?? 'http://localhost:4200';
const MODULES = { dashboard: ['view'], warehouses: ['view', 'create', 'edit', 'delete'], inventory: ['view', 'edit', 'approve'], transfers: ['view', 'create', 'approve'], catalog: ['view', 'create', 'edit', 'delete'], inbound: ['view', 'create', 'edit'], orders: ['view', 'create', 'edit', 'approve'], picking: ['view', 'edit'], packing: ['view', 'edit'], shipping: ['view', 'edit'], reports: ['view'], users: ['view', 'create', 'edit', 'delete'], settings: ['view', 'edit'] };
const ALL = Object.entries(MODULES).flatMap(([m, as]) => as.map((a) => `${m}:${a}`));
const allOf = (...ms) => ALL.filter((p) => ms.includes(p.split(':')[0]));
const ROLES = {
  Admin: ALL,
  'Warehouse Manager': ALL.filter((p) => !['users:create', 'users:edit', 'users:delete', 'settings:edit'].includes(p)),
  Supervisor: ['dashboard:view', 'warehouses:view', 'inventory:view', 'inventory:edit', 'transfers:view', 'transfers:create', 'catalog:view', 'reports:view', ...allOf('inbound', 'orders', 'picking', 'packing', 'shipping')],
  Picker: ['dashboard:view', 'inventory:view', 'orders:view', 'picking:view', 'picking:edit'],
  Packer: ['dashboard:view', 'orders:view', 'packing:view', 'packing:edit', 'shipping:view', 'shipping:edit'],
  'Inventory Manager': ['dashboard:view', 'warehouses:view', 'orders:view', 'reports:view', ...allOf('inventory', 'transfers', 'catalog', 'inbound')],
  Seller: ['dashboard:view', 'catalog:view', 'inventory:view', 'orders:view', 'orders:create', 'orders:edit', 'reports:view'],
  Viewer: ALL.filter((p) => p.endsWith(':view') && !['users:view', 'settings:view'].includes(p)),
};
const USERS = [
  ['admin@wms360.com', 'Admin', 'wh-mum'],
  ['rajesh.kumar@wms360.com', 'Warehouse Manager', 'wh-mum'],
  ['amit.sharma@wms360.com', 'Supervisor', 'wh-pun'],
  ['rohit.verma@wms360.com', 'Picker', 'wh-mum'],
  ['sneha.iyer@wms360.com', 'Packer', 'wh-mum'],
  ['priya.menon@wms360.com', 'Inventory Manager', 'wh-pun'],
  ['meera.joshi@wms360.com', 'Seller', 'wh-mum'],
  ['vivek.nair@wms360.com', 'Viewer', 'wh-mum'],
];
const NAV = [['/dashboard', 'dashboard:view'], ['/warehouses', 'warehouses:view'], ['/inventory', 'inventory:view'], ['/products', 'catalog:view'], ['/inbound', 'inbound:view'], ['/outbound', 'orders:view'], ['/orders', 'orders:view'], ['/picking', 'picking:view'], ['/packing', 'packing:view'], ['/shipping', 'shipping:view'], ['/transfers', 'transfers:view'], ['/suppliers', 'catalog:view'], ['/customers', 'catalog:view'], ['/reports', 'reports:view'], ['/admin/users', 'users:view'], ['/settings', 'settings:view']];
const EXTRA = [['/inventory/movements', 'inventory:view'], ['/admin/roles', 'users:view'], ['WH_DETAIL', 'warehouses:view'], ['/warehouses/WH/bins', 'warehouses:view']];
// Create/primary action on a page → the permission that must gate it.
const ACTIONS = { '/orders': ['New order', 'orders:create'], '/products': ['Add product', 'catalog:create'], '/warehouses': ['Add warehouse', 'warehouses:create'], '/inbound': ['Schedule shipment', 'inbound:create'], '/transfers': ['Request transfer', 'transfers:create'], '/admin/users': ['Invite user', 'users:create'], '/settings': ['Save changes', 'settings:edit'], '/suppliers': ['Add supplier', 'catalog:create'], '/inventory': ['Request transfer', 'transfers:create'] };

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: 'new' });
const problems = [];
let checks = 0;
const check = (ok, msg) => {
  checks++;
  if (!ok) problems.push(msg);
};

for (const [email, role, homeWh] of USERS) {
  const perms = new Set(ROLES[role]);
  const ctx = await browser.createIncognitoBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' });
  await page.type('#email', email);
  await page.type('#password', 'Wms360-Demo!');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), page.click('button[type=submit]')]);
  await new Promise((r) => setTimeout(r, 600));
  const landed = new URL(page.url()).pathname;
  check(landed === '/dashboard', `${role}: landed on ${landed}, expected /dashboard`);

  // Sidebar shows exactly the permitted destinations.
  const navLinks = await page.$$eval('.nav a.nav-item', (as) => as.map((a) => a.getAttribute('href')));
  const expectedNav = NAV.filter(([, p]) => perms.has(p)).map(([r]) => r);
  check(JSON.stringify(navLinks) === JSON.stringify(expectedNav), `${role}: nav ${JSON.stringify(navLinks)} ≠ expected ${JSON.stringify(expectedNav)}`);

  const routes = [...NAV, ...EXTRA].map(([r, p]) => [r === 'WH_DETAIL' ? `/warehouses/${homeWh}/overview` : r.replace('/WH/', `/${homeWh}/`), p]);
  let visited = 0;
  for (const [route, perm] of routes) {
    await page.goto(BASE + route, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 500));
    const path = new URL(page.url()).pathname;
    const text = await page.$eval('main', (m) => m.innerText);
    const allowed = perms.has(perm);
    if (allowed) {
      visited++;
      check(path !== '/forbidden', `${role}: ${route} → forbidden but role has ${perm}`);
      // Error, offline, forbidden and not-found states are rendered by <wms-state-view>; look there, not at data text.
      const badState = await page.$$eval('wms-state-view .state-view', (els) => els.map((e) => e.innerText.split('\n')[0]).filter((t) => /couldn't be loaded|don't have access|offline|not found/i.test(t)));
      check(badState.length === 0, `${role}: ${route} shows state: ${badState.join(' | ')}`);
      const toastErr = await page.$('.toast-danger');
      check(!toastErr, `${role}: ${route} raised an error toast`);
      const action = ACTIONS[route];
      if (action) {
        const has = await page.$$eval('.page-header button, .page-header a', (els, label) => els.some((e) => e.textContent.includes(label)), action[0]);
        check(has === perms.has(action[1]), `${role}: ${route} "${action[0]}" ${has ? 'shown' : 'hidden'} but ${action[1]} is ${perms.has(action[1]) ? 'granted' : 'not granted'}`);
      }
    } else {
      check(path === '/forbidden', `${role}: ${route} opened (${path}) without ${perm}`);
    }
  }
  check(errors.length === 0, `${role}: console errors: ${errors.join(' | ')}`);
  console.log(`${role.padEnd(18)} ${email.padEnd(26)} nav ${navLinks.length}/16  pages allowed ${visited}/${routes.length}  errors ${errors.length}`);
  await ctx.close();
}

console.log(`\n${checks} checks, ${problems.length} problems`);
problems.forEach((p) => console.log(' ✗', p));
await browser.close();
