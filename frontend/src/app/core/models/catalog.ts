export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'OVERSTOCK';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand: string;
  uom: string;
  reorderLevel: number;
  /** Stock above this is overstock; 0 disables the check. */
  maxStock: number;
  unitCost: number;
  weightKg: number;
  status: 'ACTIVE' | 'DISCONTINUED';
  onHand: number;
  available: number;
  stockStatus: StockStatus;
  version: number;
}

export interface ProductUpsert {
  sku: string;
  name: string;
  category: string;
  brand: string;
  uom: string;
  reorderLevel: number;
  maxStock: number;
  unitCost: number;
  weightKg: number;
}

export type PartnerStatus = 'ACTIVE' | 'ON_HOLD' | 'INACTIVE';

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  status: PartnerStatus;
  inboundCount: number;
  version: number;
}

export interface SupplierUpsert {
  name: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  status: PartnerStatus;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  status: PartnerStatus;
  orderCount: number;
  lastOrderAt: string | null;
  version: number;
}

export interface CustomerUpsert {
  name: string;
  email: string;
  phone: string;
  city: string;
  status: PartnerStatus;
}
