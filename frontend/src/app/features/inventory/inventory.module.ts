import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@core/auth/guards';
import { SharedModule } from '@shared/shared.module';
import { AdjustDialogComponent, BalancesDialogComponent, TransferDialogComponent } from './inventory-dialogs';
import { InventoryComponent, MovementsComponent, TransferDetailComponent, TransfersComponent } from './inventory-pages';

/** Remote boundary: `wms-inventory` — stock truth, including transfers (docs/MICROFRONTEND.md §2). */
@NgModule({
  declarations: [
    InventoryComponent,
    MovementsComponent,
    TransfersComponent,
    TransferDetailComponent,
    BalancesDialogComponent,
    AdjustDialogComponent,
    TransferDialogComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'inventory', component: InventoryComponent, canActivate: [PermissionGuard], data: { permission: 'inventory:view' }, title: 'Inventory · WMS360' },
      { path: 'inventory/movements', component: MovementsComponent, canActivate: [PermissionGuard], data: { permission: 'inventory:view' }, title: 'Movements · WMS360' },
      { path: 'transfers', component: TransfersComponent, canActivate: [PermissionGuard], data: { permission: 'transfers:view' }, title: 'Stock transfers · WMS360' },
      { path: 'transfers/:id', component: TransferDetailComponent, canActivate: [PermissionGuard], data: { permission: 'transfers:view' }, title: 'Transfer · WMS360' },
    ]),
  ],
})
export class InventoryModule {}
