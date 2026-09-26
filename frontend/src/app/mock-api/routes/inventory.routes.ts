import { ADJUSTMENT_REASONS, InventoryBalance, InventoryItem, Transfer, TransferLine } from '@wms/core';
import { ApiException, DbBalance, DbTransfer, Reservation, conflict, notFound } from '../mock-types';
import { Ctx, MockServer } from '../mock-server';

export function registerInventoryRoutes(s: MockServer): void {
  const toBalance = (b: DbBalance): InventoryBalance => {
    const bin = s.bin(b.binId);
    const p = s.product(b.productId);
    return {
      ...b,
      binCode: bin.code,
      zoneName: s.zoneOf(bin)?.name ?? '—',
      sku: p.sku,
      productName: p.name,
      available: s.available(b),
    };
  };

  /** One row per (warehouse, product) that has, or had, stock. */
  const items = (ctx: Ctx): InventoryItem[] => {
    const inScope = s.warehouseFilter(ctx);
    const groups = new Map<string, DbBalance[]>();
    for (const b of s.db.balances) {
      if (!inScope(b.warehouseId)) continue;
      const key = `${b.warehouseId}|${b.productId}`;
      groups.set(key, [...(groups.get(key) ?? []), b]);
    }
    return Array.from(groups.entries()).map(([key, list]) => {
      const [warehouseId, productId] = key.split('|');
      const p = s.product(productId);
      const sum = (f: (b: DbBalance) => number) => list.reduce((acc, b) => acc + f(b), 0);
      const onHand = sum((b) => b.onHand);
      const available = sum((b) => s.available(b));
      return {
        id: key,
        warehouseId,
        warehouseName: s.warehouse(warehouseId).name,
        productId,
        sku: p.sku,
        productName: p.name,
        category: p.category,
        onHand,
        reserved: sum((b) => b.reserved),
        damaged: sum((b) => b.damaged),
        blocked: sum((b) => b.blocked),
        available,
        reorderLevel: p.reorderLevel,
        stockStatus: s.stockStatus(p, onHand, available),
        binCount: list.filter((b) => b.onHand > 0).length,
      };
    });
  };

  s.on(
    'GET',
    '/inventory/items',
    (ctx) => {
      const q = ctx.query.get('q');
      const stockStatus = ctx.query.get('stockStatus');
      const category = ctx.query.get('category');
      const rows = items(ctx)
        .filter((i) => s.matchesQ(q, i.sku, i.productName, i.warehouseName))
        .filter((i) => s.inList(i.stockStatus, stockStatus))
        .filter((i) => !category || i.category === category);
      return s.paginate(rows, ctx.query, 'sku,asc');
    },
    { permission: 'inventory:view' },
  );

  s.on(
    'GET',
    '/inventory/balances',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const productId = ctx.query.get('productId');
      const binId = ctx.query.get('binId');
      const nonZero = ctx.query.get('nonZero') !== 'false';
      return s.db.balances
        .filter((b) => inScope(b.warehouseId))
        .filter((b) => !productId || b.productId === productId)
        .filter((b) => !binId || b.binId === binId)
        .filter((b) => !nonZero || b.onHand > 0)
        .map(toBalance)
        .sort((a, b) => a.binCode.localeCompare(b.binCode));
    },
    { permission: 'inventory:view' },
  );

  s.on(
    'GET',
    '/inventory/movements',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const q = ctx.query.get('q');
      const type = ctx.query.get('type');
      const productId = ctx.query.get('productId');
      const rows = s.db.movements
        .filter((m) => inScope(m.warehouseId))
        .filter((m) => s.inList(m.type, type))
        .filter((m) => !productId || m.productId === productId)
        .filter((m) => s.matchesQ(q, m.sku, m.productName, m.reference, m.binCode, m.user));
      return s.paginate(rows, ctx.query, 'at,desc');
    },
    { permission: 'inventory:view' },
  );

  s.on(
    'POST',
    '/inventory/adjustments',
    (ctx) => {
      const b = s.db.balances.find((x) => x.id === ctx.body['balanceId']);
      if (!b) throw notFound('Stock record');
      s.assertWarehouseAccess(ctx, b.warehouseId);
      const kind = ctx.body['kind'];
      const qty = s.num(ctx.body['qty']);
      const reason = s.str(ctx.body['reason']);
      const note = s.str(ctx.body['note']);
      s.validate([
        [kind === 'ADJUST' || kind === 'DAMAGE', 'kind', 'Choose an adjustment type.'],
        [Number.isInteger(qty) && qty !== 0, 'qty', 'Enter a whole number other than 0.'],
        [kind !== 'DAMAGE' || qty > 0, 'qty', 'Enter how many units are damaged.'],
        [(ADJUSTMENT_REASONS as readonly string[]).includes(reason), 'reason', 'Choose a reason.'],
      ]);
      const ref = s.nextNumber('adjNo', 'ADJ', 7001);
      const fullReason = note ? `${reason} — ${note}` : reason;
      if (kind === 'DAMAGE') s.damage(b, qty, fullReason, ref, s.actor(ctx));
      else s.adjust(b, qty, fullReason, ref, s.actor(ctx));
      const p = s.product(b.productId);
      s.log('inventory', kind === 'DAMAGE' ? 'warning' : 'info', `Stock adjusted · ${p.sku}`, `${qty > 0 && kind === 'ADJUST' ? '+' : ''}${qty} · ${reason}`, b.warehouseId, s.actor(ctx));
      s.checkLowStock(b.warehouseId, b.productId);
      return toBalance(b);
    },
    { permission: 'inventory:edit' },
  );

  /**
   * Moves stock between two bins of the same warehouse — putaway of transfer receipts from the
   * dock, re-slotting, consolidating. Only available (unreserved, undamaged) stock can move.
   */
  s.on(
    'POST',
    '/inventory/moves',
    (ctx) => {
      const from = s.db.balances.find((x) => x.id === ctx.body['balanceId']);
      if (!from) throw notFound('Stock record');
      s.assertWarehouseAccess(ctx, from.warehouseId);
      const toBin = s.db.bins.find((b) => b.id === ctx.body['toBinId']);
      const qty = s.num(ctx.body['qty']);
      s.validate([
        [!!toBin && toBin.warehouseId === from.warehouseId, 'toBinId', 'Choose a bin in the same warehouse.'],
        [!!toBin && toBin.id !== from.binId, 'toBinId', 'Choose a different bin.'],
        [Number.isInteger(qty) && qty > 0, 'qty', 'Enter a whole number above 0.'],
      ]);
      const ref = s.nextNumber('moveNo', 'MOV', 9001);
      s.moveStock(from, toBin?.id ?? '', qty, ref, s.actor(ctx));
      const p = s.product(from.productId);
      s.log('inventory', 'info', `Stock moved · ${p.sku}`, `${qty} units ${s.bin(from.binId).code} → ${toBin?.code}`, from.warehouseId, s.actor(ctx));
      return toBalance(s.balanceFor(from.warehouseId, toBin?.id ?? '', from.productId));
    },
    { permission: 'inventory:edit' },
  );

  // ------------------------------------------------------------------ transfers

  const toTransfer = (t: DbTransfer): Transfer => {
    const { reservations: _r, ...rest } = t;
    return rest;
  };

  /**
   * Both ends may view a transfer. Commands belong to one end: the source approves, rejects,
   * cancels and dispatches its own stock; only the destination can receive it.
   */
  const findTransfer = (ctx: Ctx, side?: 'source' | 'dest'): DbTransfer => {
    const t = s.db.transfers.find((x) => x.id === ctx.params['id']);
    if (!t) throw notFound('Transfer');
    const allowed = s.allowedWarehouses(ctx.user);
    if (allowed && !allowed.has(t.sourceWarehouseId) && !allowed.has(t.destWarehouseId)) throw notFound('Transfer');
    if (allowed && side === 'source' && !allowed.has(t.sourceWarehouseId)) {
      throw new ApiException(403, 'Forbidden', `Only staff at ${t.sourceWarehouseName} can do this.`);
    }
    if (allowed && side === 'dest' && !allowed.has(t.destWarehouseId)) {
      throw new ApiException(403, 'Forbidden', `Only staff at ${t.destWarehouseName} can receive this transfer.`);
    }
    return t;
  };

  const expect = (t: DbTransfer, ...states: Transfer['status'][]) => {
    if (!states.includes(t.status)) {
      throw conflict(`Transfer ${t.number} is ${t.status.replace('_', ' ').toLowerCase()}; this action is not allowed now.`);
    }
  };

  s.on(
    'GET',
    '/transfers',
    (ctx) => {
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const inScope = s.warehouseFilter(ctx);
      const rows = s.db.transfers
        .filter((t) => inScope(t.sourceWarehouseId) || inScope(t.destWarehouseId))
        .filter((t) => s.inList(t.status, status))
        .filter((t) => s.matchesQ(q, t.number, t.sourceWarehouseName, t.destWarehouseName, t.requestedBy, ...t.lines.map((l) => l.sku)))
        .map(toTransfer);
      return s.paginate(rows, ctx.query, 'requestedAt,desc');
    },
    { permission: 'transfers:view' },
  );

  s.on(
    'GET',
    '/transfers/counts',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const byStatus: Record<string, number> = {};
      s.db.transfers
        .filter((t) => inScope(t.sourceWarehouseId) || inScope(t.destWarehouseId))
        .forEach((t) => (byStatus[t.status] = (byStatus[t.status] ?? 0) + 1));
      return { byStatus };
    },
    { permission: 'transfers:view' },
  );

  s.on('GET', '/transfers/:id', (ctx) => toTransfer(findTransfer(ctx)), { permission: 'transfers:view' });

  s.on(
    'POST',
    '/transfers',
    (ctx) => {
      const source = s.str(ctx.body['sourceWarehouseId']);
      const dest = s.str(ctx.body['destWarehouseId']);
      const rawLines = Array.isArray(ctx.body['lines']) ? (ctx.body['lines'] as { productId: string; qty: number }[]) : [];
      s.validate([
        [s.db.warehouses.some((w) => w.id === source && w.status === 'ACTIVE'), 'sourceWarehouseId', 'Choose an active source warehouse.'],
        [s.db.warehouses.some((w) => w.id === dest && w.status === 'ACTIVE'), 'destWarehouseId', 'Choose an active destination warehouse.'],
        [source !== dest, 'destWarehouseId', 'Destination must differ from the source.'],
        [rawLines.length > 0, 'lines', 'Add at least one product.'],
        [rawLines.every((l) => Number.isInteger(Number(l.qty)) && Number(l.qty) > 0), 'lines', 'Quantities must be whole numbers above 0.'],
        [new Set(rawLines.map((l) => l.productId)).size === rawLines.length, 'lines', 'Each product may appear once.'],
      ]);
      s.assertWarehouseAccess(ctx, source);
      const lines: TransferLine[] = rawLines.map((l) => {
        const p = s.product(l.productId);
        const avail = s.productTotals(p.id, (id) => id === source).available;
        if (avail < Number(l.qty)) throw conflict(`Only ${avail} of ${p.sku} are available in the source warehouse.`);
        return { productId: p.id, sku: p.sku, productName: p.name, qty: Number(l.qty) };
      });
      const t: DbTransfer = {
        id: s.nextId('trf'),
        number: s.str(ctx.body['number']) || s.nextNumber('transferNo', 'TRF', 3049),
        sourceWarehouseId: source,
        sourceWarehouseName: s.warehouse(source).name,
        destWarehouseId: dest,
        destWarehouseName: s.warehouse(dest).name,
        lines,
        totalQty: lines.reduce((a, l) => a + l.qty, 0),
        requestedBy: s.actor(ctx),
        requestedAt: s.nowIso(),
        status: 'REQUESTED',
        note: s.str(ctx.body['note']),
        updatedAt: s.nowIso(),
        reservations: [],
      };
      s.db.transfers.push(t);
      s.log('transfer', 'info', `Transfer ${t.number} requested`, `${t.sourceWarehouseName} → ${t.destWarehouseName}`, source, s.actor(ctx));
      s.notify('info', 'Transfer awaiting approval', `${t.number} · ${t.totalQty} units`, `/transfers/${t.id}`, { warehouseId: source, permission: 'transfers:approve' });
      return toTransfer(t);
    },
    { permission: 'transfers:create' },
  );

  s.on(
    'POST',
    '/transfers/:id/approve',
    (ctx) => {
      const t = findTransfer(ctx, 'source');
      expect(t, 'REQUESTED');
      const reservations: Reservation[] = [];
      try {
        for (const l of t.lines) reservations.push(...s.reserve(t.sourceWarehouseId, l.productId, l.qty, t.number, s.actor(ctx)));
      } catch (e) {
        s.release(reservations, t.number, s.actor(ctx));
        throw e;
      }
      t.reservations = reservations;
      t.status = 'APPROVED';
      t.updatedAt = s.nowIso();
      s.log('transfer', 'info', `Transfer ${t.number} approved`, `${t.sourceWarehouseName} → ${t.destWarehouseName}`, t.sourceWarehouseId, s.actor(ctx));
      return toTransfer(t);
    },
    { permission: 'transfers:approve', status: 200 },
  );

  s.on(
    'POST',
    '/transfers/:id/reject',
    (ctx) => {
      const t = findTransfer(ctx, 'source');
      expect(t, 'REQUESTED');
      t.status = 'REJECTED';
      t.note = s.str(ctx.body['reason']) || t.note;
      t.updatedAt = s.nowIso();
      s.log('transfer', 'danger', `Transfer ${t.number} rejected`, t.note, t.sourceWarehouseId, s.actor(ctx));
      return toTransfer(t);
    },
    { permission: 'transfers:approve', status: 200 },
  );

  s.on(
    'POST',
    '/transfers/:id/cancel',
    (ctx) => {
      const t = findTransfer(ctx, 'source');
      expect(t, 'REQUESTED', 'APPROVED');
      s.release(t.reservations, t.number, s.actor(ctx));
      t.reservations = [];
      t.status = 'CANCELLED';
      t.updatedAt = s.nowIso();
      s.log('transfer', 'warning', `Transfer ${t.number} cancelled`, '', t.sourceWarehouseId, s.actor(ctx));
      return toTransfer(t);
    },
    { permission: 'transfers:create', status: 200 },
  );

  s.on(
    'POST',
    '/transfers/:id/dispatch',
    (ctx) => {
      const t = findTransfer(ctx, 'source');
      expect(t, 'APPROVED');
      s.shipOut(t.reservations, t.number, s.actor(ctx));
      t.reservations = [];
      t.status = 'IN_TRANSIT';
      t.updatedAt = s.nowIso();
      s.log('transfer', 'info', `Transfer ${t.number} dispatched`, `${t.totalQty} units in transit`, t.sourceWarehouseId, s.actor(ctx));
      t.lines.forEach((l) => s.checkLowStock(t.sourceWarehouseId, l.productId));
      return toTransfer(t);
    },
    { permission: 'transfers:create', status: 200 },
  );

  s.on(
    'POST',
    '/transfers/:id/receive',
    (ctx) => {
      const t = findTransfer(ctx, 'dest');
      expect(t, 'IN_TRANSIT');
      const bin = s.receivingBin(t.destWarehouseId);
      for (const l of t.lines) s.receive(t.destWarehouseId, bin.id, l.productId, l.qty, 0, t.number, s.actor(ctx), 'TRANSFER_IN');
      t.status = 'COMPLETED';
      t.updatedAt = s.nowIso();
      s.log('transfer', 'success', `Transfer ${t.number} received`, `${t.destWarehouseName} · bin ${bin.code}`, t.destWarehouseId, s.actor(ctx));
      s.notify('success', 'Stock transfer completed', `${t.number} delivered to ${t.destWarehouseName}`, `/transfers/${t.id}`, { warehouseId: t.destWarehouseId, permission: 'transfers:view' });
      s.checkCapacity(t.destWarehouseId);
      return toTransfer(t);
    },
    { permission: 'transfers:create', status: 200 },
  );
}
