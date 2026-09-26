export type WarehouseStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  city: string;
  address: string;
  manager: string;
  capacityM2: number;
  timezone: string;
  status: WarehouseStatus;
  zoneCount: number;
  binCount: number;
  capacityUnits: number;
  usedUnits: number;
  /** usedUnits / capacityUnits, 0–100. Computed by the server. */
  utilization: number;
  version: number;
}

export interface WarehouseUpsert {
  code: string;
  name: string;
  city: string;
  address: string;
  manager: string;
  capacityM2: number;
  timezone: string;
}

export const ZONE_TYPES = ['RECEIVING', 'STORAGE', 'PICKING', 'PACKING', 'DISPATCH', 'RETURNS'] as const;
export type ZoneType = typeof ZONE_TYPES[number];

export interface Zone {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: ZoneType;
  areaM2: number;
  status: 'ACTIVE' | 'INACTIVE';
  binCount: number;
  capacityUnits: number;
  usedUnits: number;
  utilization: number;
}

export interface ZoneUpsert {
  code: string;
  name: string;
  type: ZoneType;
  areaM2: number;
}

export type BinStatus = 'EMPTY' | 'PARTIAL' | 'FULL' | 'BLOCKED';

export interface Bin {
  id: string;
  warehouseId: string;
  zoneId: string;
  zoneName: string;
  zoneType: ZoneType;
  code: string;
  capacityUnits: number;
  usedUnits: number;
  skuCount: number;
  blocked: boolean;
  status: BinStatus;
}

export interface BinCreate {
  zoneId: string;
  code: string;
  capacityUnits: number;
}
