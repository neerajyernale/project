import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@core/auth/guards';
import { SharedModule } from '@shared/shared.module';
import {
  AssignDialogComponent,
  OrderDialogComponent,
  PackDialogComponent,
  PickDialogComponent,
  ShipDialogComponent,
} from './fulfillment-dialogs';
import { PackingComponent, PickingComponent, ShippingComponent } from './operations-pages';
import { OrderDetailComponent, OrdersComponent } from './orders-pages';

/**
 * Remote boundary: `wms-fulfillment` — one order lifecycle across orders, picking,
 * packing and shipping; "Outbound" is the orders view filtered to in-flight stages
 * (docs/MICROFRONTEND.md §2).
 */
@NgModule({
  declarations: [
    OrdersComponent,
    OrderDetailComponent,
    PickingComponent,
    PackingComponent,
    ShippingComponent,
    OrderDialogComponent,
    AssignDialogComponent,
    PickDialogComponent,
    PackDialogComponent,
    ShipDialogComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'orders', component: OrdersComponent, canActivate: [PermissionGuard], data: { permission: 'orders:view', mode: 'orders' }, title: 'Orders · WMS360' },
      { path: 'orders/:id', component: OrderDetailComponent, canActivate: [PermissionGuard], data: { permission: 'orders:view' }, title: 'Order · WMS360' },
      { path: 'outbound', component: OrdersComponent, canActivate: [PermissionGuard], data: { permission: 'orders:view', mode: 'outbound' }, title: 'Outbound · WMS360' },
      { path: 'picking', component: PickingComponent, canActivate: [PermissionGuard], data: { permission: 'picking:view' }, title: 'Picking · WMS360' },
      { path: 'packing', component: PackingComponent, canActivate: [PermissionGuard], data: { permission: 'packing:view' }, title: 'Packing · WMS360' },
      { path: 'shipping', component: ShippingComponent, canActivate: [PermissionGuard], data: { permission: 'shipping:view' }, title: 'Shipping · WMS360' },
    ]),
  ],
})
export class FulfillmentModule {}
