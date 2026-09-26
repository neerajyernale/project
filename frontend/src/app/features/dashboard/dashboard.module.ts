import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@wms/core';
import { SharedModule } from '@wms/design-system';
import { DashboardComponent } from './dashboard.component';

/** Remote boundary: `wms-dashboard` (docs/MICROFRONTEND.md §2). */
@NgModule({
  declarations: [DashboardComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'dashboard', component: DashboardComponent, canActivate: [PermissionGuard], data: { permission: 'dashboard:view' }, title: 'Dashboard · WMS360' },
    ]),
  ],
})
export class DashboardModule {}
