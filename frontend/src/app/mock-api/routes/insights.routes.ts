import { Alert, DashboardSummary, ORDER_STATUSES, ReportColumn, ReportDefinition, ReportResult, SearchResult } from '@core/models';
import { notFound } from '../mock-types';
import { MockServer } from '../mock-server';

const DAY = 24 * 60 * 60 * 1000;

export const REPORTS: Omit<ReportDefinition, 'lastRunAt'>[] = [
  { key: 'inventory-summary', name: 'Inventory Summary', category: 'Inventory', description: 'Stock snapshot by warehouse and product' },
  { key: 'stock-movement', name: 'Stock Movement', category: 'Inventory', description: 'Every ledger movement in the period' },
  { key: 'low-stock', name: 'Low Stock Report', category: 'Inventory', description: 'Items at or below their reorder level' },
  { key: 'inventory-valuation', name: 'Inventory Valuation', category: 'Inventory', description: 'On-hand stock valued at unit cost' },
  { key: 'warehouse-utilization', name: 'Warehouse Utilization', category: 'Warehouse', description: 'Bin capacity used, by warehouse and zone' },
  { key: 'bin-utilization', name: 'Bin Utilization', category: 'Warehouse', description: 'Occupancy of every bin' },
  { key: 'warehouse-performance', name: 'Warehouse Performance', category: 'Warehouse', description: 'Orders shipped and pick accuracy per warehouse' },
  { key: 'order-summary', name: 'Order Summary', category: 'Orders', description: 'Order volume by status and priority' },
  { key: 'picking-performance', name: 'Picking Performance', category: 'Orders', description: 'Pick tasks, units and short picks per picker' },
  { key: 'packing-performance', name: 'Packing Performance', category: 'Orders', description: 'Packages and weight per station' },
  { key: 'shipping-performance', name: 'Shipping Performance', category: 'Orders', description: 'Shipments, deliveries and exceptions per carrier' },
  { key: 'supplier-performance', name: 'Supplier Performance', category: 'Suppliers', description: 'Fill rate and damage rate per supplier' },
  { key: 'receiving-performance', name: 'Receiving Performance', category: 'Suppliers', description: 'Inbound shipments received and discrepancies' },
];

export function registerInsightRoutes(s: MockServer): void {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  // ------------------------------------------------------------------ dashboard

  s.on(
    'GET',
    '/dashboard/summary',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const now = s.now();
      const today = startOfDay(now);
      const warehouses = s.db.warehouses.filter((w) => inScope(w.id));
      const balances = s.db.balances.filter((b) => inScope(b.warehouseId));
      const orders = s.db.orders.filter((o) => inScope(o.warehouseId));
      const bins = s.db.bins.filter((b) => inScope(b.warehouseId));
      const capacityUnits = bins.reduce((a, b) => a + b.capacityUnits, 0);
      const usedUnits = balances.reduce((a, b) => a + b.onHand, 0);
      const capacityPct = capacityUnits ? Math.round((usedUnits / capacityUnits) * 100) : 0;

      // Per (warehouse, product) status, the same rule the inventory page uses.
      const lowItems: { sku: string; warehouse: string }[] = [];
      for (const w of warehouses) {
        for (const p of s.db.products) {
          if (!balances.some((b) => b.warehouseId === w.id && b.productId === p.id)) continue;
          const t = s.productTotals(p.id, (id) => id === w.id);
          const st = s.stockStatus(p, t.onHand, t.available);
          if (st === 'LOW_STOCK' || st === 'OUT_OF_STOCK') lowItems.push({ sku: p.sku, warehouse: w.name });
        }
      }

      const delayed = orders.filter(
        (o) => ['CREATED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKED'].includes(o.status) && Date.parse(o.requiredBy) < now.getTime(),
      );
      const alerts: Alert[] = [];
      for (const o of delayed.sort((a, b) => a.requiredBy.localeCompare(b.requiredBy)).slice(0, 2)) {
        alerts.push({ id: `delay-${o.id}`, tone: 'danger', title: `${o.number} is past its required date`, detail: `${o.totalQty} units · ${o.customerName} · ${o.status.toLowerCase()}`, link: `/orders/${o.id}`, action: 'Open' });
      }
      for (const w of warehouses) {
        const wb = bins.filter((b) => b.warehouseId === w.id);
        const cap = wb.reduce((a, b) => a + b.capacityUnits, 0);
        const used = balances.filter((b) => b.warehouseId === w.id).reduce((a, b) => a + b.onHand, 0);
        const pct = cap ? Math.round((used / cap) * 100) : 0;
        if (pct >= s.db.settings.operations.capacityAlertPct) {
          alerts.push({ id: `cap-${w.id}`, tone: 'warning', title: `${w.code} at ${pct}% capacity`, detail: w.name, link: `/warehouses/${w.id}`, action: 'View' });
        }
      }
      if (lowItems.length) {
        const skus = Array.from(new Set(lowItems.map((i) => i.sku)));
        alerts.push({
          id: 'low-stock',
          tone: 'warning',
          title: `${lowItems.length} item${lowItems.length === 1 ? '' : 's'} at or below reorder level`,
          detail: skus.slice(0, 3).join(', ') + (skus.length > 3 ? ` +${skus.length - 3} more` : ''),
          link: '/inventory',
          queryParams: { stockStatus: 'LOW_STOCK,OUT_OF_STOCK' },
          action: 'Review',
        });
      }
      for (const x of s.db.shipments.filter((y) => y.status === 'EXCEPTION' && inScope(y.warehouseId)).slice(0, 2)) {
        alerts.push({ id: `shp-${x.id}`, tone: 'danger', title: `Delivery exception on ${x.number}`, detail: x.exceptionNote ?? x.carrier, link: '/shipping', queryParams: { q: x.number }, action: 'Open' });
      }
      const soon = s.db.inbounds
        .filter((i) => inScope(i.warehouseId) && i.status === 'EXPECTED' && Date.parse(i.expectedAt) < now.getTime() + DAY)
        .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));
      for (const i of soon.slice(0, 2)) {
        alerts.push({ id: `asn-${i.id}`, tone: 'info', title: `${i.number} arriving ${Date.parse(i.expectedAt) < now.getTime() ? 'now (overdue)' : 'within 24 h'}`, detail: `${i.supplierName} · ${i.totalExpected} units`, link: `/inbound/${i.id}`, action: 'Prepare' });
      }

      const ordersByDay = Array.from({ length: 7 }, (_, i) => {
        const dayStart = today - (6 - i) * DAY;
        const inDay = (iso: string | null) => !!iso && Date.parse(iso) >= dayStart && Date.parse(iso) < dayStart + DAY;
        return {
          date: new Date(dayStart).toISOString(),
          received: orders.filter((o) => inDay(o.createdAt)).length,
          shipped: s.db.shipments.filter((x) => inScope(x.warehouseId) && inDay(x.shippedAt)).length,
        };
      });

      const since = now.getTime() - 30 * DAY;
      const ordered = new Map<string, number>();
      for (const o of orders) {
        if (Date.parse(o.createdAt) < since || o.status === 'CANCELLED') continue;
        for (const l of o.lines) ordered.set(l.productId, (ordered.get(l.productId) ?? 0) + l.qty);
      }
      const topProducts = Array.from(ordered.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([productId, orderedQty]) => {
          const p = s.product(productId);
          const t = s.productTotals(productId, inScope);
          return { productId, sku: p.sku, name: p.name, category: p.category, orderedQty, available: t.available, stockStatus: s.aggregateStatus(p, inScope) };
        });

      const summary: DashboardSummary = {
        generatedAt: now.toISOString(),
        kpis: {
          onHand: usedUnits,
          ordersToday: orders.filter((o) => Date.parse(o.createdAt) >= today).length,
          pendingPicking: s.db.pickTasks.filter((t) => inScope(t.warehouseId) && ['PENDING', 'ASSIGNED', 'IN_PROGRESS'].includes(t.status)).length,
          readyToShip: orders.filter((o) => o.status === 'PACKED').length,
          lowStockItems: lowItems.length,
          capacityPct,
        },
        stockByWarehouse: warehouses.map((w) => {
          const wb = balances.filter((b) => b.warehouseId === w.id);
          return {
            warehouseId: w.id,
            name: w.name,
            available: wb.reduce((a, b) => a + s.available(b), 0),
            reserved: wb.reduce((a, b) => a + b.reserved, 0),
            damaged: wb.reduce((a, b) => a + b.damaged, 0),
            inTransit: s.db.transfers.filter((t) => t.destWarehouseId === w.id && t.status === 'IN_TRANSIT').reduce((a, t) => a + t.totalQty, 0),
          };
        }),
        capacity: { usedUnits, capacityUnits, pct: capacityPct },
        ordersByDay,
        orderStatus: ORDER_STATUSES.map((status) => ({ status, count: orders.filter((o) => o.status === status).length })).filter((x) => x.count > 0),
        alerts,
        activity: s.db.activity.filter((a) => a.warehouseId === null ? !ctx.query.get('warehouseId') && !ctx.warehouseContext : inScope(a.warehouseId)).slice(0, 8),
        topProducts,
      };
      return summary;
    },
    { permission: 'dashboard:view' },
  );

  s.on('GET', '/activity', (ctx) => {
    const inScope = s.warehouseFilter(ctx);
    const kind = ctx.query.get('kind');
    const rows = s.db.activity.filter((a) => (a.warehouseId === null ? true : inScope(a.warehouseId))).filter((a) => s.inList(a.kind, kind));
    return s.paginate(rows, ctx.query, 'at,desc');
  });

  // ------------------------------------------------------------------ search

  s.on('GET', '/search', (ctx) => {
    const q = (ctx.query.get('q') ?? '').trim();
    if (q.length < 2) return [];
    const can = (p: string) => ctx.perms.has(p);
    const allowed = s.allowedWarehouses(ctx.user);
    const inScope = (id: string) => !allowed || allowed.has(id);
    const out: SearchResult[] = [];
    if (can('catalog:view') || can('inventory:view')) {
      for (const p of s.db.products.filter((x) => s.matchesQ(q, x.sku, x.name)).slice(0, 4)) {
        out.push({ type: 'product', id: p.id, title: p.name, subtitle: `${p.sku} · ${p.category}`, link: can('inventory:view') ? '/inventory' : '/products', queryParams: { q: p.sku } });
      }
    }
    if (can('orders:view')) {
      for (const o of s.db.orders.filter((x) => inScope(x.warehouseId) && s.matchesQ(q, x.number, x.customerName)).slice(0, 4)) {
        out.push({ type: 'order', id: o.id, title: o.number, subtitle: `${o.customerName} · ${o.status.toLowerCase()}`, link: `/orders/${o.id}` });
      }
    }
    if (can('warehouses:view')) {
      for (const w of s.db.warehouses.filter((x) => inScope(x.id) && s.matchesQ(q, x.code, x.name, x.city)).slice(0, 3)) {
        out.push({ type: 'warehouse', id: w.id, title: w.name, subtitle: `${w.code} · ${w.city}`, link: `/warehouses/${w.id}` });
      }
    }
    if (can('inbound:view')) {
      for (const i of s.db.inbounds.filter((x) => inScope(x.warehouseId) && s.matchesQ(q, x.number, x.poReference, x.supplierName)).slice(0, 3)) {
        out.push({ type: 'inbound', id: i.id, title: i.number, subtitle: `${i.supplierName} · ${i.status.toLowerCase().replace('_', ' ')}`, link: `/inbound/${i.id}` });
      }
    }
    if (can('transfers:view')) {
      for (const t of s.db.transfers.filter((x) => (inScope(x.sourceWarehouseId) || inScope(x.destWarehouseId)) && s.matchesQ(q, x.number)).slice(0, 3)) {
        out.push({ type: 'transfer', id: t.id, title: t.number, subtitle: `${t.sourceWarehouseName} → ${t.destWarehouseName}`, link: `/transfers/${t.id}` });
      }
    }
    if (can('catalog:view')) {
      for (const c of s.db.customers.filter((x) => s.matchesQ(q, x.code, x.name)).slice(0, 3)) {
        out.push({ type: 'customer', id: c.id, title: c.name, subtitle: c.code, link: '/customers', queryParams: { q: c.code } });
      }
      for (const c of s.db.suppliers.filter((x) => s.matchesQ(q, x.code, x.name)).slice(0, 3)) {
        out.push({ type: 'supplier', id: c.id, title: c.name, subtitle: c.code, link: '/suppliers', queryParams: { q: c.code } });
      }
    }
    return out.slice(0, 12);
  });

  // ------------------------------------------------------------------ reports

  s.on('GET', '/reports', () => REPORTS.map((r) => ({ ...r, lastRunAt: s.db.reportRuns[r.key] ?? null })), { permission: 'reports:view' });

  s.on(
    'POST',
    '/reports/:key/run',
    (ctx) => {
      const def = REPORTS.find((r) => r.key === ctx.params['key']);
      if (!def) throw notFound('Report');
      const inScope = s.warehouseFilter({ ...ctx, query: new URLSearchParams(ctx.body['warehouseId'] ? { warehouseId: String(ctx.body['warehouseId']) } : {}) });
      const from = ctx.body['from'] ? Date.parse(String(ctx.body['from'])) : 0;
      const to = ctx.body['to'] ? Date.parse(String(ctx.body['to'])) + DAY : Number.MAX_SAFE_INTEGER;
      const inPeriod = (iso: string | null) => !!iso && Date.parse(iso) >= from && Date.parse(iso) < to;
      const { columns, rows } = runReport(s, def.key, inScope, inPeriod);
      s.db.reportRuns[def.key] = s.nowIso();
      const result: ReportResult = { key: def.key, name: def.name, generatedAt: s.nowIso(), columns, rows };
      return result;
    },
    { permission: 'reports:view', status: 200 },
  );
}

type Row = Record<string, string | number>;

function runReport(
  s: MockServer,
  key: string,
  inScope: (warehouseId: string) => boolean,
  inPeriod: (iso: string | null) => boolean,
): { columns: ReportColumn[]; rows: Row[] } {
  const col = (k: string, label: string, numeric = false): ReportColumn => ({ key: k, label, numeric });
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const warehouses = s.db.warehouses.filter((w) => inScope(w.id));

  switch (key) {
    case 'inventory-summary':
    case 'low-stock':
    case 'inventory-valuation': {
      const rows: Row[] = [];
      for (const w of warehouses) {
        for (const p of s.db.products) {
          if (!s.db.balances.some((b) => b.warehouseId === w.id && b.productId === p.id)) continue;
          const t = s.productTotals(p.id, (id) => id === w.id);
          const status = s.stockStatus(p, t.onHand, t.available);
          if (key === 'low-stock' && status !== 'LOW_STOCK' && status !== 'OUT_OF_STOCK') continue;
          rows.push({
            warehouse: w.name,
            sku: p.sku,
            product: p.name,
            onHand: t.onHand,
            reserved: t.reserved,
            damaged: t.damaged,
            available: t.available,
            reorderLevel: p.reorderLevel,
            status: status.replace(/_/g, ' '),
            unitCost: p.unitCost,
            value: Math.round(t.onHand * p.unitCost),
          });
        }
      }
      if (key === 'inventory-valuation') {
        return {
          columns: [col('warehouse', 'Warehouse'), col('sku', 'SKU'), col('product', 'Product'), col('onHand', 'On hand', true), col('unitCost', 'Unit cost (₹)', true), col('value', 'Value (₹)', true)],
          rows: rows.sort((a, b) => Number(b['value']) - Number(a['value'])),
        };
      }
      return {
        columns: [col('warehouse', 'Warehouse'), col('sku', 'SKU'), col('product', 'Product'), col('onHand', 'On hand', true), col('reserved', 'Reserved', true), col('damaged', 'Damaged', true), col('available', 'Available', true), col('reorderLevel', 'Reorder level', true), col('status', 'Status')],
        rows,
      };
    }
    case 'stock-movement':
      return {
        columns: [col('at', 'Date'), col('type', 'Type'), col('warehouse', 'Warehouse'), col('bin', 'Bin'), col('sku', 'SKU'), col('qty', 'Qty', true), col('reference', 'Reference'), col('user', 'User')],
        rows: s.db.movements
          .filter((m) => inScope(m.warehouseId) && inPeriod(m.at))
          .sort((a, b) => b.at.localeCompare(a.at))
          .map((m) => ({ at: m.at.slice(0, 16).replace('T', ' '), type: m.type, warehouse: m.warehouseName, bin: m.binCode, sku: m.sku, qty: m.qty, reference: m.reference, user: m.user })),
      };
    case 'warehouse-utilization': {
      const rows: Row[] = [];
      for (const w of warehouses) {
        for (const z of s.db.zones.filter((x) => x.warehouseId === w.id)) {
          const bins = s.db.bins.filter((b) => b.zoneId === z.id);
          const cap = bins.reduce((a, b) => a + b.capacityUnits, 0);
          const used = bins.reduce((a, b) => a + s.binUsed(b.id), 0);
          rows.push({ warehouse: w.name, zone: `${z.name} (${z.code})`, bins: bins.length, capacity: cap, used, utilization: pct(used, cap) });
        }
      }
      return { columns: [col('warehouse', 'Warehouse'), col('zone', 'Zone'), col('bins', 'Bins', true), col('capacity', 'Capacity (units)', true), col('used', 'Used (units)', true), col('utilization', 'Utilization %', true)], rows };
    }
    case 'bin-utilization':
      return {
        columns: [col('warehouse', 'Warehouse'), col('bin', 'Bin'), col('zone', 'Zone'), col('capacity', 'Capacity', true), col('used', 'Used', true), col('utilization', 'Utilization %', true), col('blocked', 'Blocked')],
        rows: s.db.bins
          .filter((b) => inScope(b.warehouseId))
          .map((b) => {
            const used = s.binUsed(b.id);
            return { warehouse: s.warehouse(b.warehouseId).name, bin: b.code, zone: s.zoneOf(b)?.name ?? '', capacity: b.capacityUnits, used, utilization: pct(used, b.capacityUnits), blocked: b.blocked ? 'Yes' : 'No' };
          }),
      };
    case 'warehouse-performance':
      return {
        columns: [col('warehouse', 'Warehouse'), col('orders', 'Orders', true), col('shipped', 'Shipped', true), col('delivered', 'Delivered', true), col('pickAccuracy', 'Pick accuracy %', true), col('cancelled', 'Cancelled', true)],
        rows: warehouses.map((w) => {
          const orders = s.db.orders.filter((o) => o.warehouseId === w.id && inPeriod(o.createdAt));
          const tasks = s.db.pickTasks.filter((t) => t.warehouseId === w.id && t.completedAt && inPeriod(t.completedAt));
          const req = tasks.reduce((a, t) => a + t.totalQty, 0);
          const got = tasks.reduce((a, t) => a + t.lines.reduce((x, l) => x + l.picked, 0), 0);
          return {
            warehouse: w.name,
            orders: orders.length,
            shipped: orders.filter((o) => ['SHIPPED', 'DELIVERED'].includes(o.status)).length,
            delivered: orders.filter((o) => o.status === 'DELIVERED').length,
            pickAccuracy: req ? pct(got, req) : 0,
            cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
          };
        }),
      };
    case 'order-summary': {
      const orders = s.db.orders.filter((o) => inScope(o.warehouseId) && inPeriod(o.createdAt));
      return {
        columns: [col('status', 'Status'), col('low', 'Low', true), col('normal', 'Normal', true), col('high', 'High', true), col('critical', 'Critical', true), col('total', 'Total', true), col('units', 'Units', true)],
        rows: ORDER_STATUSES.map((st) => {
          const g = orders.filter((o) => o.status === st);
          const by = (p: string) => g.filter((o) => o.priority === p).length;
          return { status: st, low: by('LOW'), normal: by('NORMAL'), high: by('HIGH'), critical: by('CRITICAL'), total: g.length, units: g.reduce((a, o) => a + o.totalQty, 0) };
        }).filter((r) => r.total > 0),
      };
    }
    case 'picking-performance': {
      const tasks = s.db.pickTasks.filter((t) => inScope(t.warehouseId) && t.completedAt && inPeriod(t.completedAt));
      const pickers = Array.from(new Set(tasks.map((t) => t.picker ?? 'Unassigned')));
      return {
        columns: [col('picker', 'Picker'), col('tasks', 'Tasks', true), col('units', 'Units picked', true), col('short', 'Short picks', true), col('accuracy', 'Accuracy %', true), col('avgMinutes', 'Avg minutes', true)],
        rows: pickers.map((name) => {
          const mine = tasks.filter((t) => (t.picker ?? 'Unassigned') === name);
          const req = mine.reduce((a, t) => a + t.totalQty, 0);
          const got = mine.reduce((a, t) => a + t.lines.reduce((x, l) => x + l.picked, 0), 0);
          const mins = mine.filter((t) => t.startedAt).map((t) => (Date.parse(t.completedAt ?? '') - Date.parse(t.startedAt ?? '')) / 60000);
          return { picker: name, tasks: mine.length, units: got, short: mine.filter((t) => t.status === 'SHORT').length, accuracy: pct(got, req), avgMinutes: mins.length ? Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 10) / 10 : 0 };
        }),
      };
    }
    case 'packing-performance': {
      const pk = s.db.packages.filter((p) => inScope(p.warehouseId) && inPeriod(p.packedAt));
      return {
        columns: [col('station', 'Station'), col('packages', 'Packages', true), col('items', 'Items', true), col('weight', 'Total kg', true), col('avgWeight', 'Avg kg', true)],
        rows: Array.from(new Set(pk.map((p) => p.station))).sort().map((st) => {
          const g = pk.filter((p) => p.station === st);
          const kg = g.reduce((a, p) => a + p.weightKg, 0);
          return { station: st, packages: g.length, items: g.reduce((a, p) => a + p.items, 0), weight: Math.round(kg * 10) / 10, avgWeight: Math.round((kg / g.length) * 10) / 10 };
        }),
      };
    }
    case 'shipping-performance': {
      const sh = s.db.shipments.filter((x) => inScope(x.warehouseId) && inPeriod(x.shippedAt));
      return {
        columns: [col('carrier', 'Carrier'), col('shipments', 'Shipments', true), col('delivered', 'Delivered', true), col('inTransit', 'In transit', true), col('exceptions', 'Exceptions', true), col('avgDays', 'Avg days to deliver', true)],
        rows: Array.from(new Set(sh.map((x) => x.carrier))).sort().map((c) => {
          const g = sh.filter((x) => x.carrier === c);
          const days = g.filter((x) => x.deliveredAt).map((x) => (Date.parse(x.deliveredAt ?? '') - Date.parse(x.shippedAt)) / DAY);
          return {
            carrier: c,
            shipments: g.length,
            delivered: g.filter((x) => x.status === 'DELIVERED').length,
            inTransit: g.filter((x) => x.status === 'IN_TRANSIT').length,
            exceptions: g.filter((x) => x.status === 'EXCEPTION').length,
            avgDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : 0,
          };
        }),
      };
    }
    case 'supplier-performance':
    case 'receiving-performance': {
      const ib = s.db.inbounds.filter((i) => inScope(i.warehouseId) && inPeriod(i.expectedAt));
      if (key === 'receiving-performance') {
        return {
          columns: [col('number', 'Inbound'), col('supplier', 'Supplier'), col('warehouse', 'Warehouse'), col('expected', 'Expected', true), col('received', 'Received', true), col('damaged', 'Damaged', true), col('status', 'Status'), col('discrepancy', 'Discrepancy')],
          rows: ib.map((i) => ({
            number: i.number,
            supplier: i.supplierName,
            warehouse: i.warehouseName,
            expected: i.totalExpected,
            received: i.totalReceived,
            damaged: i.lines.reduce((a, l) => a + l.damagedQty, 0),
            status: i.status.replace('_', ' '),
            discrepancy: i.discrepancy ? 'Yes' : 'No',
          })),
        };
      }
      return {
        columns: [col('supplier', 'Supplier'), col('shipments', 'Shipments', true), col('expected', 'Units expected', true), col('received', 'Units received', true), col('fillRate', 'Fill rate %', true), col('damageRate', 'Damage rate %', true)],
        rows: s.db.suppliers
          .map((sup) => {
            const g = ib.filter((i) => i.supplierId === sup.id && ['PUTAWAY_PENDING', 'COMPLETED'].includes(i.status));
            const exp = g.reduce((a, i) => a + i.totalExpected, 0);
            const rec = g.reduce((a, i) => a + i.totalReceived, 0);
            const dmg = g.reduce((a, i) => a + i.lines.reduce((x, l) => x + l.damagedQty, 0), 0);
            return { supplier: sup.name, shipments: g.length, expected: exp, received: rec, fillRate: pct(rec, exp), damageRate: pct(dmg, rec) };
          })
          .filter((r) => r.shipments > 0),
      };
    }
    default:
      throw notFound('Report');
  }
}

