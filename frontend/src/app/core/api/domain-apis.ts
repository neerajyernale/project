import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AdjustmentRequest,
  ActivityEntry,
  AuditEntry,
  CycleCount,
  CycleCountCreate,
  Bin,
  BinCreate,
  Customer,
  CustomerUpsert,
  DashboardSummary,
  Inbound,
  InboundCreate,
  InventoryBalance,
  InventoryItem,
  Movement,
  Notification,
  Order,
  OrderCreate,
  PackRequest,
  PackageRecord,
  Page,
  PickCompleteRequest,
  PickTask,
  Product,
  ProductUpsert,
  PutawayRequest,
  ReceiveRequest,
  ReportDefinition,
  ReportResult,
  Role,
  SearchResult,
  Settings,
  ShipRequest,
  Shipment,
  Supplier,
  SupplierUpsert,
  Transfer,
  TransferCreate,
  User,
  UserUpsert,
  Warehouse,
  WarehouseUpsert,
  Zone,
  ZoneUpsert,
} from '../models';
import { ApiClient, QueryParams } from './api-client';

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  uom: string;
}

export interface PartnerOption {
  id: string;
  code: string;
  name: string;
  city?: string;
}

export interface StaffOption {
  id: string;
  name: string;
}

export interface StatusCounts {
  byStatus: Record<string, number>;
}

export interface OrderCounts extends StatusCounts {
  total: number;
  delayed: number;
}

export interface WarehouseOptionDto {
  id: string;
  code: string;
  name: string;
  city: string;
  status: Warehouse['status'];
}

@Injectable({ providedIn: 'root' })
export class WarehouseApi {
  constructor(private readonly api: ApiClient) {}

  list(q: QueryParams): Observable<Page<Warehouse>> {
    return this.api.get('/warehouses', q);
  }
  get(id: string): Observable<Warehouse> {
    return this.api.get(`/warehouses/${id}`);
  }
  /** Every active warehouse in the network (names only), e.g. for transfer destinations. */
  networkOptions(): Observable<WarehouseOptionDto[]> {
    return this.api.get('/warehouses/options', { scope: 'network' });
  }
  create(body: WarehouseUpsert): Observable<Warehouse> {
    return this.api.post('/warehouses', body);
  }
  update(id: string, body: WarehouseUpsert & { version: number }): Observable<Warehouse> {
    return this.api.put(`/warehouses/${id}`, body);
  }
  setStatus(id: string, action: 'activate' | 'deactivate' | 'maintenance'): Observable<Warehouse> {
    return this.api.post(`/warehouses/${id}/${action}`);
  }
  zones(id: string): Observable<Zone[]> {
    return this.api.get(`/warehouses/${id}/zones`);
  }
  createZone(id: string, body: ZoneUpsert): Observable<Zone> {
    return this.api.post(`/warehouses/${id}/zones`, body);
  }
  updateZone(id: string, zoneId: string, body: ZoneUpsert & { status: Zone['status'] }): Observable<Zone> {
    return this.api.put(`/warehouses/${id}/zones/${zoneId}`, body);
  }
  bins(id: string, q: QueryParams): Observable<Page<Bin>> {
    return this.api.get(`/warehouses/${id}/bins`, q);
  }
  createBin(id: string, body: BinCreate): Observable<Bin> {
    return this.api.post(`/warehouses/${id}/bins`, body);
  }
  setBinBlocked(binId: string, blocked: boolean): Observable<Bin> {
    return this.api.post(`/bins/${binId}/${blocked ? 'block' : 'unblock'}`);
  }
}

@Injectable({ providedIn: 'root' })
export class CatalogApi {
  constructor(private readonly api: ApiClient) {}

  products(q: QueryParams): Observable<Page<Product>> {
    return this.api.get('/products', q);
  }
  productOptions(q = ''): Observable<ProductOption[]> {
    return this.api.get('/products/options', { q });
  }
  categories(): Observable<string[]> {
    return this.api.get('/products/categories');
  }
  createProduct(body: ProductUpsert): Observable<Product> {
    return this.api.post('/products', body);
  }
  updateProduct(id: string, body: ProductUpsert & { version: number }): Observable<Product> {
    return this.api.put(`/products/${id}`, body);
  }
  setProductActive(id: string, active: boolean): Observable<Product> {
    return this.api.post(`/products/${id}/${active ? 'reactivate' : 'discontinue'}`);
  }

  suppliers(q: QueryParams): Observable<Page<Supplier>> {
    return this.api.get('/suppliers', q);
  }
  supplierOptions(): Observable<PartnerOption[]> {
    return this.api.get('/suppliers/options');
  }
  createSupplier(body: SupplierUpsert): Observable<Supplier> {
    return this.api.post('/suppliers', body);
  }
  updateSupplier(id: string, body: SupplierUpsert & { version: number }): Observable<Supplier> {
    return this.api.put(`/suppliers/${id}`, body);
  }

  customers(q: QueryParams): Observable<Page<Customer>> {
    return this.api.get('/customers', q);
  }
  customerOptions(): Observable<PartnerOption[]> {
    return this.api.get('/customers/options');
  }
  createCustomer(body: CustomerUpsert): Observable<Customer> {
    return this.api.post('/customers', body);
  }
  updateCustomer(id: string, body: CustomerUpsert & { version: number }): Observable<Customer> {
    return this.api.put(`/customers/${id}`, body);
  }
}

@Injectable({ providedIn: 'root' })
export class InventoryApi {
  constructor(private readonly api: ApiClient) {}

  items(q: QueryParams): Observable<Page<InventoryItem>> {
    return this.api.get('/inventory/items', q);
  }
  balances(q: QueryParams): Observable<InventoryBalance[]> {
    return this.api.get('/inventory/balances', q);
  }
  movements(q: QueryParams): Observable<Page<Movement>> {
    return this.api.get('/inventory/movements', q);
  }
  adjust(body: AdjustmentRequest): Observable<InventoryBalance> {
    return this.api.post('/inventory/adjustments', body, { idempotent: true });
  }
  /** Bin-to-bin move within a warehouse (putaway from the dock, re-slotting). */
  move(body: { balanceId: string; toBinId: string; qty: number }): Observable<InventoryBalance> {
    return this.api.post('/inventory/moves', body, { idempotent: true });
  }
  transferCounts(): Observable<StatusCounts> {
    return this.api.get('/transfers/counts');
  }

  transfers(q: QueryParams): Observable<Page<Transfer>> {
    return this.api.get('/transfers', q);
  }
  transfer(id: string): Observable<Transfer> {
    return this.api.get(`/transfers/${id}`);
  }
  createTransfer(body: TransferCreate): Observable<Transfer> {
    return this.api.post('/transfers', body);
  }
  transferCommand(id: string, command: 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel', body: unknown = {}): Observable<Transfer> {
    return this.api.post(`/transfers/${id}/${command}`, body, { idempotent: true });
  }

  cycleCounts(q: QueryParams): Observable<Page<CycleCount>> {
    return this.api.get('/cycle-counts', q);
  }
  cycleCount(id: string): Observable<CycleCount> {
    return this.api.get(`/cycle-counts/${id}`);
  }
  createCycleCount(body: CycleCountCreate): Observable<CycleCount> {
    return this.api.post('/cycle-counts', body);
  }
  /** Counts for some or all lines; the count becomes COUNTED once every line has one. */
  recordCounts(id: string, lines: { lineNo: number; countedQty: number }[]): Observable<CycleCount> {
    return this.api.post(`/cycle-counts/${id}/counts`, { lines });
  }
  /** Posts every difference to the ledger as an adjustment. */
  approveCycleCount(id: string): Observable<CycleCount> {
    return this.api.post(`/cycle-counts/${id}/approve`, {}, { idempotent: true });
  }
  cancelCycleCount(id: string): Observable<CycleCount> {
    return this.api.post(`/cycle-counts/${id}/cancel`);
  }
}

@Injectable({ providedIn: 'root' })
export class InboundApi {
  constructor(private readonly api: ApiClient) {}

  list(q: QueryParams): Observable<Page<Inbound>> {
    return this.api.get('/inbound', q);
  }
  get(id: string): Observable<Inbound> {
    return this.api.get(`/inbound/${id}`);
  }
  create(body: InboundCreate): Observable<Inbound> {
    return this.api.post('/inbound', body);
  }
  start(id: string): Observable<Inbound> {
    return this.api.post(`/inbound/${id}/start`, {}, { idempotent: true });
  }
  receive(id: string, body: ReceiveRequest): Observable<Inbound> {
    return this.api.post(`/inbound/${id}/receive`, body, { idempotent: true });
  }
  putaway(id: string, body: PutawayRequest): Observable<Inbound> {
    return this.api.post(`/inbound/${id}/putaway`, body, { idempotent: true });
  }
  cancel(id: string): Observable<Inbound> {
    return this.api.post(`/inbound/${id}/cancel`);
  }
  counts(): Observable<StatusCounts> {
    return this.api.get('/inbound/counts');
  }
}

@Injectable({ providedIn: 'root' })
export class FulfillmentApi {
  constructor(private readonly api: ApiClient) {}

  orders(q: QueryParams): Observable<Page<Order>> {
    return this.api.get('/orders', q);
  }
  order(id: string): Observable<Order> {
    return this.api.get(`/orders/${id}`);
  }
  orderCounts(stage?: 'outbound'): Observable<OrderCounts> {
    return this.api.get('/orders/counts', { stage });
  }
  pickCounts(): Observable<StatusCounts> {
    return this.api.get('/pick-tasks/counts');
  }
  createOrder(body: OrderCreate): Observable<Order> {
    return this.api.post('/orders', body);
  }
  orderCommand(id: string, command: 'allocate' | 'release' | 'cancel', body: unknown = {}): Observable<Order> {
    return this.api.post(`/orders/${id}/${command}`, body, { idempotent: true });
  }
  pack(id: string, body: PackRequest): Observable<Order> {
    return this.api.post(`/orders/${id}/pack`, body, { idempotent: true });
  }
  ship(id: string, body: ShipRequest): Observable<Order> {
    return this.api.post(`/orders/${id}/ship`, body, { idempotent: true });
  }

  pickTasks(q: QueryParams): Observable<Page<PickTask>> {
    return this.api.get('/pick-tasks', q);
  }
  pickTask(id: string): Observable<PickTask> {
    return this.api.get(`/pick-tasks/${id}`);
  }
  assignPicker(id: string, picker: string): Observable<PickTask> {
    return this.api.post(`/pick-tasks/${id}/assign`, { picker });
  }
  startPick(id: string): Observable<PickTask> {
    return this.api.post(`/pick-tasks/${id}/start`);
  }
  completePick(id: string, body: PickCompleteRequest): Observable<PickTask> {
    return this.api.post(`/pick-tasks/${id}/complete`, body, { idempotent: true });
  }

  packages(q: QueryParams): Observable<Page<PackageRecord>> {
    return this.api.get('/packages', q);
  }
  shipments(q: QueryParams): Observable<Page<Shipment>> {
    return this.api.get('/shipments', q);
  }
  deliver(id: string): Observable<Shipment> {
    return this.api.post(`/shipments/${id}/deliver`, {}, { idempotent: true });
  }
  exception(id: string, note: string): Observable<Shipment> {
    return this.api.post(`/shipments/${id}/exception`, { note });
  }
}

@Injectable({ providedIn: 'root' })
export class InsightsApi {
  constructor(private readonly api: ApiClient) {}

  /** Omitting warehouseId follows the active warehouse (X-Warehouse-Id). */
  dashboard(warehouseId?: string): Observable<DashboardSummary> {
    return this.api.get('/dashboard/summary', { warehouseId });
  }
  activity(q: QueryParams): Observable<Page<ActivityEntry>> {
    return this.api.get('/activity', q);
  }
  search(q: string): Observable<SearchResult[]> {
    return this.api.get('/search', { q });
  }
  notifications(): Observable<{ unread: number; items: Notification[] }> {
    return this.api.get('/notifications');
  }
  markRead(id: string): Observable<void> {
    return this.api.post(`/notifications/${id}/read`);
  }
  markAllRead(): Observable<void> {
    return this.api.post('/notifications/read-all');
  }
  reports(): Observable<ReportDefinition[]> {
    return this.api.get('/reports');
  }
  runReport(key: string, filters: { warehouseId?: string | null; from?: string; to?: string }): Observable<ReportResult> {
    return this.api.post(`/reports/${key}/run`, filters);
  }
}

@Injectable({ providedIn: 'root' })
export class AdminApi {
  constructor(private readonly api: ApiClient) {}

  users(q: QueryParams): Observable<Page<User>> {
    return this.api.get('/users', q);
  }
  /** Active people who hold `permission` and work in `warehouseId`. */
  staff(permission: string, warehouseId?: string): Observable<StaffOption[]> {
    return this.api.get('/users/staff', { permission, warehouseId });
  }
  createUser(body: UserUpsert): Observable<User> {
    return this.api.post('/users', body);
  }
  updateUser(id: string, body: UserUpsert & { version: number }): Observable<User> {
    return this.api.put(`/users/${id}`, body);
  }
  setUserEnabled(id: string, enabled: boolean): Observable<User> {
    return this.api.post(`/users/${id}/${enabled ? 'enable' : 'disable'}`);
  }
  resendInvite(id: string): Observable<void> {
    return this.api.post(`/users/${id}/resend-invite`);
  }
  /** For a user who lost their authenticator: they sign in with their password and set it up again. */
  resetMfa(id: string): Observable<void> {
    return this.api.post(`/users/${id}/mfa/reset`);
  }
  audit(q: QueryParams): Observable<Page<AuditEntry>> {
    return this.api.get('/audit', q);
  }
  roles(): Observable<Role[]> {
    return this.api.get('/roles');
  }
  createRole(body: Pick<Role, 'name' | 'description' | 'permissions'>): Observable<Role> {
    return this.api.post('/roles', body);
  }
  updateRole(id: string, body: Pick<Role, 'name' | 'description' | 'permissions'>): Observable<Role> {
    return this.api.put(`/roles/${id}`, body);
  }
  deleteRole(id: string): Observable<void> {
    return this.api.delete(`/roles/${id}`);
  }
  settings(): Observable<Settings> {
    return this.api.get('/settings');
  }
  saveSettings(body: Settings): Observable<Settings> {
    return this.api.put('/settings', body);
  }
}
