import {
  ActivityEntry,
  FieldError,
  MovementType,
  Page,
  SessionUser,
  StockStatus,
  Tone,
  ZoneType,
} from '@core/models';
import {
  ApiException,
  Db,
  DbBalance,
  DbBin,
  DbProduct,
  DbUser,
  MockResponse,
  Reservation,
  forbidden,
  invalid,
  notFound,
  unauthorized,
  conflict,
} from './mock-types';

export interface MockRequest {
  method: string;
  /** Path below the API base, e.g. `/orders/o-1/allocate`. */
  path: string;
  query: URLSearchParams;
  body: unknown;
  header(name: string): string | null;
}

export interface Ctx {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  /** Null only on routes marked `public`. */
  user: DbUser;
  perms: Set<string>;
  /** X-Warehouse-Id, or null for "all warehouses". */
  warehouseContext: string | null;
  header(name: string): string | null;
}

type Handler = (ctx: Ctx) => unknown;

interface Route {
  method: string;
  parts: string[];
  handler: Handler;
  permission: string | null;
  isPublic: boolean;
  status: number;
}

export interface RouteOptions {
  permission?: string;
  public?: boolean;
  status?: number;
}

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 8 * 60 * 60 * 1000;
const REFRESH_TTL_REMEMBER_MS = 7 * 24 * 60 * 60 * 1000;
const PICKABLE_ZONES: ZoneType[] = ['PICKING', 'STORAGE'];

/**
 * Stands in for the browser's HttpOnly refresh cookie. It lives inside the mock server so
 * application code can never read the refresh token, exactly as with the real cookie.
 */
export interface CookieJar {
  get(): string | null;
  set(token: string, persistent: boolean): void;
  clear(): void;
}

export function memoryCookieJar(): CookieJar {
  let value: string | null = null;
  return { get: () => value, set: (t) => (value = t), clear: () => (value = null) };
}

/** A minimal HTTP-shaped server. Handlers throw ApiException for non-2xx results. */
export class MockServer {
  private routes: Route[] = [];
  private clockOverride: number | null = null;
  cookieJar: CookieJar = memoryCookieJar();

  constructor(public db: Db, private readonly onChange: (db: Db) => void = () => undefined) {}

  // ---------------------------------------------------------------- routing

  on(method: string, pattern: string, handler: Handler, options: RouteOptions = {}): void {
    this.routes.push({
      method,
      parts: pattern.split('/').filter(Boolean),
      handler,
      permission: options.permission ?? null,
      isPublic: options.public ?? false,
      status: options.status ?? (method === 'POST' ? 201 : 200),
    });
  }

  handle(req: MockRequest): MockResponse {
    try {
      const idemKey = req.method === 'POST' ? req.header('Idempotency-Key') : null;
      if (idemKey && this.db.idempotency[idemKey]) {
        return this.db.idempotency[idemKey];
      }
      const response = this.dispatch(req);
      if (req.method !== 'GET') {
        if (idemKey && response.status < 300) {
          this.db.idempotency[idemKey] = response;
        }
        this.onChange(this.db);
      }
      return response;
    } catch (e) {
      if (e instanceof ApiException) {
        return {
          status: e.status,
          body: { type: 'about:blank', title: e.title, status: e.status, detail: e.detail, errors: e.errors },
        };
      }
      console.error('[mock-api] unhandled error', e);
      return { status: 500, body: { title: 'Internal server error', status: 500, detail: String(e) } };
    }
  }

  private dispatch(req: MockRequest): MockResponse {
    const parts = req.path.split('/').filter(Boolean);
    let pathMatched = false;
    for (const route of this.routes) {
      const params = this.match(route.parts, parts);
      if (!params) continue;
      pathMatched = true;
      if (route.method !== req.method) continue;

      let user: DbUser | null = null;
      let perms = new Set<string>();
      if (!route.isPublic) {
        user = this.authenticate(req.header('Authorization'));
        perms = new Set(this.permissionsOf(user));
        if (route.permission && !perms.has(route.permission)) throw forbidden();
      }
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const ctx: Ctx = {
        params,
        query: req.query,
        body,
        user: user as DbUser,
        perms,
        warehouseContext: req.header('X-Warehouse-Id'),
        header: req.header,
      };
      const result = route.handler(ctx);
      return { status: result === undefined ? 204 : route.status, body: result ?? null };
    }
    if (pathMatched) throw new ApiException(405, 'Method not allowed');
    throw notFound(`Resource ${req.path}`);
  }

  private match(pattern: string[], actual: string[]): Record<string, string> | null {
    if (pattern.length !== actual.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i].startsWith(':')) params[pattern[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (pattern[i] !== actual[i]) return null;
    }
    return params;
  }

  // ---------------------------------------------------------------- clock + ids

  now(): Date {
    return new Date(this.clockOverride ?? Date.now());
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  /** Used by the seed to replay history at past timestamps. */
  setClock(at: Date | null): void {
    this.clockOverride = at ? at.getTime() : null;
  }

  nextId(prefix: string): string {
    this.db.seq[prefix] = (this.db.seq[prefix] ?? 0) + 1;
    return `${prefix}-${this.db.seq[prefix]}`;
  }

  nextNumber(key: string, prefix: string, start: number): string {
    const current = this.db.seq[key] ?? start - 1;
    this.db.seq[key] = current + 1;
    return `${prefix}-${current + 1}`;
  }

  token(): string {
    const bytes = new Uint8Array(24);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // ---------------------------------------------------------------- auth

  authenticate(authorization: string | null): DbUser {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw unauthorized('Authentication is required.');
    const session = this.db.sessions.find((s) => s.accessToken === token);
    if (!session || session.accessExpiresAt < Date.now()) throw unauthorized();
    const user = this.db.users.find((u) => u.id === session.userId);
    if (!user || user.status !== 'ACTIVE') throw unauthorized('Your account is not active.');
    return user;
  }

  openSession(user: DbUser, rememberMe: boolean): { accessToken: string; refreshToken: string; expiresIn: number } {
    const session = {
      userId: user.id,
      refreshToken: this.token(),
      refreshExpiresAt: Date.now() + (rememberMe ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_MS),
      accessToken: this.token(),
      accessExpiresAt: Date.now() + ACCESS_TTL_MS,
    };
    this.db.sessions = this.db.sessions.filter((s) => s.refreshExpiresAt > Date.now());
    this.db.sessions.push(session);
    return { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresIn: ACCESS_TTL_MS / 1000 };
  }

  /** Rotates the refresh token on every use; an unknown token ends nothing but fails. */
  rotateSession(refreshToken: string): { user: DbUser; accessToken: string; refreshToken: string; expiresIn: number } {
    const session = this.db.sessions.find((s) => s.refreshToken === refreshToken);
    if (!session || session.refreshExpiresAt < Date.now()) throw unauthorized();
    const user = this.db.users.find((u) => u.id === session.userId);
    if (!user || user.status !== 'ACTIVE') throw unauthorized('Your account is not active.');
    session.refreshToken = this.token();
    session.accessToken = this.token();
    session.accessExpiresAt = Date.now() + ACCESS_TTL_MS;
    return { user, accessToken: session.accessToken, refreshToken: session.refreshToken, expiresIn: ACCESS_TTL_MS / 1000 };
  }

  endSession(refreshToken: string | null, accessToken: string | null): void {
    this.db.sessions = this.db.sessions.filter((s) => s.refreshToken !== refreshToken && s.accessToken !== accessToken);
  }

  permissionsOf(user: DbUser): string[] {
    return this.db.roles.find((r) => r.id === user.roleId)?.permissions ?? [];
  }

  sessionUser(user: DbUser): SessionUser {
    const { password: _password, ...rest } = user;
    return {
      ...rest,
      roleName: this.db.roles.find((r) => r.id === user.roleId)?.name ?? 'Unknown',
      permissions: this.permissionsOf(user),
    };
  }

  // ---------------------------------------------------------------- scoping + paging

  /** Warehouses this user may see; null = all. */
  allowedWarehouses(user: DbUser): Set<string> | null {
    return user.warehouseIds.length ? new Set(user.warehouseIds) : null;
  }

  /**
   * The warehouse filter to apply for a list request: explicit ?warehouseId, else the
   * X-Warehouse-Id context. Throws 403 when the user asks for a warehouse outside their scope.
   */
  warehouseFilter(ctx: Ctx): (warehouseId: string) => boolean {
    const allowed = this.allowedWarehouses(ctx.user);
    const requested = ctx.query.get('warehouseId') || ctx.warehouseContext || null;
    if (requested && allowed && !allowed.has(requested)) throw forbidden();
    if (requested) return (id) => id === requested;
    if (allowed) return (id) => allowed.has(id);
    return () => true;
  }

  assertWarehouseAccess(ctx: Ctx, warehouseId: string): void {
    const allowed = this.allowedWarehouses(ctx.user);
    if (allowed && !allowed.has(warehouseId)) throw notFound('Record');
  }

  paginate<T>(items: T[], query: URLSearchParams, defaultSort?: string): Page<T> {
    const size = Math.min(Math.max(Number(query.get('size') ?? 25) || 25, 1), 200);
    const page = Math.max(Number(query.get('page') ?? 0) || 0, 0);
    const sort = query.get('sort') || defaultSort;
    let sorted = items;
    if (sort) {
      const [field, dir] = sort.split(',');
      const factor = dir === 'desc' ? -1 : 1;
      sorted = [...items].sort((a, b) => {
        const av = (a as Record<string, unknown>)[field];
        const bv = (b as Record<string, unknown>)[field];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
        return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true }) * factor;
      });
    }
    const totalElements = sorted.length;
    return {
      content: sorted.slice(page * size, page * size + size),
      page,
      size,
      totalElements,
      totalPages: Math.max(1, Math.ceil(totalElements / size)),
    };
  }

  matchesQ(q: string | null, ...fields: (string | null | undefined)[]): boolean {
    if (!q) return true;
    const needle = q.trim().toLowerCase();
    return fields.some((f) => (f ?? '').toLowerCase().includes(needle));
  }

  inList(value: string, param: string | null): boolean {
    if (!param) return true;
    return param.split(',').includes(value);
  }

  // ---------------------------------------------------------------- validation

  validate(checks: [boolean, string, string][]): void {
    const errors: FieldError[] = checks
      .filter(([ok]) => !ok)
      .map(([, field, message]) => ({ field, code: 'invalid', message }));
    if (errors.length) throw invalid(errors);
  }

  str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
  }

  num(v: unknown): number {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  checkVersion(current: number, body: Record<string, unknown>): void {
    if (body['version'] !== undefined && Number(body['version']) !== current) {
      throw conflict('This record was changed by someone else. Reload it and try again.');
    }
  }

  // ---------------------------------------------------------------- lookups

  warehouse(id: string) {
    const w = this.db.warehouses.find((x) => x.id === id);
    if (!w) throw notFound('Warehouse');
    return w;
  }

  product(id: string): DbProduct {
    const p = this.db.products.find((x) => x.id === id);
    if (!p) throw notFound('Product');
    return p;
  }

  bin(id: string): DbBin {
    const b = this.db.bins.find((x) => x.id === id);
    if (!b) throw notFound('Bin');
    return b;
  }

  zoneOf(bin: DbBin) {
    return this.db.zones.find((z) => z.id === bin.zoneId);
  }

  // ---------------------------------------------------------------- stock engine

  available(b: DbBalance): number {
    return b.onHand - b.reserved - b.damaged - b.blocked;
  }

  balanceFor(warehouseId: string, binId: string, productId: string): DbBalance {
    let b = this.db.balances.find((x) => x.binId === binId && x.productId === productId);
    if (!b) {
      b = { id: this.nextId('bal'), warehouseId, binId, productId, onHand: 0, reserved: 0, damaged: 0, blocked: 0 };
      this.db.balances.push(b);
    }
    return b;
  }

  private assertInvariant(b: DbBalance): void {
    if (b.onHand < 0 || b.reserved < 0 || b.damaged < 0 || b.blocked < 0 || b.reserved + b.damaged + b.blocked > b.onHand) {
      throw conflict('This change would leave stock in an inconsistent state.');
    }
  }

  recordMovement(type: MovementType, b: DbBalance, qty: number, reference: string, user: string, reason: string | null = null): void {
    const product = this.product(b.productId);
    const bin = this.bin(b.binId);
    this.db.movements.push({
      id: this.nextId('mov'),
      at: this.nowIso(),
      type,
      warehouseId: b.warehouseId,
      warehouseName: this.warehouse(b.warehouseId).name,
      binCode: bin.code,
      productId: product.id,
      sku: product.sku,
      productName: product.name,
      qty,
      reference,
      reason,
      user,
    });
  }

  /** The receiving bin with the most free space. */
  receivingBin(warehouseId: string): DbBin {
    const zoneIds = new Set(this.db.zones.filter((z) => z.warehouseId === warehouseId && z.type === 'RECEIVING').map((z) => z.id));
    const bins = this.db.bins.filter((b) => zoneIds.has(b.zoneId) && !b.blocked);
    if (!bins.length) throw conflict('This warehouse has no receiving bin. Add one under Warehouses → Bins.');
    return bins.sort((a, b) => this.binUsed(a.id) - a.capacityUnits - (this.binUsed(b.id) - b.capacityUnits))[0];
  }

  binUsed(binId: string): number {
    return this.db.balances.filter((b) => b.binId === binId).reduce((s, b) => s + b.onHand, 0);
  }

  receive(warehouseId: string, binId: string, productId: string, qty: number, damaged: number, ref: string, user: string, type: MovementType = 'RECEIPT'): void {
    const b = this.balanceFor(warehouseId, binId, productId);
    b.onHand += qty;
    b.damaged += damaged;
    this.assertInvariant(b);
    if (qty) this.recordMovement(type, b, qty, ref, user);
    if (damaged) this.recordMovement('DAMAGE', b, damaged, ref, user, 'Damaged on arrival');
  }

  /**
   * Reserves `qty` of a product in a warehouse, picking bins first, then storage.
   * Checks the total before touching anything, so a failed reservation changes nothing.
   */
  reserve(warehouseId: string, productId: string, qty: number, ref: string, user: string): Reservation[] {
    const candidates = this.db.balances
      .filter((b) => b.warehouseId === warehouseId && b.productId === productId && this.available(b) > 0)
      .filter((b) => {
        const bin = this.bin(b.binId);
        const zone = this.zoneOf(bin);
        return !bin.blocked && !!zone && PICKABLE_ZONES.includes(zone.type);
      })
      .sort((a, b) => {
        const za = this.zoneOf(this.bin(a.binId))?.type === 'PICKING' ? 0 : 1;
        const zb = this.zoneOf(this.bin(b.binId))?.type === 'PICKING' ? 0 : 1;
        return za - zb || this.available(b) - this.available(a);
      });
    const total = candidates.reduce((s, b) => s + this.available(b), 0);
    if (total < qty) {
      const p = this.product(productId);
      throw conflict(`Insufficient stock for ${p.sku}: ${qty} requested, ${total} available in pickable bins.`);
    }
    const result: Reservation[] = [];
    let remaining = qty;
    for (const b of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, this.available(b));
      b.reserved += take;
      remaining -= take;
      result.push({ balanceId: b.id, productId, qty: take });
      this.recordMovement('RESERVE', b, take, ref, user);
    }
    return result;
  }

  release(reservations: Reservation[], ref: string, user: string): void {
    for (const r of reservations) {
      const b = this.db.balances.find((x) => x.id === r.balanceId);
      if (!b) continue;
      b.reserved -= r.qty;
      this.assertInvariant(b);
      this.recordMovement('RELEASE', b, r.qty, ref, user);
    }
  }

  /** Consumes a reservation. Any shortfall is written off as a count correction. */
  pick(r: Reservation, picked: number, ref: string, user: string): void {
    const b = this.db.balances.find((x) => x.id === r.balanceId);
    if (!b) throw notFound('Balance');
    b.reserved -= r.qty;
    b.onHand -= r.qty;
    this.assertInvariant(b);
    if (picked) this.recordMovement('PICK', b, -picked, ref, user);
    if (r.qty > picked) this.recordMovement('ADJUST', b, -(r.qty - picked), ref, user, 'Short pick — stock not found');
  }

  shipOut(reservations: Reservation[], ref: string, user: string): void {
    for (const r of reservations) {
      const b = this.db.balances.find((x) => x.id === r.balanceId);
      if (!b) continue;
      b.reserved -= r.qty;
      b.onHand -= r.qty;
      this.assertInvariant(b);
      this.recordMovement('TRANSFER_OUT', b, -r.qty, ref, user);
    }
  }

  moveStock(from: DbBalance, toBinId: string, qty: number, ref: string, user: string): void {
    if (this.available(from) < qty) throw conflict('Not enough available stock in the source bin.');
    const to = this.balanceFor(from.warehouseId, toBinId, from.productId);
    from.onHand -= qty;
    to.onHand += qty;
    this.assertInvariant(from);
    this.recordMovement('PUTAWAY', from, -qty, ref, user);
    this.recordMovement('PUTAWAY', to, qty, ref, user);
  }

  adjust(b: DbBalance, delta: number, reason: string, ref: string, user: string): void {
    b.onHand += delta;
    if (b.onHand < b.reserved + b.damaged + b.blocked) {
      b.onHand -= delta;
      throw conflict('On-hand cannot go below reserved + damaged + blocked stock in this bin.');
    }
    this.recordMovement('ADJUST', b, delta, ref, user, reason);
  }

  damage(b: DbBalance, qty: number, reason: string, ref: string, user: string): void {
    if (this.available(b) < qty) throw conflict(`Only ${this.available(b)} units are available to mark as damaged.`);
    b.damaged += qty;
    this.recordMovement('DAMAGE', b, qty, ref, user, reason);
  }

  // ---------------------------------------------------------------- derived stock figures

  stockStatus(p: DbProduct, onHand: number, available: number): StockStatus {
    if (available <= 0) return 'OUT_OF_STOCK';
    if (available <= p.reorderLevel) return 'LOW_STOCK';
    if (p.maxStock > 0 && onHand > p.maxStock) return 'OVERSTOCK';
    return 'IN_STOCK';
  }

  /**
   * Reorder level and max stock are per warehouse, so a status across several warehouses
   * is the worst of the per-warehouse statuses — never a network total against one
   * warehouse's thresholds (which would call every product "overstock").
   */
  aggregateStatus(p: DbProduct, warehouseFilter: (id: string) => boolean = () => true): StockStatus {
    const whIds = Array.from(new Set(this.db.balances.filter((b) => b.productId === p.id && warehouseFilter(b.warehouseId)).map((b) => b.warehouseId)));
    if (!whIds.length) return 'OUT_OF_STOCK';
    const statuses = whIds.map((id) => {
      const t = this.productTotals(p.id, (w) => w === id);
      return this.stockStatus(p, t.onHand, t.available);
    });
    if (statuses.every((s) => s === 'OUT_OF_STOCK')) return 'OUT_OF_STOCK';
    if (statuses.some((s) => s === 'LOW_STOCK' || s === 'OUT_OF_STOCK')) return 'LOW_STOCK';
    if (statuses.some((s) => s === 'OVERSTOCK')) return 'OVERSTOCK';
    return 'IN_STOCK';
  }

  productTotals(productId: string, warehouseFilter: (id: string) => boolean = () => true) {
    let onHand = 0;
    let available = 0;
    let reserved = 0;
    let damaged = 0;
    let blocked = 0;
    for (const b of this.db.balances) {
      if (b.productId !== productId || !warehouseFilter(b.warehouseId)) continue;
      onHand += b.onHand;
      reserved += b.reserved;
      damaged += b.damaged;
      blocked += b.blocked;
      available += this.available(b);
    }
    return { onHand, available, reserved, damaged, blocked };
  }

  // ---------------------------------------------------------------- activity + notifications

  log(kind: ActivityEntry['kind'], tone: Tone, title: string, detail: string, warehouseId: string | null, user: string): void {
    this.db.activity.unshift({ id: this.nextId('act'), at: this.nowIso(), kind, tone, title, detail, warehouseId, user });
    if (this.db.activity.length > 500) this.db.activity.length = 500;
  }

  notify(tone: Tone, title: string, detail: string, link: string | null, setting?: keyof Db['settings']['notifications']): void {
    if (setting && !this.db.settings.notifications[setting]) return;
    this.db.notifications.unshift({ id: this.nextId('ntf'), at: this.nowIso(), tone, title, detail, link, read: false, userId: null });
    if (this.db.notifications.length > 100) this.db.notifications.length = 100;
  }

  /** Raise a low-stock notification the first time a product crosses its reorder level in a warehouse. */
  checkLowStock(warehouseId: string, productId: string): void {
    const p = this.product(productId);
    const t = this.productTotals(productId, (id) => id === warehouseId);
    if (t.available > p.reorderLevel) return;
    const title = t.available <= 0 ? 'Out of stock' : 'Low stock alert';
    const detail = `${p.sku} ${p.name} · ${t.available} available in ${this.warehouse(warehouseId).name}`;
    const recent = this.db.notifications.find((n) => n.detail === detail && n.title === title);
    if (!recent) this.notify(t.available <= 0 ? 'danger' : 'warning', title, detail, `/inventory?q=${p.sku}`, 'lowStock');
  }

  actor(ctx: Ctx): string {
    return ctx.user?.name ?? 'System';
  }
}
