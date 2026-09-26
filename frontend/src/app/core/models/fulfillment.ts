export const ORDER_STATUSES = [
  'CREATED',
  'ALLOCATED',
  'PICKING',
  'PICKED',
  'PACKED',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export type Priority = typeof PRIORITIES[number];

export interface OrderLine {
  productId: string;
  sku: string;
  productName: string;
  qty: number;
  allocated: number;
  picked: number;
}

export interface Order {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  warehouseId: string;
  warehouseName: string;
  priority: Priority;
  shipToCity: string;
  createdAt: string;
  requiredBy: string;
  lines: OrderLine[];
  totalQty: number;
  status: OrderStatus;
  /** Past requiredBy and not yet shipped. Derived, not a status. */
  delayed: boolean;
  pickTaskNumber: string | null;
  packageNumber: string | null;
  shipmentNumber: string | null;
  updatedAt: string;
}

export interface OrderCreate {
  customerId: string;
  warehouseId: string;
  priority: Priority;
  shipToCity: string;
  requiredBy: string;
  lines: { productId: string; qty: number }[];
}

export type PickStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SHORT';

export interface PickLine {
  productId: string;
  sku: string;
  productName: string;
  binCode: string;
  qty: number;
  picked: number;
}

export interface PickTask {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  warehouseId: string;
  warehouseName: string;
  zone: string;
  picker: string | null;
  priority: Priority;
  lines: PickLine[];
  totalQty: number;
  status: PickStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PickCompleteRequest {
  lines: { productId: string; binCode: string; picked: number }[];
}

export interface PackageRecord {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  warehouseId: string;
  station: string;
  items: number;
  weightKg: number;
  packedBy: string;
  packedAt: string;
}

export interface PackRequest {
  station: string;
  weightKg: number;
}

export type ShipmentStatus = 'IN_TRANSIT' | 'DELIVERED' | 'EXCEPTION';

export interface Shipment {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  warehouseId: string;
  carrier: string;
  trackingNumber: string;
  destination: string;
  shippedAt: string;
  deliveredAt: string | null;
  status: ShipmentStatus;
  exceptionNote: string | null;
}

export interface ShipRequest {
  carrier: string;
  trackingNumber: string;
}

export const CARRIERS = ['BlueDart Express', 'Delhivery', 'Ecom Express', 'DTDC', 'Shadowfax'] as const;
export const PACK_STATIONS = ['Station 1', 'Station 2', 'Station 3', 'Station 4'] as const;
