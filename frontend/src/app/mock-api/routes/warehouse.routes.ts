import { Bin, Warehouse, ZONE_TYPES, Zone, ZoneType } from '@core/models';
import { ApiException, DbBin, DbWarehouse, DbZone, conflict, notFound } from '../mock-types';
import { Ctx, MockServer } from '../mock-server';

const CODE_RE = /^[A-Z0-9-]{3,20}$/;

export function registerWarehouseRoutes(s: MockServer): void {
  const usedByBin = (): Map<string, { used: number; skus: Set<string> }> => {
    const m = new Map<string, { used: number; skus: Set<string> }>();
    for (const b of s.db.balances) {
      if (b.onHand <= 0) continue;
      const e = m.get(b.binId) ?? { used: 0, skus: new Set<string>() };
      e.used += b.onHand;
      e.skus.add(b.productId);
      m.set(b.binId, e);
    }
    return m;
  };

  const pct = (used: number, cap: number) => (cap > 0 ? Math.round((used / cap) * 100) : 0);

  const toBin = (b: DbBin, usage = usedByBin()): Bin => {
    const zone = s.db.zones.find((z) => z.id === b.zoneId);
    const u = usage.get(b.id);
    const used = u?.used ?? 0;
    return {
      ...b,
      zoneName: zone?.name ?? '—',
      zoneType: zone?.type ?? 'STORAGE',
      usedUnits: used,
      skuCount: u?.skus.size ?? 0,
      status: b.blocked ? 'BLOCKED' : used === 0 ? 'EMPTY' : used >= b.capacityUnits ? 'FULL' : 'PARTIAL',
    };
  };

  const toZone = (z: DbZone, usage = usedByBin()): Zone => {
    const bins = s.db.bins.filter((b) => b.zoneId === z.id);
    const capacityUnits = bins.reduce((acc, b) => acc + b.capacityUnits, 0);
    const usedUnits = bins.reduce((acc, b) => acc + (usage.get(b.id)?.used ?? 0), 0);
    return { ...z, binCount: bins.length, capacityUnits, usedUnits, utilization: pct(usedUnits, capacityUnits) };
  };

  const toWarehouse = (w: DbWarehouse, usage = usedByBin()): Warehouse => {
    const bins = s.db.bins.filter((b) => b.warehouseId === w.id);
    const capacityUnits = bins.reduce((acc, b) => acc + b.capacityUnits, 0);
    const usedUnits = bins.reduce((acc, b) => acc + (usage.get(b.id)?.used ?? 0), 0);
    return {
      ...w,
      zoneCount: s.db.zones.filter((z) => z.warehouseId === w.id).length,
      binCount: bins.length,
      capacityUnits,
      usedUnits,
      utilization: pct(usedUnits, capacityUnits),
    };
  };

  const find = (ctx: Ctx): DbWarehouse => {
    const w = s.warehouse(ctx.params['id']);
    s.assertWarehouseAccess(ctx, w.id);
    return w;
  };

  const validateWarehouse = (ctx: Ctx, id?: string) => {
    const v = {
      code: s.str(ctx.body['code']).toUpperCase(),
      name: s.str(ctx.body['name']),
      city: s.str(ctx.body['city']),
      address: s.str(ctx.body['address']),
      manager: s.str(ctx.body['manager']),
      capacityM2: s.num(ctx.body['capacityM2']),
      timezone: s.str(ctx.body['timezone']) || 'Asia/Kolkata',
    };
    s.validate([
      [CODE_RE.test(v.code), 'code', 'Use 3–20 capital letters, digits or dashes, e.g. WH-MUM-002.'],
      [v.name.length >= 3, 'name', 'Enter the warehouse name.'],
      [v.city.length >= 2, 'city', 'Enter the city.'],
      [v.manager.length >= 2, 'manager', 'Enter the manager.'],
      [Number.isInteger(v.capacityM2) && v.capacityM2 > 0, 'capacityM2', 'Enter the floor area in m² (a whole number).'],
    ]);
    if (s.db.warehouses.some((w) => w.code === v.code && w.id !== id)) {
      throw new ApiException(422, 'Validation failed', 'Code already in use.', [
        { field: 'code', code: 'duplicate', message: 'Another warehouse already uses this code.' },
      ]);
    }
    return v;
  };

  s.on(
    'GET',
    '/warehouses',
    (ctx) => {
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const city = ctx.query.get('city');
      const allowed = s.allowedWarehouses(ctx.user);
      const usage = usedByBin();
      const rows = s.db.warehouses
        .filter((w) => !allowed || allowed.has(w.id))
        .filter((w) => s.matchesQ(q, w.code, w.name, w.city, w.manager))
        .filter((w) => s.inList(w.status, status))
        .filter((w) => !city || w.city === city)
        .map((w) => toWarehouse(w, usage));
      return s.paginate(rows, ctx.query, 'code,asc');
    },
    { permission: 'warehouses:view' },
  );

  /** Minimal list for pickers and context switchers — every signed-in user may call it. */
  s.on('GET', '/warehouses/options', (ctx) => {
    const allowed = s.allowedWarehouses(ctx.user);
    return s.db.warehouses
      .filter((w) => !allowed || allowed.has(w.id))
      .map((w) => ({ id: w.id, code: w.code, name: w.name, city: w.city, status: w.status }));
  });

  s.on('GET', '/warehouses/:id', (ctx) => toWarehouse(find(ctx)), { permission: 'warehouses:view' });

  s.on(
    'POST',
    '/warehouses',
    (ctx) => {
      const v = validateWarehouse(ctx);
      const w: DbWarehouse = { id: s.nextId('wh'), ...v, status: 'ACTIVE', version: 1 };
      s.db.warehouses.push(w);
      // Every new facility starts with a receiving zone so inbound works on day one.
      const zone: DbZone = { id: s.nextId('zone'), warehouseId: w.id, code: 'RCV-A', name: 'Receiving', type: 'RECEIVING', areaM2: 0, status: 'ACTIVE' };
      s.db.zones.push(zone);
      s.db.bins.push({ id: s.nextId('bin'), warehouseId: w.id, zoneId: zone.id, code: 'RCV-A-001', capacityUnits: 2000, blocked: false });
      s.log('warehouse', 'success', `Warehouse ${w.code} created`, w.name, w.id, s.actor(ctx));
      return toWarehouse(w);
    },
    { permission: 'warehouses:create' },
  );

  s.on(
    'PUT',
    '/warehouses/:id',
    (ctx) => {
      const w = find(ctx);
      s.checkVersion(w.version, ctx.body);
      Object.assign(w, validateWarehouse(ctx, w.id), { version: w.version + 1 });
      s.log('warehouse', 'info', `Warehouse ${w.code} updated`, w.name, w.id, s.actor(ctx));
      return toWarehouse(w);
    },
    { permission: 'warehouses:edit' },
  );

  const setStatus = (ctx: Ctx, status: DbWarehouse['status']) => {
    const w = find(ctx);
    if (status !== 'ACTIVE') {
      const open = s.db.orders.some((o) => o.warehouseId === w.id && ['ALLOCATED', 'PICKING', 'PICKED', 'PACKED'].includes(o.status));
      if (open && status === 'INACTIVE') throw conflict('This warehouse has orders in progress. Finish or cancel them first.');
    }
    w.status = status;
    w.version++;
    s.log('warehouse', status === 'ACTIVE' ? 'success' : 'warning', `Warehouse ${w.code} set to ${status.toLowerCase()}`, w.name, w.id, s.actor(ctx));
    return toWarehouse(w);
  };
  s.on('POST', '/warehouses/:id/activate', (ctx) => setStatus(ctx, 'ACTIVE'), { permission: 'warehouses:edit', status: 200 });
  s.on('POST', '/warehouses/:id/deactivate', (ctx) => setStatus(ctx, 'INACTIVE'), { permission: 'warehouses:edit', status: 200 });
  s.on('POST', '/warehouses/:id/maintenance', (ctx) => setStatus(ctx, 'MAINTENANCE'), { permission: 'warehouses:edit', status: 200 });

  // ------------------------------------------------------------------ zones

  s.on(
    'GET',
    '/warehouses/:id/zones',
    (ctx) => {
      const w = find(ctx);
      const usage = usedByBin();
      return s.db.zones.filter((z) => z.warehouseId === w.id).map((z) => toZone(z, usage));
    },
    { permission: 'warehouses:view' },
  );

  const validateZone = (ctx: Ctx, warehouseId: string, id?: string) => {
    const v = {
      code: s.str(ctx.body['code']).toUpperCase(),
      name: s.str(ctx.body['name']),
      type: s.str(ctx.body['type']) as ZoneType,
      areaM2: s.num(ctx.body['areaM2']),
    };
    s.validate([
      [CODE_RE.test(v.code), 'code', 'Use 3–20 capital letters, digits or dashes.'],
      [v.name.length >= 2, 'name', 'Enter the zone name.'],
      [ZONE_TYPES.includes(v.type), 'type', 'Choose a zone type.'],
      [Number.isInteger(v.areaM2) && v.areaM2 >= 0, 'areaM2', 'Enter the area in m².'],
      [!s.db.zones.some((z) => z.warehouseId === warehouseId && z.code === v.code && z.id !== id), 'code', 'This code is already used in this warehouse.'],
    ]);
    return v;
  };

  s.on(
    'POST',
    '/warehouses/:id/zones',
    (ctx) => {
      const w = find(ctx);
      const zone: DbZone = { id: s.nextId('zone'), warehouseId: w.id, ...validateZone(ctx, w.id), status: 'ACTIVE' };
      s.db.zones.push(zone);
      s.log('warehouse', 'info', `Zone ${zone.code} added`, w.name, w.id, s.actor(ctx));
      return toZone(zone);
    },
    { permission: 'warehouses:edit' },
  );

  s.on(
    'PUT',
    '/warehouses/:id/zones/:zoneId',
    (ctx) => {
      const w = find(ctx);
      const zone = s.db.zones.find((z) => z.id === ctx.params['zoneId'] && z.warehouseId === w.id);
      if (!zone) throw notFound('Zone');
      const v = validateZone(ctx, w.id, zone.id);
      const status = ctx.body['status'] === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
      if (status === 'INACTIVE') {
        const binIds = new Set(s.db.bins.filter((b) => b.zoneId === zone.id).map((b) => b.id));
        if (s.db.balances.some((b) => binIds.has(b.binId) && b.onHand > 0)) {
          throw conflict('Move the stock out of this zone before deactivating it.');
        }
      }
      Object.assign(zone, v, { status });
      return toZone(zone);
    },
    { permission: 'warehouses:edit' },
  );

  // ------------------------------------------------------------------ bins

  s.on(
    'GET',
    '/warehouses/:id/bins',
    (ctx) => {
      const w = find(ctx);
      const zoneId = ctx.query.get('zoneId');
      const status = ctx.query.get('status');
      const q = ctx.query.get('q');
      const usage = usedByBin();
      const rows = s.db.bins
        .filter((b) => b.warehouseId === w.id)
        .filter((b) => !zoneId || b.zoneId === zoneId)
        .filter((b) => s.matchesQ(q, b.code))
        .map((b) => toBin(b, usage))
        .filter((b) => s.inList(b.status, status));
      return s.paginate(rows, ctx.query, 'code,asc');
    },
    { permission: 'warehouses:view' },
  );

  s.on(
    'POST',
    '/warehouses/:id/bins',
    (ctx) => {
      const w = find(ctx);
      const zoneId = s.str(ctx.body['zoneId']);
      const code = s.str(ctx.body['code']).toUpperCase();
      const capacityUnits = s.num(ctx.body['capacityUnits']);
      s.validate([
        [s.db.zones.some((z) => z.id === zoneId && z.warehouseId === w.id), 'zoneId', 'Choose a zone.'],
        [CODE_RE.test(code), 'code', 'Use 3–20 capital letters, digits or dashes, e.g. STR-B-009.'],
        [Number.isInteger(capacityUnits) && capacityUnits > 0, 'capacityUnits', 'Enter the capacity in units.'],
        [!s.db.bins.some((b) => b.warehouseId === w.id && b.code === code), 'code', 'This bin code already exists here.'],
      ]);
      const bin: DbBin = { id: s.nextId('bin'), warehouseId: w.id, zoneId, code, capacityUnits, blocked: false };
      s.db.bins.push(bin);
      return toBin(bin);
    },
    { permission: 'warehouses:edit' },
  );

  for (const [action, blocked] of [['block', true], ['unblock', false]] as const) {
    s.on(
      'POST',
      `/bins/:id/${action}`,
      (ctx) => {
        const bin = s.bin(ctx.params['id']);
        s.assertWarehouseAccess(ctx, bin.warehouseId);
        if (blocked && s.db.balances.some((b) => b.binId === bin.id && b.reserved > 0)) {
          throw conflict('This bin holds stock reserved for orders. Pick or release it first.');
        }
        bin.blocked = blocked;
        s.log('warehouse', blocked ? 'warning' : 'info', `Bin ${bin.code} ${action}ed`, s.warehouse(bin.warehouseId).name, bin.warehouseId, s.actor(ctx));
        return toBin(bin);
      },
      { permission: 'warehouses:edit', status: 200 },
    );
  }
}
