export type InboundStatus = 'EXPECTED' | 'RECEIVING' | 'PUTAWAY_PENDING' | 'COMPLETED' | 'CANCELLED';

export interface InboundLine {
  productId: string;
  sku: string;
  productName: string;
  expectedQty: number;
  receivedQty: number;
  damagedQty: number;
  putawayBinCode: string | null;
}

export interface Inbound {
  id: string;
  number: string;
  poReference: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  expectedAt: string;
  lines: InboundLine[];
  totalExpected: number;
  totalReceived: number;
  status: InboundStatus;
  /** True when received quantities differ from expected. */
  discrepancy: boolean;
  receivingBinCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundCreate {
  supplierId: string;
  warehouseId: string;
  poReference: string;
  expectedAt: string;
  lines: { productId: string; expectedQty: number }[];
}

export interface ReceiveRequest {
  lines: { productId: string; receivedQty: number; damagedQty: number }[];
}

export interface PutawayRequest {
  lines: { productId: string; binId: string }[];
}
