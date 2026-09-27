/*
 * Development seed, converted from the prototype's data.ts (MIGRATION_PLAN §4).
 * Master data is inserted directly; all history (orders, picks, receipts, transfers) is
 * replayed through the API at past timestamps, so the ledger, reservations and balances
 * are consistent by construction. Prototype inconsistencies are fixed on the way:
 * ORD-10432 is cancelled with no shipment, and inbound shipments use ASN-* numbers.
 */
import { ALL_PERMISSIONS, Settings, ZoneType } from '@wms/core';
import { Db, DbBin, DbProduct, DbRole, DbUser, DbWarehouse, DbZone } from './mock-types';
import { MockServer } from './mock-server';

export const SCHEMA_VERSION = 8;
export const DEMO_PASSWORD = 'Wms360-Demo!';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ------------------------------------------------------------------ master data

const WAREHOUSES: (DbWarehouse & { binFactor: number; areas: number[] })[] = [
  { id: 'wh-mum', code: 'WH-MUM-001', name: 'Mumbai Central Warehouse', city: 'Mumbai', address: 'Plot 14, Bhiwandi Logistics Park, Thane 421302', manager: 'Rajesh Kumar', capacityM2: 50000, timezone: 'Asia/Kolkata', status: 'ACTIVE', version: 1, binFactor: 1, areas: [4200, 18000, 6500, 3800, 4500, 1800] },
  { id: 'wh-pun', code: 'WH-PUN-001', name: 'Pune Distribution Center', city: 'Pune', address: 'Gat 212, Chakan MIDC Phase II, Pune 410501', manager: 'Amit Sharma', capacityM2: 35000, timezone: 'Asia/Kolkata', status: 'ACTIVE', version: 1, binFactor: 0.72, areas: [2800, 12000, 4500, 2600, 3100, 1200] },
  { id: 'wh-hyd', code: 'WH-HYD-001', name: 'Hyderabad Warehouse', city: 'Hyderabad', address: 'Survey 88, Shamshabad Industrial Area, Hyderabad 501218', manager: 'Suresh Rao', capacityM2: 40000, timezone: 'Asia/Kolkata', status: 'ACTIVE', version: 1, binFactor: 1, areas: [3200, 14000, 5200, 3000, 3600, 1500] },
  { id: 'wh-del', code: 'WH-DEL-001', name: 'Delhi North Hub', city: 'New Delhi', address: 'Khasra 45, Alipur Road, Delhi 110036', manager: 'Anil Gupta', capacityM2: 45000, timezone: 'Asia/Kolkata', status: 'ACTIVE', version: 1, binFactor: 0.8, areas: [3500, 16000, 5800, 3200, 4000, 1600] },
  { id: 'wh-blr', code: 'WH-BLR-001', name: 'Bengaluru South Depot', city: 'Bengaluru', address: 'No. 7, Jigani Industrial Area, Anekal 562106', manager: 'Deepak Reddy', capacityM2: 28000, timezone: 'Asia/Kolkata', status: 'ACTIVE', version: 1, binFactor: 0.78, areas: [2200, 10000, 3800, 2200, 2600, 1000] },
];

const ZONES: { code: string; name: string; type: ZoneType; bins: number; binCapacity: number }[] = [
  { code: 'RCV-A', name: 'Receiving', type: 'RECEIVING', bins: 3, binCapacity: 1500 },
  { code: 'STR-B', name: 'Storage', type: 'STORAGE', bins: 8, binCapacity: 2500 },
  { code: 'PCK-C', name: 'Picking', type: 'PICKING', bins: 6, binCapacity: 800 },
  { code: 'PKG-D', name: 'Packing', type: 'PACKING', bins: 2, binCapacity: 400 },
  { code: 'DPT-E', name: 'Dispatch', type: 'DISPATCH', bins: 2, binCapacity: 800 },
  { code: 'RET-F', name: 'Returns', type: 'RETURNS', bins: 2, binCapacity: 500 },
];

const PRODUCTS: DbProduct[] = [
  ['SKU-10001', 'Wireless Keyboard', 'Electronics', 'Logitech', 'Each', 500, 6000, 1450, 0.6],
  ['SKU-10045', 'Wireless Barcode Scanner', 'Scanning', 'Zebra', 'Each', 500, 6000, 8900, 0.4],
  ['SKU-10078', 'Thermal Label Roll 4×6', 'Packaging', 'Avery', 'Roll', 300, 4000, 320, 0.8],
  ['SKU-10092', 'Handheld RFID Reader', 'Scanning', 'Honeywell', 'Each', 150, 1500, 24500, 0.5],
  ['SKU-10112', 'Heavy Duty Storage Bin', 'Storage', 'Nilkamal', 'Each', 400, 5000, 780, 2.2],
  ['SKU-10134', 'USB-C Docking Station', 'Electronics', 'Anker', 'Each', 120, 1500, 6200, 0.7],
  ['SKU-10056', 'Pallet Wrap Film 500mm', 'Packaging', 'Rajapack', 'Roll', 800, 9000, 540, 2.5],
  ['SKU-10067', 'Forklift Battery 24V', 'Equipment', 'Exide', 'Each', 50, 2000, 38000, 45],
  ['SKU-10150', 'Packing Tape 48mm', 'Packaging', '3M', 'Roll', 600, 8000, 95, 0.3],
  ['SKU-10163', 'Corrugated Box Large', 'Packaging', 'Rajapack', 'Each', 1000, 12000, 48, 0.9],
  ['SKU-10171', 'Safety Gloves (Pair)', 'Safety', 'Karam', 'Pair', 300, 5000, 180, 0.2],
  ['SKU-10188', 'Label Printer ZD421', 'Scanning', 'Zebra', 'Each', 40, 600, 32500, 2.8],
].map(([sku, name, category, brand, uom, reorderLevel, maxStock, unitCost, weightKg]) => ({
  id: `prd-${String(sku).slice(4)}`,
  sku: sku as string,
  name: name as string,
  category: category as string,
  brand: brand as string,
  uom: uom as string,
  reorderLevel: reorderLevel as number,
  maxStock: maxStock as number,
  unitCost: unitCost as number,
  weightKg: weightKg as number,
  status: 'ACTIVE',
  version: 1,
}));

/** Opening stock: product id → [MUM, PUN, HYD, DEL, BLR]. */
const OPENING: Record<string, number[]> = {
  'prd-10001': [3400, 1600, 1900, 900, 2400],
  'prd-10045': [2700, 900, 1200, 700, 1500],
  'prd-10078': [260, 1500, 800, 600, 900],
  'prd-10092': [150, 110, 420, 200, 300],
  'prd-10112': [2050, 1200, 2600, 1100, 2200],
  'prd-10134': [60, 40, 150, 260, 140],
  'prd-10056': [3700, 2100, 2600, 1500, 3000],
  'prd-10067': [0, 0, 8420, 0, 600],
  'prd-10150': [3200, 2400, 2600, 1200, 2800],
  'prd-10163': [5200, 3600, 4200, 2400, 4800],
  'prd-10171': [1400, 900, 1100, 700, 1300],
  'prd-10188': [180, 60, 90, 50, 120],
};

const SUPPLIERS = [
  { id: 'sup-18', code: 'SUP-0018', name: 'TechSource India Pvt Ltd', contact: 'Vikram Mehta', email: 'vikram@techsource.in', phone: '+91 22 4582 1190', city: 'Mumbai' },
  { id: 'sup-24', code: 'SUP-0024', name: 'PackRight Supplies', contact: 'Neha Kapoor', email: 'neha@packright.in', phone: '+91 20 4102 8831', city: 'Pune' },
  { id: 'sup-09', code: 'SUP-0009', name: 'Global Electronics', contact: 'Arjun Nair', email: 'arjun@globalel.in', phone: '+91 80 2218 0044', city: 'Bengaluru' },
  { id: 'sup-31', code: 'SUP-0031', name: 'Industrial Supply Co', contact: 'Ramesh Patil', email: 'ramesh@indsupply.in', phone: '+91 11 4567 8900', city: 'New Delhi' },
  { id: 'sup-14', code: 'SUP-0014', name: 'Nilkamal Logistics', contact: 'Sonia Dutt', email: 'sonia@nilkamal.in', phone: '+91 22 6789 2345', city: 'Mumbai' },
];

const CUSTOMERS = [
  { id: 'cus-1001', code: 'CUS-1001', name: 'Reliance Retail Ltd', email: 'procurement@relianceretail.in', phone: '+91 22 3552 8800', city: 'Mumbai' },
  { id: 'cus-1008', code: 'CUS-1008', name: 'Flipkart Wholesale', email: 'warehouse@flipkart.com', phone: '+91 80 4567 1234', city: 'Bengaluru' },
  { id: 'cus-1014', code: 'CUS-1014', name: 'Croma Retail', email: 'supply@croma.com', phone: '+91 22 6749 8000', city: 'Mumbai' },
  { id: 'cus-1022', code: 'CUS-1022', name: 'Metro Brands Ltd', email: 'logistics@metrobrands.in', phone: '+91 22 3456 7800', city: 'Mumbai' },
  { id: 'cus-1005', code: 'CUS-1005', name: 'Spencers Retail', email: 'ops@spencers.in', phone: '+91 33 2244 6688', city: 'Kolkata' },
];

const views = ALL_PERMISSIONS.filter((p) => p.endsWith(':view'));
const allOf = (...modules: string[]) => ALL_PERMISSIONS.filter((p) => modules.includes(p.split(':')[0]));

const ROLES: DbRole[] = [
  { id: 'role-admin', name: 'Admin', description: 'Full access, including users, roles and security settings.', system: true, permissions: [...ALL_PERMISSIONS] },
  {
    id: 'role-wm',
    name: 'Warehouse Manager',
    description: 'Runs one or more facilities end to end. Cannot manage users or security.',
    system: true,
    permissions: ALL_PERMISSIONS.filter((p) => !['users:create', 'users:edit', 'users:delete', 'settings:edit'].includes(p)),
  },
  {
    id: 'role-sup',
    name: 'Supervisor',
    description: 'Runs the floor: orders, picking, packing, shipping and receiving.',
    system: true,
    permissions: [
      'dashboard:view', 'warehouses:view', 'inventory:view', 'inventory:edit', 'transfers:view', 'transfers:create', 'catalog:view', 'reports:view',
      ...allOf('inbound', 'orders', 'picking', 'packing', 'shipping'),
    ],
  },
  { id: 'role-picker', name: 'Picker', description: 'Works pick tasks.', system: true, permissions: ['dashboard:view', 'inventory:view', 'orders:view', 'picking:view', 'picking:edit'] },
  { id: 'role-packer', name: 'Packer', description: 'Packs and dispatches picked orders.', system: true, permissions: ['dashboard:view', 'orders:view', 'packing:view', 'packing:edit', 'shipping:view', 'shipping:edit'] },
  {
    id: 'role-inv',
    name: 'Inventory Manager',
    description: 'Owns stock accuracy, transfers, the catalog and receiving.',
    system: true,
    permissions: ['dashboard:view', 'warehouses:view', 'orders:view', 'reports:view', ...allOf('inventory', 'transfers', 'catalog', 'inbound')],
  },
  { id: 'role-seller', name: 'Seller', description: 'Creates and tracks customer orders.', system: true, permissions: ['dashboard:view', 'catalog:view', 'inventory:view', 'orders:view', 'orders:create', 'orders:edit', 'reports:view'] },
  { id: 'role-viewer', name: 'Viewer', description: 'Read-only access to operations.', system: true, permissions: views.filter((p) => !['users:view', 'settings:view'].includes(p)) },
];

const USERS: DbUser[] = [
  ['usr-admin', 'Admin User', 'admin@wms360.com', 'role-admin', []],
  ['usr-rajesh', 'Rajesh Kumar', 'rajesh.kumar@wms360.com', 'role-wm', ['wh-mum']],
  ['usr-amit', 'Amit Sharma', 'amit.sharma@wms360.com', 'role-sup', ['wh-mum', 'wh-pun']],
  ['usr-priya', 'Priya Menon', 'priya.menon@wms360.com', 'role-inv', ['wh-pun']],
  ['usr-suresh', 'Suresh Rao', 'suresh.rao@wms360.com', 'role-wm', ['wh-hyd']],
  ['usr-sneha', 'Sneha Iyer', 'sneha.iyer@wms360.com', 'role-packer', ['wh-mum']],
  ['usr-karthik', 'Karthik N', 'karthik.n@wms360.com', 'role-packer', ['wh-mum', 'wh-pun']],
  ['usr-rohit', 'Rohit Verma', 'rohit.verma@wms360.com', 'role-picker', ['wh-mum']],
  ['usr-anil', 'Anil Gupta', 'anil.gupta@wms360.com', 'role-wm', ['wh-del']],
  ['usr-deepak', 'Deepak Reddy', 'deepak.reddy@wms360.com', 'role-wm', ['wh-blr']],
  ['usr-meera', 'Meera Joshi', 'meera.joshi@wms360.com', 'role-seller', []],
  ['usr-vivek', 'Vivek Nair', 'vivek.nair@wms360.com', 'role-viewer', []],
].map(([id, name, email, roleId, warehouseIds]) => ({
  id: id as string,
  name: name as string,
  email: email as string,
  roleId: roleId as string,
  warehouseIds: warehouseIds as string[],
  status: 'ACTIVE',
  lastLoginAt: null,
  password: DEMO_PASSWORD,
  version: 1,
}));

const SETTINGS: Settings = {
  general: { companyName: 'WMS360 Logistics Pvt Ltd', currency: 'INR', timezone: 'Asia/Kolkata', dateFormat: 'DD MMM YYYY' },
  operations: { defaultWarehouseId: 'wh-mum', autoAssignPickers: true, capacityAlertPct: 80, lowStockBufferPct: 20 },
  notifications: { lowStock: true, capacity: true, orderDelay: true, inboundReminder: false, dailySummary: true },
  // Same as the backend seed: two-factor optional, no allowlist (the real API enforces both).
  security: { twoFactor: false, sessionTimeoutMin: 30, passwordMinLength: 12, ipAllowlist: '' },
  version: 1,
};

export function emptyDb(): Db {
  return {
    schema: SCHEMA_VERSION,
    seq: {},
    warehouses: [],
    zones: [],
    bins: [],
    products: [],
    suppliers: [],
    customers: [],
    balances: [],
    movements: [],
    transfers: [],
    inbounds: [],
    orders: [],
    pickTasks: [],
    packages: [],
    shipments: [],
    users: [],
    roles: [],
    activity: [],
    notifications: [],
    settings: structuredCloneSafe(SETTINGS),
    reportRuns: {},
    audit: [],
    cycleCounts: [],
    userTokens: [],
    sessions: [],
    idempotency: {},
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ------------------------------------------------------------------ replay

interface OrderSpec {
  number: string;
  customer: string;
  wh: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
  /** Minutes before "now" the order was created. */
  ago: number;
  /** Hours after creation it is required by. */
  dueIn: number;
  lines: [string, number][];
  target: 'CREATED' | 'ALLOCATED' | 'PICKING' | 'IN_PROGRESS' | 'PICKED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'EXCEPTION';
  shipTo?: string;
  carrier?: string;
  shortBy?: number;
}

const ORDERS: OrderSpec[] = [
  // Prototype orders (numbers and states kept; timestamps relative to today)
  { number: 'ORD-10482', customer: 'cus-1001', wh: 'wh-mum', priority: 'HIGH', ago: 150, dueIn: 30, lines: [['prd-10001', 6], ['prd-10045', 4], ['prd-10150', 2]], target: 'IN_PROGRESS' },
  { number: 'ORD-10481', customer: 'cus-1008', wh: 'wh-pun', priority: 'NORMAL', ago: 130, dueIn: 48, lines: [['prd-10163', 5], ['prd-10056', 3]], target: 'ALLOCATED' },
  { number: 'ORD-10479', customer: 'cus-1022', wh: 'wh-mum', priority: 'LOW', ago: 200, dueIn: 72, lines: [['prd-10171', 4]], target: 'PICKED' },
  { number: 'ORD-10470', customer: 'cus-1014', wh: 'wh-mum', priority: 'NORMAL', ago: 260, dueIn: 30, lines: [['prd-10001', 2], ['prd-10188', 1], ['prd-10078', 3]], target: 'PACKED' },
  { number: 'ORD-10468', customer: 'cus-1001', wh: 'wh-mum', priority: 'HIGH', ago: 1500, dueIn: 30, lines: [['prd-10112', 14]], target: 'SHIPPED', shortBy: 4, carrier: 'Delhivery' },
  { number: 'ORD-10462', customer: 'cus-1014', wh: 'wh-mum', priority: 'CRITICAL', ago: 1560, dueIn: 12, lines: [['prd-10045', 10], ['prd-10078', 16]], target: 'PICKING' },
  { number: 'ORD-10455', customer: 'cus-1001', wh: 'wh-mum', priority: 'HIGH', ago: 1620, dueIn: 24, lines: [['prd-10001', 10], ['prd-10092', 8]], target: 'SHIPPED', shipTo: 'Bengaluru', carrier: 'BlueDart Express' },
  { number: 'ORD-10452', customer: 'cus-1022', wh: 'wh-pun', priority: 'NORMAL', ago: 1700, dueIn: 36, lines: [['prd-10163', 12], ['prd-10150', 6]], target: 'EXCEPTION', shipTo: 'Chennai', carrier: 'Ecom Express' },
  { number: 'ORD-10448', customer: 'cus-1008', wh: 'wh-mum', priority: 'CRITICAL', ago: 1440, dueIn: 30, lines: [['prd-10045', 12], ['prd-10188', 4], ['prd-10171', 6]], target: 'ALLOCATED' },
  { number: 'ORD-10443', customer: 'cus-1022', wh: 'wh-pun', priority: 'NORMAL', ago: 1800, dueIn: 48, lines: [['prd-10056', 3]], target: 'DELIVERED', carrier: 'Delhivery' },
  { number: 'ORD-10439', customer: 'cus-1001', wh: 'wh-hyd', priority: 'HIGH', ago: 2900, dueIn: 48, lines: [['prd-10112', 5], ['prd-10067', 4]], target: 'PICKING' },
  { number: 'ORD-10432', customer: 'cus-1008', wh: 'wh-mum', priority: 'NORMAL', ago: 3000, dueIn: 48, lines: [['prd-10001', 14]], target: 'CANCELLED' },
  { number: 'ORD-10425', customer: 'cus-1014', wh: 'wh-del', priority: 'LOW', ago: 3100, dueIn: 72, lines: [['prd-10150', 5]], target: 'SHIPPED', shipTo: 'New Delhi', carrier: 'BlueDart Express' },
  { number: 'ORD-10418', customer: 'cus-1001', wh: 'wh-hyd', priority: 'NORMAL', ago: 3200, dueIn: 48, lines: [['prd-10045', 8], ['prd-10001', 6]], target: 'DELIVERED', shipTo: 'Hyderabad', carrier: 'DTDC' },
  { number: 'ORD-10410', customer: 'cus-1008', wh: 'wh-pun', priority: 'NORMAL', ago: 4400, dueIn: 40, lines: [['prd-10078', 20], ['prd-10163', 30]], target: 'PACKED' },
  { number: 'ORD-10434', customer: 'cus-1005', wh: 'wh-blr', priority: 'LOW', ago: 2950, dueIn: 72, lines: [['prd-10112', 20]], target: 'DELIVERED', shipTo: 'Kolkata', carrier: 'DTDC' },
  // Today's intake not yet processed
  { number: 'ORD-10483', customer: 'cus-1022', wh: 'wh-mum', priority: 'NORMAL', ago: 45, dueIn: 48, lines: [['prd-10150', 12], ['prd-10163', 20]], target: 'CREATED' },
  { number: 'ORD-10484', customer: 'cus-1008', wh: 'wh-blr', priority: 'HIGH', ago: 30, dueIn: 24, lines: [['prd-10001', 25]], target: 'CREATED' },
  { number: 'ORD-10485', customer: 'cus-1001', wh: 'wh-pun', priority: 'NORMAL', ago: 25, dueIn: 48, lines: [['prd-10134', 40]], target: 'ALLOCATED' },
  { number: 'ORD-10486', customer: 'cus-1014', wh: 'wh-pun', priority: 'HIGH', ago: 10, dueIn: 24, lines: [['prd-10134', 25]], target: 'CREATED' },
];

/** Background volume for the last week so trends and reports have substance. */
function historyOrders(): OrderSpec[] {
  const customers = ['cus-1001', 'cus-1008', 'cus-1014', 'cus-1022'];
  const whs = ['wh-mum', 'wh-mum', 'wh-pun', 'wh-hyd', 'wh-blr', 'wh-del'];
  const products = ['prd-10001', 'prd-10045', 'prd-10112', 'prd-10056', 'prd-10150', 'prd-10163', 'prd-10171', 'prd-10078'];
  const carriers = ['BlueDart Express', 'Delhivery', 'DTDC', 'Ecom Express', 'Shadowfax'];
  const perDay = [5, 7, 6, 8, 6, 9];
  const out: OrderSpec[] = [];
  let n = 10340;
  perDay.forEach((count, i) => {
    const daysAgo = 6 - i;
    for (let k = 0; k < count; k++) {
      const seed = n * 7 + k;
      const lines: [string, number][] = [[products[seed % products.length], 2 + (seed % 9)]];
      if (seed % 3 === 0) lines.push([products[(seed + 3) % products.length], 1 + (seed % 5)]);
      out.push({
        number: `ORD-${n}`,
        customer: customers[seed % customers.length],
        wh: whs[seed % whs.length],
        priority: (['NORMAL', 'NORMAL', 'HIGH', 'LOW', 'NORMAL', 'CRITICAL'] as const)[seed % 6],
        ago: daysAgo * 1440 + 480 - k * 55,
        dueIn: 48,
        lines,
        target: daysAgo >= 3 ? 'DELIVERED' : daysAgo === 2 && k % 3 === 0 ? 'DELIVERED' : 'SHIPPED',
        carrier: carriers[seed % carriers.length],
        shortBy: seed % 13 === 0 ? 1 : 0,
      });
      n++;
    }
  });
  return out;
}

export function seed(server: MockServer): void {
  const db = server.db;
  const t0 = Date.now();
  const at = (minutesAgo: number) => new Date(t0 - minutesAgo * MIN);

  // Master data --------------------------------------------------------------
  for (const w of WAREHOUSES) {
    const { binFactor, areas, ...rest } = w;
    db.warehouses.push(rest);
    ZONES.forEach((z, zi) => {
      const zone: DbZone = { id: `zone-${w.id}-${z.code}`, warehouseId: w.id, code: z.code, name: z.name, type: z.type, areaM2: areas[zi], status: 'ACTIVE' };
      db.zones.push(zone);
      for (let i = 1; i <= z.bins; i++) {
        const bin: DbBin = {
          id: `bin-${w.id}-${z.code}-${i}`,
          warehouseId: w.id,
          zoneId: zone.id,
          code: `${z.code}-${String(i).padStart(3, '0')}`,
          capacityUnits: Math.round((z.binCapacity * binFactor) / 50) * 50,
          blocked: false,
        };
        db.bins.push(bin);
      }
    });
  }
  db.products.push(...PRODUCTS.map((p) => ({ ...p })));
  db.suppliers.push(...SUPPLIERS.map((x) => ({ ...x, status: 'ACTIVE' as const, version: 1 })));
  db.customers.push(...CUSTOMERS.map((x) => ({ ...x, status: 'ACTIVE' as const, version: 1 })));
  db.roles.push(...ROLES.map((r) => ({ ...r, permissions: [...r.permissions] })));
  db.users.push(...USERS.map((u) => ({ ...u, warehouseIds: [...u.warehouseIds] })));

  // Opening stock, 30 days ago -------------------------------------------------
  server.setClock(at(30 * 1440));
  WAREHOUSES.forEach((w, wi) => {
    const pick = db.bins.filter((b) => b.warehouseId === w.id && b.code.startsWith('PCK-C'));
    const store = db.bins.filter((b) => b.warehouseId === w.id && b.code.startsWith('STR-B'));
    const used = new Map<string, number>();
    const place = (bins: DbBin[], productId: string, qty: number, offset: number) => {
      let remaining = qty;
      for (let i = 0; i < bins.length && remaining > 0; i++) {
        const bin = bins[(offset + i) % bins.length];
        const free = bin.capacityUnits - (used.get(bin.id) ?? 0);
        const take = Math.min(free, remaining);
        if (take <= 0) continue;
        used.set(bin.id, (used.get(bin.id) ?? 0) + take);
        server.receive(w.id, bin.id, productId, take, 0, 'OPENING', 'System');
        remaining -= take;
      }
      return remaining;
    };
    Object.entries(OPENING).forEach(([productId, qtys], pi) => {
      const qty = qtys[wi];
      if (!qty) return;
      const toPick = Math.min(Math.round(qty * 0.2), 400);
      const left = place(pick, productId, toPick, pi) + (qty - toPick);
      const overflow = place(store, productId, left, pi);
      if (overflow > 0) server.receive(w.id, store[pi % store.length].id, productId, overflow, 0, 'OPENING', 'System');
    });
  });

  // Sessions for the people who did the work -----------------------------------
  const tokens = new Map<string, string>();
  for (const u of db.users) tokens.set(u.id, server.openSession(u, false).accessToken);
  const call = (userId: string, minutesAgo: number, method: string, path: string, body: unknown = {}): Record<string, unknown> => {
    server.setClock(at(minutesAgo));
    const res = server.handle({
      method,
      path,
      query: new URLSearchParams(),
      body,
      header: (name) => (name === 'Authorization' ? `Bearer ${tokens.get(userId)}` : null),
    });
    if (res.status >= 300) throw new Error(`Seed step failed: ${method} ${path} → ${res.status} ${JSON.stringify(res.body)}`);
    return (res.body ?? {}) as Record<string, unknown>;
  };

  // Inbound -------------------------------------------------------------------
  const asn = (number: string, supplierId: string, wh: string, expectedMinutesAgo: number, lines: [string, number][], poReference: string) =>
    call('usr-admin', expectedMinutesAgo + 2 * 1440, 'POST', '/inbound', {
      number,
      supplierId,
      warehouseId: wh,
      poReference,
      expectedAt: at(expectedMinutesAgo).toISOString(),
      lines: lines.map(([productId, expectedQty]) => ({ productId, expectedQty })),
    })['id'] as string;

  const received = asn('ASN-2043', 'sup-09', 'wh-mum', 1500, [['prd-10045', 180], ['prd-10134', 60], ['prd-10188', 40]], 'PO-88213');
  call('usr-rajesh', 1490, 'POST', `/inbound/${received}/start`);
  call('usr-rajesh', 1470, 'POST', `/inbound/${received}/receive`, { lines: [{ productId: 'prd-10045', receivedQty: 180, damagedQty: 0 }, { productId: 'prd-10134', receivedQty: 60, damagedQty: 0 }, { productId: 'prd-10188', receivedQty: 40, damagedQty: 0 }] });
  call('usr-rajesh', 1440, 'POST', `/inbound/${received}/putaway`, { lines: [{ productId: 'prd-10045', binId: 'bin-wh-mum-STR-B-2' }, { productId: 'prd-10134', binId: 'bin-wh-mum-PCK-C-6' }, { productId: 'prd-10188', binId: 'bin-wh-mum-STR-B-5' }] });

  const partial = asn('ASN-2031', 'sup-31', 'wh-del', 2900, [['prd-10112', 400], ['prd-10171', 320], ['prd-10056', 200]], 'PO-88190');
  call('usr-anil', 2880, 'POST', `/inbound/${partial}/start`);
  call('usr-anil', 2850, 'POST', `/inbound/${partial}/receive`, { lines: [{ productId: 'prd-10112', receivedQty: 400, damagedQty: 6 }, { productId: 'prd-10171', receivedQty: 200, damagedQty: 0 }, { productId: 'prd-10056', receivedQty: 200, damagedQty: 0 }] });

  const cancelled = asn('ASN-2025', 'sup-24', 'wh-blr', 4300, [['prd-10078', 1500], ['prd-10150', 1980]], 'PO-88177');
  call('usr-deepak', 4200, 'POST', `/inbound/${cancelled}/cancel`);

  const receiving = asn('ASN-2049', 'sup-24', 'wh-pun', 120, [['prd-10078', 600], ['prd-10150', 840], ['prd-10163', 400]], 'PO-88240');
  call('usr-priya', 60, 'POST', `/inbound/${receiving}/start`);

  asn('ASN-2051', 'sup-18', 'wh-mum', -45, [['prd-10001', 2000], ['prd-10045', 1500], ['prd-10134', 780]], 'PO-88251');
  asn('ASN-2038', 'sup-18', 'wh-hyd', -1260, [['prd-10092', 240], ['prd-10188', 60], ['prd-10001', 900]], 'PO-88236');

  // Transfers -------------------------------------------------------------------
  const trf = (number: string, user: string, minutesAgo: number, from: string, to: string, productId: string, qty: number) =>
    call(user, minutesAgo, 'POST', '/transfers', { number, sourceWarehouseId: from, destWarehouseId: to, lines: [{ productId, qty }], note: '' })['id'] as string;

  const completed = trf('TRF-3042', 'usr-amit', 3000, 'wh-pun', 'wh-blr', 'prd-10078', 1200);
  call('usr-admin', 2980, 'POST', `/transfers/${completed}/approve`);
  call('usr-amit', 2900, 'POST', `/transfers/${completed}/dispatch`);
  call('usr-deepak', 1700, 'POST', `/transfers/${completed}/receive`);

  const rejected = trf('TRF-3038', 'usr-anil', 4200, 'wh-del', 'wh-mum', 'prd-10134', 180);
  call('usr-admin', 4100, 'POST', `/transfers/${rejected}/reject`, { reason: 'Mumbai demand covered by ASN-2051' });

  const inTransit = trf('TRF-3047', 'usr-suresh', 1600, 'wh-hyd', 'wh-mum', 'prd-10112', 220);
  call('usr-admin', 1580, 'POST', `/transfers/${inTransit}/approve`);
  call('usr-suresh', 1500, 'POST', `/transfers/${inTransit}/dispatch`);

  trf('TRF-3046', 'usr-rajesh', 1300, 'wh-mum', 'wh-hyd', 'prd-10092', 64);
  const approved = trf('TRF-3048', 'usr-amit', 200, 'wh-mum', 'wh-pun', 'prd-10001', 480);
  call('usr-admin', 180, 'POST', `/transfers/${approved}/approve`);

  // Orders ------------------------------------------------------------------------
  const staffFor = (wh: string) => ({
    manager: { 'wh-mum': 'usr-rajesh', 'wh-pun': 'usr-amit', 'wh-hyd': 'usr-suresh', 'wh-del': 'usr-anil', 'wh-blr': 'usr-deepak' }[wh] ?? 'usr-admin',
    packer: wh === 'wh-mum' ? 'usr-sneha' : wh === 'wh-pun' ? 'usr-karthik' : null,
  });
  const stations = ['Station 1', 'Station 2', 'Station 3'];
  const orders = [...historyOrders(), ...ORDERS].sort((a, b) => b.ago - a.ago);
  let trackingSeq = 4589100;

  for (const o of orders) {
    const staff = staffFor(o.wh);
    const actor = staff.manager;
    let t = o.ago;
    const step = (minutes: number) => (t = Math.max(t - minutes, 1));
    const order = call(actor, t, 'POST', '/orders', {
      number: o.number,
      customerId: o.customer,
      warehouseId: o.wh,
      priority: o.priority,
      shipToCity: o.shipTo ?? '',
      requiredBy: new Date(t0 - o.ago * MIN + o.dueIn * HOUR).toISOString(),
      lines: o.lines.map(([productId, qty]) => ({ productId, qty })),
    });
    const id = order['id'] as string;
    if (o.target === 'CREATED') continue;
    if (o.target === 'CANCELLED') {
      call(actor, step(20), 'POST', `/orders/${id}/allocate`);
      call(actor, step(90), 'POST', `/orders/${id}/cancel`, { reason: 'Customer withdrew the order' });
      continue;
    }
    call(actor, step(10), 'POST', `/orders/${id}/allocate`);
    if (o.target === 'ALLOCATED') continue;
    call(actor, step(10), 'POST', `/orders/${id}/release`);
    if (o.target === 'PICKING') continue;
    const mine = db.pickTasks.find((x) => x.orderId === id);
    if (!mine) throw new Error(`Seed: no pick task for ${o.number}`);
    const pickerUser = db.users.find((u) => u.name === mine.picker)?.id ?? actor;
    call(pickerUser, step(15), 'POST', `/pick-tasks/${mine.id}/start`);
    if (o.target === 'IN_PROGRESS') continue;
    let shortLeft = o.shortBy ?? 0;
    call(pickerUser, step(25), 'POST', `/pick-tasks/${mine.id}/complete`, {
      lines: mine.lines.map((l) => {
        const short = Math.min(shortLeft, l.qty - 1);
        shortLeft -= short;
        return { productId: l.productId, binCode: l.binCode, picked: l.qty - short };
      }),
    });
    if (o.target === 'PICKED') continue;
    const packer = staff.packer ?? actor;
    const weight = o.lines.reduce((a, [pid, q]) => a + (PRODUCTS.find((p) => p.id === pid)?.weightKg ?? 1) * q, 0) + 0.6;
    call(packer, step(20), 'POST', `/orders/${id}/pack`, { station: stations[o.number.charCodeAt(o.number.length - 1) % 3], weightKg: Math.round(weight * 10) / 10 });
    if (o.target === 'PACKED') continue;
    const carrier = o.carrier ?? 'BlueDart Express';
    const prefix = { 'BlueDart Express': 'BD', Delhivery: 'DL', 'Ecom Express': 'EC', DTDC: 'DT', Shadowfax: 'SF' }[carrier] ?? 'XX';
    call(packer, step(30), 'POST', `/orders/${id}/ship`, { carrier, trackingNumber: `${prefix}${trackingSeq++}` });
    const shp = db.shipments.find((x) => x.orderId === id);
    if (!shp) continue;
    if (o.target === 'DELIVERED') call(actor, Math.max(o.ago - 1300, 5), 'POST', `/shipments/${shp.id}/deliver`);
    if (o.target === 'EXCEPTION') call(actor, Math.max(o.ago - 900, 5), 'POST', `/shipments/${shp.id}/exception`, { note: 'Consignee premises closed on delivery attempt' });
  }

  // A cycle-count correction and damage write-off, so adjustments appear in the ledger.
  const damagedBal = db.balances.find((b) => b.warehouseId === 'wh-mum' && b.productId === 'prd-10056' && b.onHand > 100);
  if (damagedBal) call('usr-rajesh', 600, 'POST', '/inventory/adjustments', { balanceId: damagedBal.id, kind: 'DAMAGE', qty: 15, reason: 'Damaged in storage', note: 'Forklift puncture, aisle B' });
  const countBal = db.balances.find((b) => b.warehouseId === 'wh-pun' && b.productId === 'prd-10171' && b.onHand > 50);
  if (countBal) call('usr-priya', 400, 'POST', '/inventory/adjustments', { balanceId: countBal.id, kind: 'ADJUST', qty: -12, reason: 'Cycle count correction', note: '' });

  // Final statuses that the prototype showed.
  const hold = db.suppliers.find((x) => x.id === 'sup-09');
  if (hold) hold.status = 'ON_HOLD';
  const inactive = db.customers.find((x) => x.id === 'cus-1005');
  if (inactive) inactive.status = 'INACTIVE';

  // Seeded records used explicit prototype numbers; move the counters past them so
  // new documents never reuse a number.
  const maxOf = (numbers: string[]) => Math.max(0, ...numbers.map((n) => Number(n.split('-')[1]) || 0));
  db.seq['orderNo'] = Math.max(db.seq['orderNo'] ?? 0, maxOf(db.orders.map((o) => o.number)));
  db.seq['asnNo'] = Math.max(db.seq['asnNo'] ?? 0, maxOf(db.inbounds.map((i) => i.number)));
  db.seq['transferNo'] = Math.max(db.seq['transferNo'] ?? 0, maxOf(db.transfers.map((t) => t.number)));

  // Tidy up replay artefacts.
  server.setClock(null);
  db.sessions = [];
  db.idempotency = {};
  db.movements.sort((a, b) => a.at.localeCompare(b.at));
  db.activity.sort((a, b) => b.at.localeCompare(a.at));
  db.notifications.sort((a, b) => b.at.localeCompare(a.at));
  // The five newest are unread for everyone; older ones read by everyone.
  const everyone = db.users.map((u) => u.id);
  db.notifications.forEach((n, i) => (n.readBy = i >= 5 ? [...everyone] : []));
  for (const u of db.users) u.lastLoginAt = at(u.id === 'usr-admin' ? 1 : 30 + u.name.length * 17).toISOString();
}
