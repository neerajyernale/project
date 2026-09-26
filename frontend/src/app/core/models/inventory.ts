import { StockStatus } from './catalog';

/** One (warehouse, product) row, summed over all its bins. */
export interface InventoryItem {
  id: string;
  warehouseId: string;
  warehouseName: string;
  productId: string;
  sku: string;
  productName: string;
  category: string;
  onHand: number;
  reserved: number;
  damaged: number;
  blocked: number;
  available: number;
  reorderLevel: number;
  stockStatus: StockStatus;
  binCount: number;
}

/** Stock in one bin. available = onHand − reserved − damaged − blocked. */
export interface InventoryBalance {
  id: string;
  warehouseId: string;
  binId: string;
  binCode: string;
  zoneName: string;
  productId: string;
  sku: string;
  productName: string;
  onHand: number;
  reserved: number;
  damaged: number;
  blocked: number;
  available: number;
}

export const MOVEMENT_TYPES = [
  'RECEIPT',
  'PUTAWAY',
  'RESERVE',
  'RELEASE',
  'PICK',
  'ADJUST',
  'DAMAGE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
] as const;
export type MovementType = typeof MOVEMENT_TYPES[number];

export interface Movement {
  id: string;
  at: string;
  type: MovementType;
  warehouseId: string;
  warehouseName: string;
  binCode: string;
  productId: string;
  sku: string;
  productName: string;
  /** Signed change to on-hand (RESERVE/RELEASE change reserved instead). */
  qty: number;
  reference: string;
  reason: string | null;
  user: string;
}

export const ADJUSTMENT_REASONS = [
  'Cycle count correction',
  'Damaged in storage',
  'Found stock',
  'Lost / missing',
  'Expired',
  'Returned to stock',
] as const;

export interface AdjustmentRequest {
  balanceId: string;
  /** ADJUST changes on-hand by `qty` (signed); DAMAGE moves `qty` from sellable to damaged. */
  kind: 'ADJUST' | 'DAMAGE';
  qty: number;
  reason: string;
  note: string;
}

export type TransferStatus = 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';

export interface TransferLine {
  productId: string;
  sku: string;
  productName: string;
  qty: number;
}

export interface Transfer {
  id: string;
  number: string;
  sourceWarehouseId: string;
  sourceWarehouseName: string;
  destWarehouseId: string;
  destWarehouseName: string;
  lines: TransferLine[];
  totalQty: number;
  requestedBy: string;
  requestedAt: string;
  status: TransferStatus;
  note: string;
  updatedAt: string;
}

export interface TransferCreate {
  sourceWarehouseId: string;
  destWarehouseId: string;
  lines: { productId: string; qty: number }[];
  note: string;
}
