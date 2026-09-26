import { NgModule } from '@angular/core';
import { RouterModule, Routes, UrlMatcher, UrlSegment } from '@angular/router';

import { AuthGuard, GuestGuard } from '@core/auth/guards';
import { LoginComponent } from './features/auth/login.component';
import { ShellComponent } from './layout/shell.component';
import { ForbiddenComponent, NotFoundComponent, UnavailableComponent } from './layout/status-pages.component';

/**
 * Matches when the first URL segment is one of `roots`, consuming nothing, so the domain
 * module sees the full path. One lazy module per domain = one future federated remote
 * (docs/MICROFRONTEND.md §2), while URLs stay flat like the prototype's navigation.
 */
export function domain(...roots: string[]): UrlMatcher {
  return (segments: UrlSegment[]) => (segments.length && roots.includes(segments[0].path) ? { consumed: [] } : null);
}

const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [GuestGuard], title: 'Sign in · WMS360' },
  {
    path: '',
    component: ShellComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { matcher: domain('dashboard'), loadChildren: () => import('./features/dashboard/dashboard.module').then((m) => m.DashboardModule) },
      { matcher: domain('warehouses'), loadChildren: () => import('./features/warehouse/warehouse.module').then((m) => m.WarehouseModule) },
      { matcher: domain('products', 'suppliers', 'customers'), loadChildren: () => import('./features/catalog/catalog.module').then((m) => m.CatalogModule) },
      { matcher: domain('inventory', 'transfers'), loadChildren: () => import('./features/inventory/inventory.module').then((m) => m.InventoryModule) },
      { matcher: domain('inbound'), loadChildren: () => import('./features/inbound/inbound.module').then((m) => m.InboundModule) },
      {
        matcher: domain('orders', 'outbound', 'picking', 'packing', 'shipping'),
        loadChildren: () => import('./features/fulfillment/fulfillment.module').then((m) => m.FulfillmentModule),
      },
      { matcher: domain('reports'), loadChildren: () => import('./features/reports/reports.module').then((m) => m.ReportsModule) },
      { matcher: domain('admin', 'settings'), loadChildren: () => import('./features/admin/admin.module').then((m) => m.AdminModule) },
      { path: 'forbidden', component: ForbiddenComponent, title: 'No access · WMS360' },
      { path: 'unavailable', component: UnavailableComponent, title: 'Unavailable · WMS360' },
      { path: '**', component: NotFoundComponent, title: 'Not found · WMS360' },
    ],
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, {
      scrollPositionRestoration: 'top',
      paramsInheritanceStrategy: 'always',
    }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
