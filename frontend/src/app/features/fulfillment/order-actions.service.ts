import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { AuthSession, FulfillmentApi, Order, ToastService } from '@wms/core';
import { DialogService } from '@wms/design-system';
import { PackDialogComponent, ShipDialogComponent } from './fulfillment-dialogs';

export interface OrderAction {
  key: 'allocate' | 'release' | 'cancel' | 'pack' | 'ship';
  label: string;
  primary: boolean;
}

/** The order lifecycle commands, with their confirmations, in one place for list and detail. */
@Injectable()
export class OrderActions {
  constructor(
    private readonly api: FulfillmentApi,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly session: AuthSession,
  ) {}

  /** Actions available for this order's status and the user's permissions, primary last. */
  available(o: Order): OrderAction[] {
    const out: OrderAction[] = [];
    const can = (p: string) => this.session.can(p);
    if ((o.status === 'CREATED' || o.status === 'ALLOCATED') && can('orders:edit')) out.push({ key: 'cancel', label: 'Cancel order', primary: false });
    if (o.status === 'CREATED' && can('orders:approve')) out.push({ key: 'allocate', label: 'Allocate stock', primary: true });
    if (o.status === 'ALLOCATED' && can('orders:approve')) out.push({ key: 'release', label: 'Release to picking', primary: true });
    if (o.status === 'PICKED' && can('packing:edit')) out.push({ key: 'pack', label: 'Pack', primary: true });
    if (o.status === 'PACKED' && can('shipping:edit')) out.push({ key: 'ship', label: 'Dispatch', primary: true });
    return out;
  }

  /** Runs an action; emits true when the order changed. */
  run(o: Order, key: OrderAction['key']): Observable<boolean> {
    switch (key) {
      case 'pack':
        return this.dialogs.open<Order>(PackDialogComponent, o).pipe(map((r) => !!r));
      case 'ship':
        return this.dialogs.open<Order>(ShipDialogComponent, o).pipe(map((r) => !!r));
      case 'allocate':
        return this.confirm(o, {
          title: `Allocate ${o.number}?`,
          message: `${o.totalQty} units are reserved in ${o.warehouseName}, from picking bins first. If any line is short, nothing is reserved.`,
          confirmLabel: 'Allocate stock',
          success: `${o.number} allocated`,
          call: () => this.api.orderCommand(o.id, 'allocate'),
        });
      case 'release':
        return this.confirm(o, {
          title: `Release ${o.number} to picking?`,
          message: 'A pick task is created with the reserved bins. It is assigned to an available picker when auto-assign is on.',
          confirmLabel: 'Create pick task',
          success: `Pick task created for ${o.number}`,
          call: () => this.api.orderCommand(o.id, 'release'),
        });
      case 'cancel':
        return this.confirm(o, {
          title: `Cancel ${o.number}?`,
          message: o.status === 'ALLOCATED' ? 'Reserved stock is released and becomes available to other orders.' : 'The order will not be fulfilled.',
          confirmLabel: 'Cancel order',
          danger: true,
          reason: true,
          success: `${o.number} cancelled`,
          call: (reason) => this.api.orderCommand(o.id, 'cancel', { reason }),
        });
    }
  }

  private confirm(
    _o: Order,
    c: { title: string; message: string; confirmLabel: string; success: string; danger?: boolean; reason?: boolean; call: (reason: string) => Observable<Order> },
  ): Observable<boolean> {
    return this.dialogs
      .confirm({
        title: c.title,
        message: c.message,
        confirmLabel: c.confirmLabel,
        tone: c.danger ? 'danger' : 'primary',
        reasonLabel: c.reason ? 'Reason (optional)' : undefined,
        action: c.call,
      })
      .pipe(
        map((r) => {
          if (r) this.toasts.success(c.success);
          return !!r;
        }),
      );
  }
}
