import { seededServer } from './mock-api';
import { DEMO_PASSWORD } from './mock-seed';
import { MockServer } from './mock-server';

const ON_HAND_TYPES = new Set(['RECEIPT', 'PUTAWAY', 'PICK', 'ADJUST', 'TRANSFER_OUT', 'TRANSFER_IN']);

function client(server: MockServer, email: string) {
  const login = server.handle({
    method: 'POST',
    path: '/auth/login',
    query: new URLSearchParams(),
    body: { email, password: DEMO_PASSWORD, rememberMe: false },
    header: () => null,
  });
  expect(login.status).toBe(200);
  const token = (login.body as { accessToken: string }).accessToken;
  return (method: string, path: string, body: unknown = {}, headers: Record<string, string> = {}) => {
    const [p, qs] = path.split('?');
    return server.handle({
      method,
      path: p,
      query: new URLSearchParams(qs ?? ''),
      body,
      header: (name) => (name === 'Authorization' ? `Bearer ${token}` : headers[name] ?? null),
    });
  };
}

describe('mock API server', () => {
  let server: MockServer;
  let admin: ReturnType<typeof client>;

  beforeEach(() => {
    server = seededServer();
    admin = client(server, 'admin@wms360.com');
  });

  it('seeds the prototype records with consistent history', () => {
    const db = server.db;
    expect(db.warehouses.map((w) => w.code)).toEqual(['WH-MUM-001', 'WH-PUN-001', 'WH-HYD-001', 'WH-DEL-001', 'WH-BLR-001']);
    const byNumber = (n: string) => db.orders.find((o) => o.number === n);
    expect(byNumber('ORD-10432')?.status).toBe('CANCELLED');
    expect(db.shipments.some((s) => s.orderNumber === 'ORD-10432')).toBe(false);
    expect(byNumber('ORD-10482')?.status).toBe('PICKING');
    expect(byNumber('ORD-10455')?.status).toBe('SHIPPED');
    expect(db.inbounds.every((i) => i.number.startsWith('ASN-'))).toBe(true);
    expect(db.transfers.find((t) => t.number === 'TRF-3047')?.status).toBe('IN_TRANSIT');
  });

  it('keeps every balance equal to the sum of its ledger movements', () => {
    const db = server.db;
    const sums = new Map<string, number>();
    for (const m of db.movements) {
      if (!ON_HAND_TYPES.has(m.type)) continue;
      const key = `${m.warehouseId}|${m.binCode}|${m.productId}`;
      sums.set(key, (sums.get(key) ?? 0) + m.qty);
    }
    for (const b of db.balances) {
      const bin = db.bins.find((x) => x.id === b.binId);
      expect(sums.get(`${b.warehouseId}|${bin?.code}|${b.productId}`) ?? 0).toBe(b.onHand);
      expect(b.reserved + b.damaged + b.blocked).toBeLessThanOrEqual(b.onHand);
    }
  });

  it('keeps reserved stock equal to open allocations', () => {
    const db = server.db;
    const reserved = db.balances.reduce((a, b) => a + b.reserved, 0);
    const held =
      db.orders.reduce((a, o) => a + o.allocations.reduce((x, r) => x + r.qty, 0), 0) +
      db.pickTasks.filter((t) => ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(t.status)).reduce((a, t) => a + t.totalQty, 0) +
      db.transfers.reduce((a, t) => a + t.reservations.reduce((x, r) => x + r.qty, 0), 0);
    // Orders in PICKING keep their allocations until the pick is confirmed, so count them once.
    const pickingOverlap = db.orders
      .filter((o) => o.status === 'PICKING')
      .reduce((a, o) => a + o.allocations.reduce((x, r) => x + r.qty, 0), 0);
    expect(reserved).toBe(held - pickingOverlap);
  });

  it('never oversells: allocation beyond available stock is rejected and changes nothing', () => {
    // ORD-10486 asks for docking stations that ORD-10485 already reserved in Pune.
    const order = server.db.orders.find((o) => o.number === 'ORD-10486');
    const before = JSON.stringify(server.db.balances);
    const res = admin('POST', `/orders/${order?.id}/allocate`);
    expect(res.status).toBe(409);
    expect((res.body as { detail: string }).detail).toContain('Insufficient stock');
    expect(JSON.stringify(server.db.balances)).toBe(before);
  });

  it('runs an order from creation to delivery and moves stock through the ledger', () => {
    const create = admin('POST', '/orders', {
      customerId: 'cus-1001',
      warehouseId: 'wh-hyd',
      priority: 'NORMAL',
      requiredBy: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: 'prd-10001', qty: 5 }],
    });
    expect(create.status).toBe(201);
    const id = (create.body as { id: string }).id;
    const onHandBefore = server.productTotals('prd-10001', (w) => w === 'wh-hyd').onHand;

    expect(admin('POST', `/orders/${id}/allocate`).status).toBe(200);
    expect(server.productTotals('prd-10001', (w) => w === 'wh-hyd').reserved).toBeGreaterThanOrEqual(5);
    expect(admin('POST', `/orders/${id}/release`).status).toBe(200);
    const task = server.db.pickTasks.find((t) => t.orderId === id);
    expect(admin('POST', `/pick-tasks/${task?.id}/start`).status).toBe(200);
    const done = admin('POST', `/pick-tasks/${task?.id}/complete`, {
      lines: task?.lines.map((l) => ({ productId: l.productId, binCode: l.binCode, picked: l.qty })),
    });
    expect(done.status).toBe(200);
    expect(server.productTotals('prd-10001', (w) => w === 'wh-hyd').onHand).toBe(onHandBefore - 5);
    expect(admin('POST', `/orders/${id}/pack`, { station: 'Station 1', weightKg: 3.2 }).status).toBe(200);
    expect(admin('POST', `/orders/${id}/ship`, { carrier: 'DTDC', trackingNumber: 'DT9990001' }).status).toBe(200);
    const shp = server.db.shipments.find((s) => s.orderId === id);
    expect(admin('POST', `/shipments/${shp?.id}/deliver`).status).toBe(200);
    expect((admin('GET', `/orders/${id}`).body as { status: string }).status).toBe('DELIVERED');
  });

  it('returns 409 for commands that do not fit the current state', () => {
    const shipped = server.db.orders.find((o) => o.status === 'SHIPPED');
    const res = admin('POST', `/orders/${shipped?.id}/cancel`);
    expect(res.status).toBe(409);
  });

  it('releases reservations when an allocated order is cancelled', () => {
    const order = server.db.orders.find((o) => o.number === 'ORD-10448');
    const reservedBefore = server.db.balances.reduce((a, b) => a + b.reserved, 0);
    expect(admin('POST', `/orders/${order?.id}/cancel`).status).toBe(200);
    expect(server.db.balances.reduce((a, b) => a + b.reserved, 0)).toBe(reservedBefore - (order?.totalQty ?? 0));
  });

  it('enforces permissions', () => {
    const picker = client(server, 'rohit.verma@wms360.com');
    expect(picker('GET', '/pick-tasks').status).toBe(200);
    expect(picker('POST', '/products', {}).status).toBe(403);
    expect(picker('GET', '/users').status).toBe(403);
  });

  it('limits scoped users to their warehouses', () => {
    const suresh = client(server, 'suresh.rao@wms360.com');
    const orders = suresh('GET', '/orders?size=200').body as { content: { warehouseId: string }[] };
    expect(orders.content.length).toBeGreaterThan(0);
    expect(orders.content.every((o) => o.warehouseId === 'wh-hyd')).toBe(true);
    expect(suresh('GET', '/orders?warehouseId=wh-mum').status).toBe(403);
    const mumOrder = server.db.orders.find((o) => o.warehouseId === 'wh-mum');
    expect(suresh('GET', `/orders/${mumOrder?.id}`).status).toBe(404);
  });

  it('rejects bad credentials without revealing whether the account exists', () => {
    const attempt = (email: string) =>
      server.handle({ method: 'POST', path: '/auth/login', query: new URLSearchParams(), body: { email, password: 'wrong' }, header: () => null });
    const known = attempt('admin@wms360.com');
    const unknown = attempt('nobody@wms360.com');
    expect(known.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(known.body).toEqual(unknown.body);
  });

  it('replays an idempotent command instead of applying it twice', () => {
    const order = server.db.orders.find((o) => o.number === 'ORD-10483');
    const first = admin('POST', `/orders/${order?.id}/allocate`, {}, { 'Idempotency-Key': 'k-1' });
    const second = admin('POST', `/orders/${order?.id}/allocate`, {}, { 'Idempotency-Key': 'k-1' });
    expect(first.status).toBe(200);
    expect(second).toEqual(first);
  });

  it('rejects a stale edit with 409', () => {
    const wh = server.db.warehouses[0];
    const body = { ...wh, capacityM2: 51000, version: wh.version - 1 };
    expect(admin('PUT', `/warehouses/${wh.id}`, body).status).toBe(409);
  });

  // ---------------------------------------------------------------- audit fixes

  const post = (method: string, path: string, body: unknown = {}) =>
    server.handle({ method, path, query: new URLSearchParams(), body, header: () => null });

  it('F1: revokes the session when a rotated refresh token is replayed', () => {
    const stolen = server.cookieJar.get();
    expect(post('POST', '/auth/refresh').status).toBe(200); // rotates; `stolen` is now used
    const current = server.cookieJar.get();
    // Outside the grace window, replaying the old token revokes the session.
    const s = server.db.sessions.find((x) => x.refreshToken === current);
    if (s) s.rotatedAt -= 60_000;
    server.cookieJar.set(stolen ?? '', false);
    expect(post('POST', '/auth/refresh').status).toBe(401);
    server.cookieJar.set(current ?? '', false);
    expect(post('POST', '/auth/refresh').status).toBe(401);
  });

  it('F1: tolerates two tabs refreshing at the same moment', () => {
    const before = server.cookieJar.get();
    expect(post('POST', '/auth/refresh').status).toBe(200);
    server.cookieJar.set(before ?? '', false); // the other tab still holds the previous token
    expect(post('POST', '/auth/refresh').status).toBe(200);
  });

  it('F2: ends sessions idle longer than the security setting', () => {
    const picker = client(server, 'rohit.verma@wms360.com');
    const session = server.db.sessions[server.db.sessions.length - 1];
    session.lastSeenAt = Date.now() - 31 * 60 * 1000; // setting is 30 minutes
    const res = picker('GET', '/pick-tasks');
    expect(res.status).toBe(401);
    expect((res.body as { detail: string }).detail).toContain('inactivity');
  });

  it('F3: shows notifications only for the user’s warehouses and permissions, with per-user read state', () => {
    const suresh = client(server, 'suresh.rao@wms360.com'); // Hyderabad only
    const mine = suresh('GET', '/notifications').body as { unread: number; items: { detail: string; id: string }[] };
    const mumbaiIds = new Set(server.db.notifications.filter((n) => n.warehouseId === 'wh-mum').map((n) => n.id));
    expect(mine.items.some((n) => mumbaiIds.has(n.id))).toBe(false);

    const adminBefore = (admin('GET', '/notifications').body as { unread: number }).unread;
    expect(suresh('POST', '/notifications/read-all').status).toBe(204);
    expect((suresh('GET', '/notifications').body as { unread: number }).unread).toBe(0);
    // Another user's unread count is unaffected.
    expect((admin('GET', '/notifications').body as { unread: number }).unread).toBe(adminBefore);
  });

  it('F4: does not repeat a low-stock alert on every stock change', () => {
    const before = server.db.notifications.filter((n) => n.title === 'Low stock alert').length;
    server.checkLowStock('wh-mum', 'prd-10078');
    server.checkLowStock('wh-mum', 'prd-10078');
    const after = server.db.notifications.filter((n) => n.title === 'Low stock alert').length;
    expect(after - before).toBeLessThanOrEqual(1);
  });

  it('F5: raises a capacity warning when enabled, and not when disabled', () => {
    server.db.settings.operations.capacityAlertPct = 10;
    server.db.notifications = server.db.notifications.filter((n) => n.title !== 'Warehouse capacity warning');
    server.db.settings.notifications.capacity = false;
    server.checkCapacity('wh-mum');
    expect(server.db.notifications.some((n) => n.title === 'Warehouse capacity warning')).toBe(false);
    server.db.settings.notifications.capacity = true;
    server.checkCapacity('wh-mum');
    expect(server.db.notifications.some((n) => n.title === 'Warehouse capacity warning')).toBe(true);
  });

  it('F6: stock received by transfer becomes allocatable after moving it out of the dock', () => {
    const t = server.db.transfers.find((x) => x.number === 'TRF-3047'); // HYD → MUM, in transit
    expect(admin('POST', `/transfers/${t?.id}/receive`).status).toBe(200);
    const dock = server.db.balances.find((b) => b.warehouseId === 'wh-mum' && b.productId === 'prd-10112' && server.bin(b.binId).code.startsWith('RCV'));
    expect(dock?.onHand).toBeGreaterThanOrEqual(220);
    const target = server.db.bins.find((b) => b.warehouseId === 'wh-mum' && b.code === 'PCK-C-001');
    const res = admin('POST', '/inventory/moves', { balanceId: dock?.id, toBinId: target?.id, qty: 220 });
    expect(res.status).toBe(201);
    expect(server.db.movements.filter((m) => m.reference.startsWith('MOV-')).length).toBe(2);
    // Moving more than is available is refused.
    expect(admin('POST', '/inventory/moves', { balanceId: dock?.id, toBinId: target?.id, qty: 999999 }).status).toBe(409);
  });

  it('F7: never reserves from, receives into or moves into an inactive zone', () => {
    const zone = server.db.zones.find((z) => z.warehouseId === 'wh-del' && z.type === 'PICKING');
    if (zone) zone.status = 'INACTIVE';
    const binIds = new Set(server.db.bins.filter((b) => b.zoneId === zone?.id).map((b) => b.id));
    const reservations = server.reserve('wh-del', 'prd-10001', 5, 'TEST', 'test');
    expect(reservations.every((r) => !binIds.has(server.db.balances.find((b) => b.id === r.balanceId)?.binId ?? ''))).toBe(true);
    const from = server.db.balances.find((b) => b.warehouseId === 'wh-del' && !binIds.has(b.binId) && server.available(b) > 0);
    const res = admin('POST', '/inventory/moves', { balanceId: from?.id, toBinId: Array.from(binIds)[0], qty: 1 });
    expect(res.status).toBe(409);
  });

  it('F8: only the source warehouse approves or dispatches; only the destination receives', () => {
    const requested = server.db.transfers.find((x) => x.number === 'TRF-3046'); // MUM → HYD
    const suresh = client(server, 'suresh.rao@wms360.com'); // Hyderabad = destination
    expect(suresh('POST', `/transfers/${requested?.id}/approve`).status).toBe(403);
    const rajesh = client(server, 'rajesh.kumar@wms360.com'); // Mumbai = source
    expect(rajesh('POST', `/transfers/${requested?.id}/approve`).status).toBe(200);
    expect(rajesh('POST', `/transfers/${requested?.id}/dispatch`).status).toBe(200);
    expect(rajesh('POST', `/transfers/${requested?.id}/receive`).status).toBe(403);
    expect(suresh('POST', `/transfers/${requested?.id}/receive`).status).toBe(200);
  });

  it('F9: a report for "all warehouses" is not narrowed by the active warehouse header', () => {
    const all = admin('POST', '/reports/inventory-summary/run', { warehouseId: '' }, { 'X-Warehouse-Id': 'wh-mum' }).body as { rows: { warehouse: string }[] };
    expect(new Set(all.rows.map((r) => r.warehouse)).size).toBe(5);
  });

  it('F10: hides admin activity from people who do not manage access', () => {
    admin('POST', '/users', { name: 'Test Person', email: 'test.person@wms360.com', roleId: 'role-viewer', warehouseIds: [] });
    const picker = client(server, 'rohit.verma@wms360.com');
    const feed = picker('GET', '/activity?size=200').body as { content: { kind: string }[] };
    expect(feed.content.some((a) => a.kind === 'admin')).toBe(false);
    const adminFeed = admin('GET', '/activity?size=200').body as { content: { kind: string }[] };
    expect(adminFeed.content.some((a) => a.kind === 'admin')).toBe(true);
  });

  it('F11: dashboard alerts only link to pages the user may open', () => {
    const picker = client(server, 'rohit.verma@wms360.com');
    const s = picker('GET', '/dashboard/summary').body as { alerts: { link: string }[] };
    expect(s.alerts.some((a) => a.link.startsWith('/warehouses') || a.link.startsWith('/shipping') || a.link.startsWith('/inbound'))).toBe(false);
  });

  it('F12: pick tasks go only to people allowed to pick in that warehouse', () => {
    const task = server.db.pickTasks.find((t) => t.status === 'PENDING' || t.status === 'ASSIGNED');
    expect(admin('POST', `/pick-tasks/${task?.id}/assign`, { picker: 'Sneha Iyer' }).status).toBe(422); // packer
    const staff = admin('GET', `/users/staff?permission=picking:edit&warehouseId=${task?.warehouseId}`).body as { name: string }[];
    expect(staff.every((u) => u.name !== 'Sneha Iyer')).toBe(true);
    expect(admin('POST', `/pick-tasks/${task?.id}/assign`, { picker: staff[0].name }).status).toBe(200);
  });

  it('F13: scoped users can pick any active warehouse as a transfer destination', () => {
    const rajesh = client(server, 'rajesh.kumar@wms360.com');
    const own = rajesh('GET', '/warehouses/options').body as unknown[];
    const network = rajesh('GET', '/warehouses/options?scope=network').body as unknown[];
    expect(own.length).toBe(1);
    expect(network.length).toBe(5);
  });

  it('F14: count endpoints agree with the lists', () => {
    const counts = admin('GET', '/orders/counts').body as { total: number; byStatus: Record<string, number> };
    const list = admin('GET', '/orders?size=200').body as { totalElements: number };
    expect(counts.total).toBe(list.totalElements);
    expect(Object.values(counts.byStatus).reduce((a, b) => a + b, 0)).toBe(counts.total);
    for (const path of ['/pick-tasks/counts', '/inbound/counts', '/transfers/counts']) expect(admin('GET', path).status).toBe(200);
  });

  it('F15/F16: refuses discontinued products on inbound and past required-by dates', () => {
    const p = server.db.products.find((x) => x.id === 'prd-10188');
    if (p) p.status = 'DISCONTINUED';
    const inbound = admin('POST', '/inbound', {
      supplierId: 'sup-18',
      warehouseId: 'wh-mum',
      expectedAt: new Date(Date.now() + 86400000).toISOString(),
      lines: [{ productId: 'prd-10188', expectedQty: 5 }],
    });
    expect(inbound.status).toBe(409);
    const order = admin('POST', '/orders', {
      customerId: 'cus-1001',
      warehouseId: 'wh-mum',
      priority: 'NORMAL',
      requiredBy: new Date(Date.now() - 3 * 86400000).toISOString(),
      lines: [{ productId: 'prd-10001', qty: 1 }],
    });
    expect(order.status).toBe(422);
  });

  it('computes dashboard figures from data, not constants', () => {
    const res = admin('GET', '/dashboard/summary');
    expect(res.status).toBe(200);
    const s = res.body as { kpis: { onHand: number; readyToShip: number }; ordersByDay: unknown[] };
    expect(s.kpis.onHand).toBe(server.db.balances.reduce((a, b) => a + b.onHand, 0));
    expect(s.kpis.readyToShip).toBe(server.db.orders.filter((o) => o.status === 'PACKED').length);
    expect(s.ordersByDay).toHaveLength(7);
  });

  it('requires the authenticator code once two-factor sign-in is on', () => {
    const meera = client(server, 'meera.joshi@wms360.com');
    expect(meera('POST', '/auth/mfa/setup').status).toBe(200);
    expect(meera('POST', '/auth/mfa/enable', { code: '12' }).status).toBe(422);
    expect(meera('POST', '/auth/mfa/enable', { code: '123456' }).status).toBe(204);
    const login = (otp?: string) =>
      server.handle({ method: 'POST', path: '/auth/login', query: new URLSearchParams(), body: { email: 'meera.joshi@wms360.com', password: DEMO_PASSWORD, otp }, header: () => null });
    const noCode = login();
    expect(noCode.status).toBe(401);
    expect((noCode.body as { errors: { field: string; code: string }[] }).errors[0]).toMatchObject({ field: 'otp', code: 'mfa_required' });
    expect(login('654321').status).toBe(200);
    expect(admin('POST', `/users/${server.db.users.find((u) => u.email === 'meera.joshi@wms360.com')?.id}/mfa/reset`).status).toBe(204);
    expect(login().status).toBe(200);
  });

  it('resets a forgotten password through a one-time link and audits it', () => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const anon = (path: string, body: unknown) => server.handle({ method: 'POST', path, query: new URLSearchParams(), body, header: () => null });
    expect(anon('/auth/forgot-password', { email: 'vivek.nair@wms360.com' }).status).toBe(202);
    expect(anon('/auth/forgot-password', { email: 'nobody@nowhere.com' }).status).toBe(202);
    const token = server.db.userTokens[server.db.userTokens.length - 1].token;
    expect(anon('/auth/reset-password', { token, password: 'short' }).status).toBe(422);
    expect(anon('/auth/reset-password', { token, password: 'Vivek-New-Pass-1' }).status).toBe(204);
    expect(anon('/auth/reset-password', { token, password: 'Vivek-New-Pass-2' }).status).toBe(401);
    const audit = admin('GET', '/audit?action=PASSWORD_RESET');
    expect((audit.body as { totalElements: number }).totalElements).toBe(1);
  });

  it('runs a cycle count and posts the differences to the ledger', () => {
    const wh = server.db.warehouses[0].id;
    const created = admin('POST', '/cycle-counts', { warehouseId: wh, zoneId: null, note: 'test' });
    expect(created.status).toBe(201);
    const c = created.body as { id: string; lines: { lineNo: number; expectedQty: number; balanceId: string }[] };
    expect(admin('POST', `/cycle-counts/${c.id}/approve`).status).toBe(409);
    // Short by 3 on a line with free stock (on-hand may never drop below what is reserved).
    const free = (id: string) => {
      const b = server.db.balances.find((x) => x.id === id);
      return b ? b.onHand - b.reserved - b.damaged - b.blocked : 0;
    };
    const target = c.lines.find((l) => free(l.balanceId) >= 3) ?? c.lines[0];
    const counts = c.lines.map((l) => ({ lineNo: l.lineNo, countedQty: l === target ? l.expectedQty - 3 : l.expectedQty }));
    const counted = admin('POST', `/cycle-counts/${c.id}/counts`, { lines: counts });
    expect((counted.body as { status: string; netVariance: number }).status).toBe('COUNTED');
    expect((counted.body as { netVariance: number }).netVariance).toBe(-3);
    const before = server.db.balances.find((b) => b.id === target.balanceId)?.onHand ?? 0;
    const approved = admin('POST', `/cycle-counts/${c.id}/approve`);
    expect(approved.body).toMatchObject({ status: 'APPROVED' });
    expect(server.db.balances.find((b) => b.id === target.balanceId)?.onHand).toBe(before - 3);
  });
});
