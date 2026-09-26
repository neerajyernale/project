import { Customer, PartnerStatus, Product, Supplier } from '@core/models';
import { ApiException, DbCustomer, DbProduct, DbSupplier, conflict, notFound } from '../mock-types';
import { Ctx, MockServer } from '../mock-server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;
const SKU_RE = /^[A-Z0-9-]{3,24}$/;
const PARTNER_STATUSES: PartnerStatus[] = ['ACTIVE', 'ON_HOLD', 'INACTIVE'];

export function registerCatalogRoutes(s: MockServer): void {
  const toProduct = (p: DbProduct, ctx: Ctx): Product => {
    const t = s.productTotals(p.id, s.warehouseFilter(ctx));
    return { ...p, onHand: t.onHand, available: t.available, stockStatus: s.aggregateStatus(p, s.warehouseFilter(ctx)) };
  };

  // ------------------------------------------------------------------ products

  s.on(
    'GET',
    '/products',
    (ctx) => {
      const q = ctx.query.get('q');
      const category = ctx.query.get('category');
      const status = ctx.query.get('status');
      const stockStatus = ctx.query.get('stockStatus');
      const rows = s.db.products
        .filter((p) => s.matchesQ(q, p.sku, p.name, p.brand, p.category))
        .filter((p) => !category || p.category === category)
        .filter((p) => s.inList(p.status, status))
        .map((p) => toProduct(p, ctx))
        .filter((p) => s.inList(p.stockStatus, stockStatus));
      return s.paginate(rows, ctx.query, 'sku,asc');
    },
    { permission: 'catalog:view' },
  );

  /** For line pickers in orders, inbound and transfers. */
  s.on('GET', '/products/options', (ctx) => {
    const q = ctx.query.get('q');
    return s.db.products
      .filter((p) => p.status === 'ACTIVE' && s.matchesQ(q, p.sku, p.name))
      .map((p) => ({ id: p.id, sku: p.sku, name: p.name, uom: p.uom }));
  });

  s.on('GET', '/products/categories', () => Array.from(new Set(s.db.products.map((p) => p.category))).sort());

  s.on('GET', '/products/:id', (ctx) => toProduct(s.product(ctx.params['id']), ctx), { permission: 'catalog:view' });

  const validateProduct = (ctx: Ctx, id?: string) => {
    const v = {
      sku: s.str(ctx.body['sku']).toUpperCase(),
      name: s.str(ctx.body['name']),
      category: s.str(ctx.body['category']),
      brand: s.str(ctx.body['brand']),
      uom: s.str(ctx.body['uom']) || 'Each',
      reorderLevel: s.num(ctx.body['reorderLevel']),
      maxStock: s.num(ctx.body['maxStock'] ?? 0),
      unitCost: s.num(ctx.body['unitCost']),
      weightKg: s.num(ctx.body['weightKg']),
    };
    s.validate([
      [SKU_RE.test(v.sku), 'sku', 'Use capital letters, digits or dashes, e.g. SKU-10200.'],
      [v.name.length >= 2, 'name', 'Enter the product name.'],
      [v.category.length >= 2, 'category', 'Enter a category.'],
      [Number.isInteger(v.reorderLevel) && v.reorderLevel >= 0, 'reorderLevel', 'Enter a whole number, 0 or more.'],
      [Number.isInteger(v.maxStock) && v.maxStock >= 0, 'maxStock', 'Enter a whole number, 0 or more.'],
      [v.maxStock === 0 || v.maxStock > v.reorderLevel, 'maxStock', 'Max stock must be above the reorder level.'],
      [v.unitCost >= 0, 'unitCost', 'Enter a cost of 0 or more.'],
      [v.weightKg >= 0, 'weightKg', 'Enter a weight of 0 or more.'],
    ]);
    if (s.db.products.some((p) => p.sku === v.sku && p.id !== id)) {
      throw new ApiException(422, 'Validation failed', 'SKU already exists.', [
        { field: 'sku', code: 'duplicate', message: 'Another product already uses this SKU.' },
      ]);
    }
    return v;
  };

  s.on(
    'POST',
    '/products',
    (ctx) => {
      const p: DbProduct = { id: s.nextId('prd'), ...validateProduct(ctx), status: 'ACTIVE', version: 1 };
      s.db.products.push(p);
      s.log('catalog', 'success', `Product ${p.sku} created`, p.name, null, s.actor(ctx));
      return toProduct(p, ctx);
    },
    { permission: 'catalog:create' },
  );

  s.on(
    'PUT',
    '/products/:id',
    (ctx) => {
      const p = s.product(ctx.params['id']);
      s.checkVersion(p.version, ctx.body);
      const v = validateProduct(ctx, p.id);
      if (v.sku !== p.sku && s.db.movements.some((m) => m.productId === p.id)) {
        throw conflict('The SKU cannot change once stock has moved. Create a new product instead.');
      }
      Object.assign(p, v, { version: p.version + 1 });
      s.log('catalog', 'info', `Product ${p.sku} updated`, p.name, null, s.actor(ctx));
      return toProduct(p, ctx);
    },
    { permission: 'catalog:edit' },
  );

  s.on(
    'POST',
    '/products/:id/discontinue',
    (ctx) => {
      const p = s.product(ctx.params['id']);
      const open = s.db.orders.some((o) => ['CREATED', 'ALLOCATED', 'PICKING'].includes(o.status) && o.lines.some((l) => l.productId === p.id));
      if (open) throw conflict('Open orders include this product. Complete or cancel them first.');
      p.status = 'DISCONTINUED';
      p.version++;
      s.log('catalog', 'warning', `Product ${p.sku} discontinued`, p.name, null, s.actor(ctx));
      return toProduct(p, ctx);
    },
    { permission: 'catalog:delete', status: 200 },
  );

  s.on(
    'POST',
    '/products/:id/reactivate',
    (ctx) => {
      const p = s.product(ctx.params['id']);
      p.status = 'ACTIVE';
      p.version++;
      return toProduct(p, ctx);
    },
    { permission: 'catalog:edit', status: 200 },
  );

  // ------------------------------------------------------------------ suppliers + customers

  const validatePartner = (ctx: Ctx) => {
    const v = {
      name: s.str(ctx.body['name']),
      email: s.str(ctx.body['email']).toLowerCase(),
      phone: s.str(ctx.body['phone']),
      city: s.str(ctx.body['city']),
      status: (s.str(ctx.body['status']) || 'ACTIVE') as PartnerStatus,
    };
    s.validate([
      [v.name.length >= 2, 'name', 'Enter the name.'],
      [EMAIL_RE.test(v.email), 'email', 'Enter a valid email address.'],
      [PHONE_RE.test(v.phone), 'phone', 'Enter a valid phone number.'],
      [v.city.length >= 2, 'city', 'Enter the city.'],
      [PARTNER_STATUSES.includes(v.status), 'status', 'Choose a status.'],
    ]);
    return v;
  };

  const toSupplier = (x: DbSupplier): Supplier => ({ ...x, inboundCount: s.db.inbounds.filter((i) => i.supplierId === x.id).length });

  s.on(
    'GET',
    '/suppliers',
    (ctx) => {
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const rows = s.db.suppliers
        .filter((x) => s.matchesQ(q, x.code, x.name, x.contact, x.email, x.city))
        .filter((x) => s.inList(x.status, status))
        .map(toSupplier);
      return s.paginate(rows, ctx.query, 'name,asc');
    },
    { permission: 'catalog:view' },
  );

  s.on('GET', '/suppliers/options', () =>
    s.db.suppliers.filter((x) => x.status === 'ACTIVE').map((x) => ({ id: x.id, code: x.code, name: x.name })),
  );

  s.on(
    'GET',
    '/suppliers/:id',
    (ctx) => {
      const x = s.db.suppliers.find((y) => y.id === ctx.params['id']);
      if (!x) throw notFound('Supplier');
      return toSupplier(x);
    },
    { permission: 'catalog:view' },
  );

  s.on(
    'POST',
    '/suppliers',
    (ctx) => {
      const v = validatePartner(ctx);
      const x: DbSupplier = {
        id: s.nextId('sup'),
        code: s.nextNumber('supplierNo', 'SUP', 32).replace(/-(\d+)$/, (_m, n: string) => `-${n.padStart(4, '0')}`),
        contact: s.str(ctx.body['contact']),
        ...v,
        version: 1,
      };
      s.validate([[x.contact.length >= 2, 'contact', 'Enter the contact person.']]);
      s.db.suppliers.push(x);
      s.log('catalog', 'success', `Supplier ${x.name} added`, x.code, null, s.actor(ctx));
      return toSupplier(x);
    },
    { permission: 'catalog:create' },
  );

  s.on(
    'PUT',
    '/suppliers/:id',
    (ctx) => {
      const x = s.db.suppliers.find((y) => y.id === ctx.params['id']);
      if (!x) throw notFound('Supplier');
      s.checkVersion(x.version, ctx.body);
      const contact = s.str(ctx.body['contact']);
      s.validate([[contact.length >= 2, 'contact', 'Enter the contact person.']]);
      Object.assign(x, validatePartner(ctx), { contact, version: x.version + 1 });
      return toSupplier(x);
    },
    { permission: 'catalog:edit' },
  );

  const toCustomer = (x: DbCustomer): Customer => {
    const orders = s.db.orders.filter((o) => o.customerId === x.id);
    const last = orders.map((o) => o.createdAt).sort().pop() ?? null;
    return { ...x, orderCount: orders.length, lastOrderAt: last };
  };

  s.on(
    'GET',
    '/customers',
    (ctx) => {
      const q = ctx.query.get('q');
      const status = ctx.query.get('status');
      const rows = s.db.customers
        .filter((x) => s.matchesQ(q, x.code, x.name, x.email, x.city))
        .filter((x) => s.inList(x.status, status))
        .map(toCustomer);
      return s.paginate(rows, ctx.query, 'name,asc');
    },
    { permission: 'catalog:view' },
  );

  s.on('GET', '/customers/options', () =>
    s.db.customers.filter((x) => x.status === 'ACTIVE').map((x) => ({ id: x.id, code: x.code, name: x.name, city: x.city })),
  );

  s.on(
    'GET',
    '/customers/:id',
    (ctx) => {
      const x = s.db.customers.find((y) => y.id === ctx.params['id']);
      if (!x) throw notFound('Customer');
      return toCustomer(x);
    },
    { permission: 'catalog:view' },
  );

  s.on(
    'POST',
    '/customers',
    (ctx) => {
      const x: DbCustomer = { id: s.nextId('cus'), code: s.nextNumber('customerNo', 'CUS', 1023), ...validatePartner(ctx), version: 1 };
      s.db.customers.push(x);
      s.log('catalog', 'success', `Customer ${x.name} added`, x.code, null, s.actor(ctx));
      return toCustomer(x);
    },
    { permission: 'catalog:create' },
  );

  s.on(
    'PUT',
    '/customers/:id',
    (ctx) => {
      const x = s.db.customers.find((y) => y.id === ctx.params['id']);
      if (!x) throw notFound('Customer');
      s.checkVersion(x.version, ctx.body);
      Object.assign(x, validatePartner(ctx), { version: x.version + 1 });
      return toCustomer(x);
    },
    { permission: 'catalog:edit' },
  );
}
