import { CARRIERS, Order, OrderLine, PACK_STATIONS, PRIORITIES, PickTask, Priority, Shipment } from '@core/models';
import { DbOrder, DbPickLine, DbPickTask, Reservation, conflict, notFound } from '../mock-types';
import { Ctx, MockServer } from '../mock-server';

const OPEN_STATES: Order['status'][] = ['CREATED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKED'];
const OUTBOUND_STATES: Order['status'][] = ['ALLOCATED', 'PICKING', 'PICKED', 'PACKED', 'SHIPPED'];

export function registerFulfillmentRoutes(s: MockServer): void {
  const toOrder = (o: DbOrder): Order => {
    const { allocations: _a, ...rest } = o;
    return { ...rest, delayed: OPEN_STATES.includes(o.status) && Date.parse(o.requiredBy) < s.now().getTime() };
  };

  const toTask = (t: DbPickTask): PickTask => ({ ...t, lines: t.lines.map(({ balanceId: _b, ...l }) => l) });

  const findOrder = (ctx: Ctx): DbOrder => {
    const o = s.db.orders.find((x) => x.id === ctx.params['id']);
    if (!o) throw notFound('Order');
    s.assertWarehouseAccess(ctx, o.warehouseId);
    return o;
  };

  const expect = (o: DbOrder, ...states: Order['status'][]) => {
    if (!states.includes(o.status)) {
      throw conflict(`Order ${o.number} is ${o.status.toLowerCase()}; this action is not allowed now.`);
    }
  };

  // ------------------------------------------------------------------ orders

  s.on(
    'GET',
    '/orders',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const priority = ctx.query.get('priority');
      const customerId = ctx.query.get('customerId');
      const stage = ctx.query.get('stage');
      const delayedOnly = ctx.query.get('delayed') === 'true';
      const rows = s.db.orders
        .filter((o) => inScope(o.warehouseId))
        .filter((o) => s.inList(o.status, status))
        .filter((o) => stage !== 'outbound' || OUTBOUND_STATES.includes(o.status))
        .filter((o) => s.inList(o.priority, priority))
        .filter((o) => !customerId || o.customerId === customerId)
        .filter((o) => s.matchesQ(q, o.number, o.customerName, o.shipToCity, ...o.lines.map((l) => l.sku)))
        .map(toOrder)
        .filter((o) => !delayedOnly || o.delayed);
      return s.paginate(rows, ctx.query, 'createdAt,desc');
    },
    { permission: 'orders:view' },
  );

  s.on('GET', '/orders/:id', (ctx) => toOrder(findOrder(ctx)), { permission: 'orders:view' });

  s.on(
    'POST',
    '/orders',
    (ctx) => {
      const customerId = s.str(ctx.body['customerId']);
      const warehouseId = s.str(ctx.body['warehouseId']);
      const priority = s.str(ctx.body['priority']) as Priority;
      const requiredBy = s.str(ctx.body['requiredBy']);
      const raw = Array.isArray(ctx.body['lines']) ? (ctx.body['lines'] as { productId: string; qty: number }[]) : [];
      const customer = s.db.customers.find((c) => c.id === customerId);
      s.validate([
        [!!customer && customer.status === 'ACTIVE', 'customerId', 'Choose an active customer.'],
        [s.db.warehouses.some((w) => w.id === warehouseId && w.status === 'ACTIVE'), 'warehouseId', 'Choose an active warehouse.'],
        [PRIORITIES.includes(priority), 'priority', 'Choose a priority.'],
        [!Number.isNaN(Date.parse(requiredBy)), 'requiredBy', 'Enter the required-by date.'],
        [raw.length > 0, 'lines', 'Add at least one product.'],
        [raw.every((l) => Number.isInteger(Number(l.qty)) && Number(l.qty) > 0), 'lines', 'Quantities must be whole numbers above 0.'],
        [new Set(raw.map((l) => l.productId)).size === raw.length, 'lines', 'Each product may appear once.'],
      ]);
      s.assertWarehouseAccess(ctx, warehouseId);
      const lines: OrderLine[] = raw.map((l) => {
        const p = s.product(l.productId);
        if (p.status !== 'ACTIVE') throw conflict(`${p.sku} is discontinued.`);
        return { productId: p.id, sku: p.sku, productName: p.name, qty: Number(l.qty), allocated: 0, picked: 0 };
      });
      const numberOverride = s.str(ctx.body['number']);
      const o: DbOrder = {
        id: s.nextId('ord'),
        number: numberOverride || s.nextNumber('orderNo', 'ORD', 10483),
        customerId,
        customerName: customer?.name ?? '',
        warehouseId,
        warehouseName: s.warehouse(warehouseId).name,
        priority,
        shipToCity: s.str(ctx.body['shipToCity']) || customer?.city || '',
        createdAt: s.nowIso(),
        requiredBy: new Date(requiredBy).toISOString(),
        lines,
        totalQty: lines.reduce((a, l) => a + l.qty, 0),
        status: 'CREATED',
        pickTaskNumber: null,
        packageNumber: null,
        shipmentNumber: null,
        updatedAt: s.nowIso(),
        allocations: [],
      };
      s.db.orders.push(o);
      s.log('order', 'info', `Order ${o.number} created`, `${o.customerName} · ${o.totalQty} units`, warehouseId, s.actor(ctx));
      return toOrder(o);
    },
    { permission: 'orders:create' },
  );

  s.on(
    'POST',
    '/orders/:id/allocate',
    (ctx) => {
      const o = findOrder(ctx);
      expect(o, 'CREATED');
      const reservations: Reservation[] = [];
      try {
        for (const l of o.lines) reservations.push(...s.reserve(o.warehouseId, l.productId, l.qty, o.number, s.actor(ctx)));
      } catch (e) {
        s.release(reservations, o.number, s.actor(ctx));
        throw e;
      }
      o.allocations = reservations;
      o.lines.forEach((l) => (l.allocated = l.qty));
      o.status = 'ALLOCATED';
      o.updatedAt = s.nowIso();
      s.log('order', 'info', `Order ${o.number} allocated`, `${o.totalQty} units reserved`, o.warehouseId, s.actor(ctx));
      o.lines.forEach((l) => s.checkLowStock(o.warehouseId, l.productId));
      return toOrder(o);
    },
    { permission: 'orders:approve', status: 200 },
  );

  s.on(
    'POST',
    '/orders/:id/release',
    (ctx) => {
      const o = findOrder(ctx);
      expect(o, 'ALLOCATED');
      const lines: DbPickLine[] = o.allocations.map((r) => {
        const b = s.db.balances.find((x) => x.id === r.balanceId);
        const bin = s.bin(b?.binId ?? '');
        const p = s.product(r.productId);
        return { productId: p.id, sku: p.sku, productName: p.name, binCode: bin.code, qty: r.qty, picked: 0, balanceId: r.balanceId };
      });
      const firstBin = s.db.bins.find((b) => b.warehouseId === o.warehouseId && b.code === lines[0]?.binCode);
      const task: DbPickTask = {
        id: s.nextId('pick'),
        number: s.nextNumber('pickNo', 'PCK', 8022),
        orderId: o.id,
        orderNumber: o.number,
        warehouseId: o.warehouseId,
        warehouseName: o.warehouseName,
        zone: firstBin ? firstBin.code.split('-').slice(0, 2).join('-') : '—',
        picker: null,
        priority: o.priority,
        lines,
        totalQty: lines.reduce((a, l) => a + l.qty, 0),
        status: 'PENDING',
        createdAt: s.nowIso(),
        startedAt: null,
        completedAt: null,
      };
      if (s.db.settings.operations.autoAssignPickers) {
        const pickerRole = s.db.roles.find((r) => r.name === 'Picker');
        const pickers = s.db.users.filter(
          (u) => u.status === 'ACTIVE' && u.roleId === pickerRole?.id && (u.warehouseIds.length === 0 || u.warehouseIds.includes(o.warehouseId)),
        );
        const load = (name: string) => s.db.pickTasks.filter((t) => t.picker === name && ['ASSIGNED', 'IN_PROGRESS'].includes(t.status)).length;
        const chosen = pickers.sort((a, b) => load(a.name) - load(b.name))[0];
        if (chosen) {
          task.picker = chosen.name;
          task.status = 'ASSIGNED';
        }
      }
      s.db.pickTasks.push(task);
      o.pickTaskNumber = task.number;
      o.status = 'PICKING';
      o.updatedAt = s.nowIso();
      s.log('pick', 'info', `Pick task ${task.number} created`, `${o.number}${task.picker ? ` · ${task.picker}` : ''}`, o.warehouseId, s.actor(ctx));
      return toOrder(o);
    },
    { permission: 'orders:approve', status: 200 },
  );

  s.on(
    'POST',
    '/orders/:id/cancel',
    (ctx) => {
      const o = findOrder(ctx);
      expect(o, 'CREATED', 'ALLOCATED');
      s.release(o.allocations, o.number, s.actor(ctx));
      o.allocations = [];
      o.lines.forEach((l) => (l.allocated = 0));
      o.status = 'CANCELLED';
      o.updatedAt = s.nowIso();
      s.log('order', 'danger', `Order ${o.number} cancelled`, s.str(ctx.body['reason']) || o.customerName, o.warehouseId, s.actor(ctx));
      return toOrder(o);
    },
    { permission: 'orders:edit', status: 200 },
  );

  s.on(
    'POST',
    '/orders/:id/pack',
    (ctx) => {
      const o = findOrder(ctx);
      expect(o, 'PICKED');
      const station = s.str(ctx.body['station']);
      const weightKg = s.num(ctx.body['weightKg']);
      s.validate([
        [(PACK_STATIONS as readonly string[]).includes(station), 'station', 'Choose a packing station.'],
        [weightKg > 0 && weightKg <= 1000, 'weightKg', 'Enter the package weight in kg.'],
      ]);
      const pkg = {
        id: s.nextId('pkg'),
        number: s.nextNumber('pkgNo', 'PKG', 5043),
        orderId: o.id,
        orderNumber: o.number,
        customerName: o.customerName,
        warehouseId: o.warehouseId,
        station,
        items: o.lines.reduce((a, l) => a + l.picked, 0),
        weightKg: Math.round(weightKg * 10) / 10,
        packedBy: s.actor(ctx),
        packedAt: s.nowIso(),
      };
      s.db.packages.push(pkg);
      o.packageNumber = pkg.number;
      o.status = 'PACKED';
      o.updatedAt = s.nowIso();
      s.log('pack', 'success', `Order ${o.number} packed`, `${pkg.number} · ${station} · ${pkg.weightKg} kg`, o.warehouseId, s.actor(ctx));
      return toOrder(o);
    },
    { permission: 'packing:edit', status: 200 },
  );

  s.on(
    'POST',
    '/orders/:id/ship',
    (ctx) => {
      const o = findOrder(ctx);
      expect(o, 'PACKED');
      const carrier = s.str(ctx.body['carrier']);
      const trackingNumber = s.str(ctx.body['trackingNumber']).toUpperCase();
      s.validate([
        [(CARRIERS as readonly string[]).includes(carrier), 'carrier', 'Choose a carrier.'],
        [/^[A-Z0-9]{6,20}$/.test(trackingNumber), 'trackingNumber', 'Enter the tracking number (6–20 letters or digits).'],
        [!s.db.shipments.some((x) => x.carrier === carrier && x.trackingNumber === trackingNumber), 'trackingNumber', 'This tracking number is already used.'],
      ]);
      const shp: Shipment = {
        id: s.nextId('shp'),
        number: s.nextNumber('shpNo', 'SHP', 2049),
        orderId: o.id,
        orderNumber: o.number,
        customerName: o.customerName,
        warehouseId: o.warehouseId,
        carrier,
        trackingNumber,
        destination: o.shipToCity,
        shippedAt: s.nowIso(),
        deliveredAt: null,
        status: 'IN_TRANSIT',
        exceptionNote: null,
      };
      s.db.shipments.push(shp);
      o.shipmentNumber = shp.number;
      o.status = 'SHIPPED';
      o.updatedAt = s.nowIso();
      s.log('ship', 'info', `Shipment ${shp.number} dispatched`, `${carrier} · ${o.warehouseName.split(' ')[0]} to ${shp.destination}`, o.warehouseId, s.actor(ctx));
      return toOrder(o);
    },
    { permission: 'shipping:edit', status: 200 },
  );

  // ------------------------------------------------------------------ picking

  const findTask = (ctx: Ctx): DbPickTask => {
    const t = s.db.pickTasks.find((x) => x.id === ctx.params['id']);
    if (!t) throw notFound('Pick task');
    s.assertWarehouseAccess(ctx, t.warehouseId);
    return t;
  };

  s.on(
    'GET',
    '/pick-tasks',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const picker = ctx.query.get('picker');
      const rows = s.db.pickTasks
        .filter((t) => inScope(t.warehouseId))
        .filter((t) => s.inList(t.status, status))
        .filter((t) => !picker || t.picker === (picker === 'me' ? ctx.user.name : picker))
        .filter((t) => s.matchesQ(q, t.number, t.orderNumber, t.picker, t.zone))
        .map(toTask);
      return s.paginate(rows, ctx.query, 'createdAt,desc');
    },
    { permission: 'picking:view' },
  );

  s.on('GET', '/pick-tasks/:id', (ctx) => toTask(findTask(ctx)), { permission: 'picking:view' });

  s.on(
    'POST',
    '/pick-tasks/:id/assign',
    (ctx) => {
      const t = findTask(ctx);
      if (!['PENDING', 'ASSIGNED'].includes(t.status)) throw conflict(`${t.number} is already ${t.status.toLowerCase().replace('_', ' ')}.`);
      const picker = s.str(ctx.body['picker']);
      s.validate([[s.db.users.some((u) => u.name === picker && u.status === 'ACTIVE'), 'picker', 'Choose a picker.']]);
      t.picker = picker;
      t.status = 'ASSIGNED';
      s.log('pick', 'info', `${t.number} assigned`, picker, t.warehouseId, s.actor(ctx));
      return toTask(t);
    },
    { permission: 'picking:edit', status: 200 },
  );

  s.on(
    'POST',
    '/pick-tasks/:id/start',
    (ctx) => {
      const t = findTask(ctx);
      if (!['PENDING', 'ASSIGNED'].includes(t.status)) throw conflict(`${t.number} has already started.`);
      t.picker = t.picker ?? s.actor(ctx);
      t.status = 'IN_PROGRESS';
      t.startedAt = s.nowIso();
      return toTask(t);
    },
    { permission: 'picking:edit', status: 200 },
  );

  s.on(
    'POST',
    '/pick-tasks/:id/complete',
    (ctx) => {
      const t = findTask(ctx);
      if (t.status !== 'IN_PROGRESS') throw conflict(`Start ${t.number} before confirming picks.`);
      const raw = Array.isArray(ctx.body['lines']) ? (ctx.body['lines'] as { productId: string; binCode: string; picked: number }[]) : [];
      const pickedFor = (l: DbPickLine) => Number(raw.find((r) => r.productId === l.productId && r.binCode === l.binCode)?.picked);
      s.validate([
        [t.lines.every((l) => Number.isInteger(pickedFor(l))), 'lines', 'Enter the picked quantity for every line.'],
        [t.lines.every((l) => pickedFor(l) >= 0 && pickedFor(l) <= l.qty), 'lines', 'Picked cannot be negative or more than requested.'],
      ]);
      const o = s.db.orders.find((x) => x.id === t.orderId);
      if (!o) throw notFound('Order');
      for (const l of t.lines) {
        l.picked = pickedFor(l);
        s.pick({ balanceId: l.balanceId, productId: l.productId, qty: l.qty }, l.picked, t.number, t.picker ?? s.actor(ctx));
        const ol = o.lines.find((x) => x.productId === l.productId);
        if (ol) ol.picked += l.picked;
      }
      const short = t.lines.some((l) => l.picked < l.qty);
      t.status = short ? 'SHORT' : 'COMPLETED';
      t.completedAt = s.nowIso();
      o.allocations = [];
      o.lines.forEach((l) => (l.allocated = 0));
      const totalPicked = o.lines.reduce((a, l) => a + l.picked, 0);
      o.status = totalPicked > 0 ? 'PICKED' : 'CREATED';
      o.updatedAt = s.nowIso();
      if (short) {
        s.log('pick', 'warning', `Short pick on ${o.number}`, `${totalPicked} of ${o.totalQty} units found`, o.warehouseId, t.picker ?? s.actor(ctx));
        s.notify('warning', 'Short pick', `${t.number} for ${o.number}: ${totalPicked} of ${o.totalQty} units found`, `/orders/${o.id}`);
      } else {
        s.log('pick', 'success', `Order ${o.number} picked successfully`, `Zone ${t.zone} · By ${t.picker ?? s.actor(ctx)}`, o.warehouseId, t.picker ?? s.actor(ctx));
      }
      t.lines.forEach((l) => s.checkLowStock(t.warehouseId, l.productId));
      return toTask(t);
    },
    { permission: 'picking:edit', status: 200 },
  );

  // ------------------------------------------------------------------ packing + shipping

  s.on(
    'GET',
    '/packages',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const q = ctx.query.get('q');
      const rows = s.db.packages
        .filter((p) => inScope(p.warehouseId))
        .filter((p) => s.matchesQ(q, p.number, p.orderNumber, p.customerName, p.station, p.packedBy));
      return s.paginate(rows, ctx.query, 'packedAt,desc');
    },
    { permission: 'packing:view' },
  );

  const findShipment = (ctx: Ctx): Shipment => {
    const x = s.db.shipments.find((y) => y.id === ctx.params['id']);
    if (!x) throw notFound('Shipment');
    s.assertWarehouseAccess(ctx, x.warehouseId);
    return x;
  };

  s.on(
    'GET',
    '/shipments',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const carrier = ctx.query.get('carrier');
      const rows = s.db.shipments
        .filter((x) => inScope(x.warehouseId))
        .filter((x) => s.inList(x.status, status))
        .filter((x) => !carrier || x.carrier === carrier)
        .filter((x) => s.matchesQ(q, x.number, x.orderNumber, x.trackingNumber, x.customerName, x.destination));
      return s.paginate(rows, ctx.query, 'shippedAt,desc');
    },
    { permission: 'shipping:view' },
  );

  s.on(
    'POST',
    '/shipments/:id/deliver',
    (ctx) => {
      const x = findShipment(ctx);
      if (x.status === 'DELIVERED') throw conflict(`${x.number} is already delivered.`);
      x.status = 'DELIVERED';
      x.deliveredAt = s.nowIso();
      const o = s.db.orders.find((y) => y.id === x.orderId);
      if (o) {
        o.status = 'DELIVERED';
        o.updatedAt = s.nowIso();
      }
      s.log('ship', 'success', `Shipment ${x.number} delivered`, `${x.carrier} · ${x.destination}`, x.warehouseId, s.actor(ctx));
      return x;
    },
    { permission: 'shipping:edit', status: 200 },
  );

  s.on(
    'POST',
    '/shipments/:id/exception',
    (ctx) => {
      const x = findShipment(ctx);
      if (x.status === 'DELIVERED') throw conflict(`${x.number} is already delivered.`);
      const note = s.str(ctx.body['note']);
      s.validate([[note.length >= 3, 'note', 'Describe the problem.']]);
      x.status = 'EXCEPTION';
      x.exceptionNote = note;
      s.log('ship', 'danger', `Delivery exception · ${x.number}`, note, x.warehouseId, s.actor(ctx));
      s.notify('danger', 'Delivery exception', `${x.number} (${x.orderNumber}): ${note}`, `/shipping?q=${x.number}`, 'orderDelay');
      return x;
    },
    { permission: 'shipping:edit', status: 200 },
  );
}
