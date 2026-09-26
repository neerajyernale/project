import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@core/auth/guards';
import { SharedModule } from '@shared/shared.module';
import { BinDialogComponent, WarehouseFormDialogComponent, ZoneDialogComponent } from './warehouse-dialogs';
import { WarehouseDetailComponent } from './warehouse-detail.component';
import { WarehouseListComponent } from './warehouse-list.component';
import {
  WarehouseActivityComponent,
  WarehouseBinsComponent,
  WarehouseInventoryComponent,
  WarehouseOrdersComponent,
  WarehouseOverviewComponent,
  WarehousePerformanceComponent,
  WarehouseZonesComponent,
} from './warehouse-tabs';

/** Remote boundary: `wms-warehouse` (docs/MICROFRONTEND.md §2). */
@NgModule({
  declarations: [
    WarehouseListComponent,
    WarehouseDetailComponent,
    WarehouseOverviewComponent,
    WarehouseZonesComponent,
    WarehouseBinsComponent,
    WarehouseInventoryComponent,
    WarehouseOrdersComponent,
    WarehouseActivityComponent,
    WarehousePerformanceComponent,
    WarehouseFormDialogComponent,
    ZoneDialogComponent,
    BinDialogComponent,
  ],
  imports: [
    SharedModule,
    RouterModule.forChild([
      {
        path: 'warehouses',
        canActivate: [PermissionGuard],
        data: { permission: 'warehouses:view' },
        children: [
          { path: '', component: WarehouseListComponent, title: 'Warehouses · WMS360' },
          {
            path: ':id',
            component: WarehouseDetailComponent,
            title: 'Warehouse · WMS360',
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'overview' },
              { path: 'overview', component: WarehouseOverviewComponent },
              { path: 'zones', component: WarehouseZonesComponent },
              { path: 'bins', component: WarehouseBinsComponent },
              { path: 'inventory', component: WarehouseInventoryComponent, canActivate: [PermissionGuard], data: { permission: 'inventory:view' } },
              { path: 'orders', component: WarehouseOrdersComponent, canActivate: [PermissionGuard], data: { permission: 'orders:view' } },
              { path: 'activity', component: WarehouseActivityComponent },
              { path: 'performance', component: WarehousePerformanceComponent, canActivate: [PermissionGuard], data: { permission: 'dashboard:view' } },
            ],
          },
        ],
      },
    ]),
  ],
})
export class WarehouseModule {}
