import { StockStatus } from './catalog';
import { Tone } from './common';
import { OrderStatus } from './fulfillment';

export interface DashboardSummary {
  generatedAt: string;
  kpis: {
    onHand: number;
    ordersToday: number;
    pendingPicking: number;
    readyToShip: number;
    lowStockItems: number;
    capacityPct: number;
  };
  stockByWarehouse: { warehouseId: string; name: string; available: number; reserved: number; damaged: number; inTransit: number }[];
  capacity: { usedUnits: number; capacityUnits: number; pct: number };
  ordersByDay: { date: string; received: number; shipped: number }[];
  orderStatus: { status: OrderStatus; count: number }[];
  alerts: Alert[];
  activity: ActivityEntry[];
  topProducts: { productId: string; sku: string; name: string; category: string; orderedQty: number; available: number; stockStatus: StockStatus }[];
}

export interface Alert {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  link: string;
  queryParams?: Record<string, string>;
  action: string;
}

export type ActivityKind = 'order' | 'pick' | 'pack' | 'ship' | 'inbound' | 'inventory' | 'transfer' | 'warehouse' | 'catalog' | 'admin';

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  tone: Tone;
  title: string;
  detail: string;
  warehouseId: string | null;
  user: string;
}

export interface Notification {
  id: string;
  at: string;
  tone: Tone;
  title: string;
  detail: string;
  link: string | null;
  read: boolean;
}

export interface ReportDefinition {
  key: string;
  name: string;
  category: 'Inventory' | 'Warehouse' | 'Orders' | 'Suppliers';
  description: string;
  lastRunAt: string | null;
}

export interface ReportColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ReportResult {
  key: string;
  name: string;
  generatedAt: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
}

export interface SearchResult {
  type: 'product' | 'order' | 'warehouse' | 'inbound' | 'transfer' | 'customer' | 'supplier';
  id: string;
  title: string;
  subtitle: string;
  link: string;
  queryParams?: Record<string, string>;
}

export interface Settings {
  general: { companyName: string; currency: string; timezone: string; dateFormat: string };
  operations: { defaultWarehouseId: string; autoAssignPickers: boolean; capacityAlertPct: number; lowStockBufferPct: number };
  notifications: { lowStock: boolean; capacity: boolean; orderDelay: boolean; inboundReminder: boolean; dailySummary: boolean };
  security: { twoFactor: boolean; sessionTimeoutMin: number; passwordMinLength: number; ipAllowlist: string };
  version: number;
}
