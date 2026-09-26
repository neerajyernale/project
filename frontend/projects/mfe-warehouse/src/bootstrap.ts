import { enableProdMode, NgModule } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { RouterModule } from '@angular/router';

import { AppComponent } from '../../../src/app/app.component';
import { domain, ROUTER_OPTIONS, shellRoutes } from '../../../src/app/shell.routes';
import { ShellCoreModule } from '../../../src/app/shell-core.module';
import { environment } from '../../../src/environments/environment';

/**
 * Standalone dev harness for the `warehouse` remote (`ng serve mfe-warehouse`): the shell's
 * sign-in and layout around this one domain, loaded locally. The shell never loads this
 * file; it loads `./Module` from remoteEntry.js.
 */
@NgModule({
  imports: [
    ShellCoreModule,
    RouterModule.forRoot(
      shellRoutes(
        [{ matcher: domain('warehouses'), loadChildren: () => import('../../../src/app/features/warehouse/warehouse.module').then((m) => m.WarehouseModule) }],
        'warehouses',
      ),
      ROUTER_OPTIONS,
    ),
  ],
  bootstrap: [AppComponent],
})
export class WarehouseDevModule {}

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic()
  .bootstrapModule(WarehouseDevModule)
  .catch((err: unknown) => console.error(err));
