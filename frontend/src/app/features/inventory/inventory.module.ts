import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@wms/core';
import { SharedModule } from '@wms/design-system';
import { AdjustDialogComponent, BalancesDialogComponent, MoveDialogComponent, TransferDialogComponent } from './inventory-dialogs';
import { CycleCountDetailComponent, CycleCountDialogComponent, CycleCountsComponent } from './cycle-counts';
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
    MoveDialogComponent,
    TransferDialogComponent,
    CycleCountsComponent,
    CycleCountDialogComponent,
    CycleCountDetailComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'inventory', component: InventoryComponent, canActivate: [PermissionGuard], data: { permission: 'inventory:view' }, title: 'Inventory · WMS360' },
      { path: 'inventory/movements', component: MovementsComponent, canActivate: [PermissionGuard], data: { permission: 'inventory:view' }, title: 'Movements · WMS360' },
      { path: 'inventory/counts', component: CycleCountsComponent, canActivate: [PermissionGuard], data: { permission: 'inventory:view' }, title: 'Cycle counts · WMS360' },
      { path: 'inventory/counts/:id', component: CycleCountDetailComponent, canActivate: [PermissionGuard], data: { permission: 'inventory:view' }, title: 'Cycle count · WMS360' },
      { path: 'transfers', component: TransfersComponent, canActivate: [PermissionGuard], data: { permission: 'transfers:view' }, title: 'Stock transfers · WMS360' },
      { path: 'transfers/:id', component: TransferDetailComponent, canActivate: [PermissionGuard], data: { permission: 'transfers:view' }, title: 'Transfer · WMS360' },
    ]),
  ],
})
export class InventoryModule {}
