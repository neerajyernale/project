import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@core/auth/guards';
import { SharedModule } from '@shared/shared.module';
import { RolesComponent } from './roles.component';
import { SettingsComponent, UnsavedSettingsGuard } from './settings.component';
import { UserDialogComponent, UsersComponent } from './users.component';

/** Remote boundary: `wms-admin` — security-sensitive, separate reviewers (docs/MICROFRONTEND.md §2). */
@NgModule({
  declarations: [UsersComponent, UserDialogComponent, RolesComponent, SettingsComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'admin', pathMatch: 'full', redirectTo: 'admin/users' },
      { path: 'admin/users', component: UsersComponent, canActivate: [PermissionGuard], data: { permission: 'users:view' }, title: 'Users · WMS360' },
      { path: 'admin/roles', component: RolesComponent, canActivate: [PermissionGuard], data: { permission: 'users:view' }, title: 'Roles · WMS360' },
      {
        path: 'settings',
        component: SettingsComponent,
        canActivate: [PermissionGuard],
        canDeactivate: [UnsavedSettingsGuard],
        data: { permission: 'settings:view' },
        title: 'Settings · WMS360',
      },
    ]),
  ],
})
export class AdminModule {}
