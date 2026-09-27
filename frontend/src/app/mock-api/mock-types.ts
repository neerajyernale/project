/*
 * In-browser stand-in for the Spring Boot API (docs/ARCHITECTURE.md §4–6).
 * Records here are the server's source of truth; DTOs with computed fields are built per request.
 */
import {
  ActivityEntry,
  AuditEntry,
  CycleCount,
  Bin,
  Customer,
  FieldError,
  Inbound,
  Movement,
  Notification,
  Order,
  PackageRecord,
  PickLine,
  PickTask,
  Product,
  Role,
  Settings,
  Shipment,
  Supplier,
  Transfer,
  User,
  Warehouse,
  Zone,
} from '@wms/core';

export type DbWarehouse = Omit<Warehouse, 'zoneCount' | 'binCount' | 'capacityUnits' | 'usedUnits' | 'utilization'>;
export type DbZone = Omit<Zone, 'binCount' | 'capacityUnits' | 'usedUnits' | 'utilization'>;
export type DbBin = Omit<Bin, 'zoneName' | 'zoneType' | 'usedUnits' | 'skuCount' | 'status'>;
export type DbProduct = Omit<Product, 'onHand' | 'available' | 'stockStatus'>;
export type DbSupplier = Omit<Supplier, 'inboundCount'>;
export type DbCustomer = Omit<Customer, 'orderCount' | 'lastOrderAt'>;

export interface DbBalance {
  id: string;
  warehouseId: string;
  binId: string;
  productId: string;
  onHand: number;
  reserved: number;
  damaged: number;
  blocked: number;
}

export interface Reservation {
  balanceId: string;
  productId: string;
  qty: number;
}

export interface DbTransfer extends Transfer {
  reservations: Reservation[];
}

export interface DbOrder extends Omit<Order, 'delayed'> {
  allocations: Reservation[];
}

export interface DbPickLine extends PickLine {
  balanceId: string;
}

export interface DbPickTask extends Omit<PickTask, 'lines'> {
  lines: DbPickLine[];
}

export interface DbUser extends Omit<User, 'roleName'> {
  password: string;
  /** Mock only: a real authenticator secret is never stored in plain text. */
  mfaSecret?: string | null;
  mfaEnabled?: boolean;
}

export type DbCycleCount = Omit<CycleCount, 'warehouseName' | 'lineCount' | 'varianceLines' | 'netVariance'>;

export interface DbUserToken {
  token: string;
  userId: string;
  purpose: 'INVITE' | 'PASSWORD_RESET';
  expiresAt: number;
  used: boolean;
}

export type DbRole = Omit<Role, 'userCount'>;

export interface DbSession {
  userId: string;
  refreshToken: string;
  refreshExpiresAt: number;
  accessToken: string;
  accessExpiresAt: number;
  /** The refresh token this one replaced, accepted briefly so two tabs refreshing at once don't collide. */
  previousRefreshToken: string | null;
  rotatedAt: number;
  /** Every refresh token this session has used; presenting one again means it was stolen. */
  usedRefreshTokens: string[];
  /** Last authenticated request, for the idle timeout. */
  lastSeenAt: number;
}

export interface DbNotification extends Omit<Notification, 'read'> {
  /** Null = relevant to everyone who can see the warehouse (or everyone, if no warehouse). */
  warehouseId: string | null;
  /** Permission needed to see it, e.g. 'inventory:view'. */
  permission: string | null;
  /** Users who have read it. Read state is per user. */
  readBy: string[];
}

export interface MockResponse {
  status: number;
  body: unknown;
}

export interface Db {
  schema: number;
  seq: Record<string, number>;
  warehouses: DbWarehouse[];
  zones: DbZone[];
  bins: DbBin[];
  products: DbProduct[];
  suppliers: DbSupplier[];
  customers: DbCustomer[];
  balances: DbBalance[];
  movements: Movement[];
  transfers: DbTransfer[];
  inbounds: Inbound[];
  orders: DbOrder[];
  pickTasks: DbPickTask[];
  packages: PackageRecord[];
  shipments: Shipment[];
  users: DbUser[];
  roles: DbRole[];
  activity: ActivityEntry[];
  notifications: DbNotification[];
  settings: Settings;
  reportRuns: Record<string, string>;
  audit: AuditEntry[];
  cycleCounts: DbCycleCount[];
  userTokens: DbUserToken[];
  sessions: DbSession[];
  idempotency: Record<string, MockResponse>;
}

export class ApiException extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: FieldError[],
  ) {
    super(detail ?? title);
  }
}

export const notFound = (what: string): ApiException => new ApiException(404, 'Not found', `${what} was not found.`);
export const conflict = (detail: string): ApiException => new ApiException(409, 'Conflict', detail);
export const forbidden = (): ApiException =>
  new ApiException(403, 'Forbidden', 'You do not have permission to perform this action.');
export const unauthorized = (detail = 'Your session has expired. Sign in again.'): ApiException =>
  new ApiException(401, 'Unauthorized', detail);
export const invalid = (errors: FieldError[]): ApiException =>
  new ApiException(422, 'Validation failed', 'One or more fields are invalid.', errors);
