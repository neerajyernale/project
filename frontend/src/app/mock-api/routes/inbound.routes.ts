import { Inbound, InboundLine } from '@core/models';
import { conflict, notFound } from '../mock-types';
import { Ctx, MockServer } from '../mock-server';

export function registerInboundRoutes(s: MockServer): void {
  const find = (ctx: Ctx): Inbound => {
    const x = s.db.inbounds.find((i) => i.id === ctx.params['id']);
    if (!x) throw notFound('Inbound shipment');
    s.assertWarehouseAccess(ctx, x.warehouseId);
    return x;
  };

  const expect = (x: Inbound, ...states: Inbound['status'][]) => {
    if (!states.includes(x.status)) {
      throw conflict(`${x.number} is ${x.status.replace('_', ' ').toLowerCase()}; this action is not allowed now.`);
    }
  };

  const recompute = (x: Inbound) => {
    x.totalExpected = x.lines.reduce((a, l) => a + l.expectedQty, 0);
    x.totalReceived = x.lines.reduce((a, l) => a + l.receivedQty, 0);
    x.updatedAt = s.nowIso();
  };

  s.on(
    'GET',
    '/inbound',
    (ctx) => {
      const inScope = s.warehouseFilter(ctx);
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const supplierId = ctx.query.get('supplierId');
      const rows = s.db.inbounds
        .filter((x) => inScope(x.warehouseId))
        .filter((x) => s.inList(x.status, status))
        .filter((x) => !supplierId || x.supplierId === supplierId)
        .filter((x) => s.matchesQ(q, x.number, x.poReference, x.supplierName, x.warehouseName));
      return s.paginate(rows, ctx.query, 'expectedAt,desc');
    },
    { permission: 'inbound:view' },
  );

  s.on('GET', '/inbound/:id', (ctx) => find(ctx), { permission: 'inbound:view' });

  s.on(
    'POST',
    '/inbound',
    (ctx) => {
      const supplierId = s.str(ctx.body['supplierId']);
      const warehouseId = s.str(ctx.body['warehouseId']);
      const expectedAt = s.str(ctx.body['expectedAt']);
      const raw = Array.isArray(ctx.body['lines']) ? (ctx.body['lines'] as { productId: string; expectedQty: number }[]) : [];
      s.validate([
        [s.db.suppliers.some((x) => x.id === supplierId && x.status === 'ACTIVE'), 'supplierId', 'Choose an active supplier.'],
        [s.db.warehouses.some((w) => w.id === warehouseId && w.status === 'ACTIVE'), 'warehouseId', 'Choose an active warehouse.'],
        [!Number.isNaN(Date.parse(expectedAt)), 'expectedAt', 'Enter the expected arrival.'],
        [raw.length > 0, 'lines', 'Add at least one product.'],
        [raw.every((l) => Number.isInteger(Number(l.expectedQty)) && Number(l.expectedQty) > 0), 'lines', 'Quantities must be whole numbers above 0.'],
        [new Set(raw.map((l) => l.productId)).size === raw.length, 'lines', 'Each product may appear once.'],
      ]);
      s.assertWarehouseAccess(ctx, warehouseId);
      const lines: InboundLine[] = raw.map((l) => {
        const p = s.product(l.productId);
        return { productId: p.id, sku: p.sku, productName: p.name, expectedQty: Number(l.expectedQty), receivedQty: 0, damagedQty: 0, putawayBinCode: null };
      });
      const x: Inbound = {
        id: s.nextId('asn'),
        number: s.str(ctx.body['number']) || s.nextNumber('asnNo', 'ASN', 2052),
        poReference: s.str(ctx.body['poReference']),
        supplierId,
        supplierName: s.db.suppliers.find((y) => y.id === supplierId)?.name ?? '',
        warehouseId,
        warehouseName: s.warehouse(warehouseId).name,
        expectedAt: new Date(expectedAt).toISOString(),
        lines,
        totalExpected: 0,
        totalReceived: 0,
        status: 'EXPECTED',
        discrepancy: false,
        receivingBinCode: null,
        createdAt: s.nowIso(),
        updatedAt: s.nowIso(),
      };
      recompute(x);
      s.db.inbounds.push(x);
      s.log('inbound', 'info', `Inbound ${x.number} scheduled`, `${x.supplierName} · ${x.totalExpected} units`, warehouseId, s.actor(ctx));
      s.notify('info', 'Inbound shipment scheduled', `${x.number} expected ${new Date(x.expectedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`, `/inbound/${x.id}`, 'inboundReminder');
      return x;
    },
    { permission: 'inbound:create' },
  );

  s.on(
    'POST',
    '/inbound/:id/start',
    (ctx) => {
      const x = find(ctx);
      expect(x, 'EXPECTED');
      x.status = 'RECEIVING';
      x.receivingBinCode = s.receivingBin(x.warehouseId).code;
      x.updatedAt = s.nowIso();
      s.log('inbound', 'info', `Receiving started · ${x.number}`, `Dock bin ${x.receivingBinCode}`, x.warehouseId, s.actor(ctx));
      return x;
    },
    { permission: 'inbound:edit', status: 200 },
  );

  s.on(
    'POST',
    '/inbound/:id/receive',
    (ctx) => {
      const x = find(ctx);
      expect(x, 'RECEIVING');
      const raw = Array.isArray(ctx.body['lines'])
        ? (ctx.body['lines'] as { productId: string; receivedQty: number; damagedQty: number }[])
        : [];
      s.validate([
        [raw.length === x.lines.length && x.lines.every((l) => raw.some((r) => r.productId === l.productId)), 'lines', 'Enter a count for every line.'],
        [raw.every((r) => Number.isInteger(Number(r.receivedQty)) && Number(r.receivedQty) >= 0), 'lines', 'Received must be a whole number, 0 or more.'],
        [raw.every((r) => Number.isInteger(Number(r.damagedQty)) && Number(r.damagedQty) >= 0 && Number(r.damagedQty) <= Number(r.receivedQty)), 'lines', 'Damaged cannot exceed received.'],
        [raw.some((r) => Number(r.receivedQty) > 0), 'lines', 'Nothing was received. Cancel the shipment instead.'],
      ]);
      const bin = s.db.bins.find((b) => b.warehouseId === x.warehouseId && b.code === x.receivingBinCode) ?? s.receivingBin(x.warehouseId);
      for (const l of x.lines) {
        const r = raw.find((y) => y.productId === l.productId);
        if (!r) continue;
        l.receivedQty = Number(r.receivedQty);
        l.damagedQty = Number(r.damagedQty);
        if (l.receivedQty > 0) s.receive(x.warehouseId, bin.id, l.productId, l.receivedQty, l.damagedQty, x.number, s.actor(ctx));
      }
      x.discrepancy = x.lines.some((l) => l.receivedQty !== l.expectedQty || l.damagedQty > 0);
      x.status = 'PUTAWAY_PENDING';
      recompute(x);
      s.log('inbound', x.discrepancy ? 'warning' : 'success', `Inbound ${x.number} received`, `${x.totalReceived} of ${x.totalExpected} units${x.discrepancy ? ' · discrepancy' : ''}`, x.warehouseId, s.actor(ctx));
      if (x.discrepancy) s.notify('warning', 'Receiving discrepancy', `${x.number}: ${x.totalReceived} of ${x.totalExpected} units received`, `/inbound/${x.id}`);
      return x;
    },
    { permission: 'inbound:edit', status: 200 },
  );

  s.on(
    'POST',
    '/inbound/:id/putaway',
    (ctx) => {
      const x = find(ctx);
      expect(x, 'PUTAWAY_PENDING');
      const raw = Array.isArray(ctx.body['lines']) ? (ctx.body['lines'] as { productId: string; binId: string }[]) : [];
      const toMove = x.lines.filter((l) => l.receivedQty - l.damagedQty > 0);
      s.validate([[toMove.every((l) => raw.some((r) => r.productId === l.productId && !!r.binId)), 'lines', 'Choose a bin for every line.']]);
      const from = s.db.bins.find((b) => b.warehouseId === x.warehouseId && b.code === x.receivingBinCode);
      if (!from) throw conflict('The receiving bin for this shipment no longer exists.');
      for (const l of toMove) {
        const target = s.bin(raw.find((r) => r.productId === l.productId)?.binId ?? '');
        if (target.warehouseId !== x.warehouseId || target.blocked) throw conflict(`Bin ${target.code} cannot take stock.`);
        const bal = s.balanceFor(x.warehouseId, from.id, l.productId);
        s.moveStock(bal, target.id, l.receivedQty - l.damagedQty, x.number, s.actor(ctx));
        l.putawayBinCode = target.code;
      }
      x.status = 'COMPLETED';
      recompute(x);
      s.log('inbound', 'success', `Putaway complete · ${x.number}`, `${toMove.length} lines stored`, x.warehouseId, s.actor(ctx));
      return x;
    },
    { permission: 'inbound:edit', status: 200 },
  );

  s.on(
    'POST',
    '/inbound/:id/cancel',
    (ctx) => {
      const x = find(ctx);
      expect(x, 'EXPECTED', 'RECEIVING');
      x.status = 'CANCELLED';
      x.updatedAt = s.nowIso();
      s.log('inbound', 'danger', `Inbound ${x.number} cancelled`, x.supplierName, x.warehouseId, s.actor(ctx));
      return x;
    },
    { permission: 'inbound:edit', status: 200 },
  );
}
