import { Tone } from '@core/models';

/**
 * Explicit status → tone map, replacing the prototype's substring matching
 * (PROTOTYPE_AUDIT §6: "OVERSTOCK" contained "stock" and rendered as success).
 * A status missing from this map renders neutral, never a guessed tone.
 */
const TONES: Record<string, Tone> = {
  // Generic / partners / warehouses / users
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  ON_HOLD: 'warning',
  MAINTENANCE: 'warning',
  INVITED: 'info',
  DISABLED: 'neutral',
  DISCONTINUED: 'neutral',
  // Stock
  IN_STOCK: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
  OVERSTOCK: 'info',
  // Bins
  EMPTY: 'neutral',
  PARTIAL: 'info',
  FULL: 'warning',
  BLOCKED: 'danger',
  // Orders
  CREATED: 'neutral',
  ALLOCATED: 'info',
  PICKING: 'info',
  PICKED: 'info',
  PACKED: 'info',
  SHIPPED: 'success',
  DELIVERED: 'success',
  CANCELLED: 'danger',
  DELAYED: 'danger',
  // Pick tasks
  PENDING: 'neutral',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  SHORT: 'warning',
  // Shipments
  IN_TRANSIT: 'info',
  EXCEPTION: 'danger',
  // Inbound
  EXPECTED: 'neutral',
  RECEIVING: 'info',
  PUTAWAY_PENDING: 'warning',
  // Transfers
  REQUESTED: 'neutral',
  APPROVED: 'info',
  REJECTED: 'danger',
  // Priority
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

export function toneOf(status: string | null | undefined): Tone {
  return (status && TONES[status]) || 'neutral';
}

/** `PUTAWAY_PENDING` → `Putaway pending`. */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
