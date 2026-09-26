import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { PermissionGuard } from '@wms/core';
import { SharedModule } from '@wms/design-system';
import { InboundDetailComponent, InboundDialogComponent, InboundListComponent } from './inbound-pages';

/** Remote boundary: `wms-inbound` (docs/MICROFRONTEND.md §2). */
@NgModule({
  declarations: [InboundListComponent, InboundDetailComponent, InboundDialogComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([
      { path: 'inbound', component: InboundListComponent, canActivate: [PermissionGuard], data: { permission: 'inbound:view' }, title: 'Inbound · WMS360' },
      { path: 'inbound/:id', component: InboundDetailComponent, canActivate: [PermissionGuard], data: { permission: 'inbound:view' }, title: 'Inbound shipment · WMS360' },
    ]),
  ],
})
export class InboundModule {}
