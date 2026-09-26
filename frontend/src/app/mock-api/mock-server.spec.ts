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

  it('computes dashboard figures from data, not constants', () => {
    const res = admin('GET', '/dashboard/summary');
    expect(res.status).toBe(200);
    const s = res.body as { kpis: { onHand: number; readyToShip: number }; ordersByDay: unknown[] };
    expect(s.kpis.onHand).toBe(server.db.balances.reduce((a, b) => a + b.onHand, 0));
    expect(s.kpis.readyToShip).toBe(server.db.orders.filter((o) => o.status === 'PACKED').length);
    expect(s.ordersByDay).toHaveLength(7);
  });
});
