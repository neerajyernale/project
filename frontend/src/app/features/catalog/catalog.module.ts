import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@core/auth/guards';
import { SharedModule } from '@shared/shared.module';
import { PartnerDialogComponent, ProductDialogComponent } from './catalog-dialogs';
import { PartnersComponent } from './partners.component';
import { ProductsComponent } from './products.component';

/** Remote boundary: `wms-catalog` (docs/MICROFRONTEND.md §2). */
@NgModule({
  declarations: [ProductsComponent, PartnersComponent, ProductDialogComponent, PartnerDialogComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'products', component: ProductsComponent, canActivate: [PermissionGuard], data: { permission: 'catalog:view' }, title: 'Products · WMS360' },
      { path: 'suppliers', component: PartnersComponent, canActivate: [PermissionGuard], data: { permission: 'catalog:view', kind: 'supplier' }, title: 'Suppliers · WMS360' },
      { path: 'customers', component: PartnersComponent, canActivate: [PermissionGuard], data: { permission: 'catalog:view', kind: 'customer' }, title: 'Customers · WMS360' },
    ]),
  ],
})
export class CatalogModule {}
