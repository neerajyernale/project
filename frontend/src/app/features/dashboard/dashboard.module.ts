import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@core/auth/guards';
import { SharedModule } from '@shared/shared.module';
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
