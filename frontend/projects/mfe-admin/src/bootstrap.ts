import { enableProdMode, NgModule } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { RouterModule } from '@angular/router';

import { AppComponent } from '../../../src/app/app.component';
import { domain, ROUTER_OPTIONS, shellRoutes } from '../../../src/app/shell.routes';
import { ShellCoreModule } from '../../../src/app/shell-core.module';
import { environment } from '../../../src/environments/environment';

/**
 * Standalone dev harness for the `admin` remote (`ng serve mfe-admin`): the shell's
 * sign-in and layout around this one domain, loaded locally. The shell never loads this
 * file; it loads `./Module` from remoteEntry.js.
 */
@NgModule({
  imports: [
    ShellCoreModule,
    RouterModule.forRoot(
      shellRoutes(
        [{ matcher: domain('admin', 'settings'), loadChildren: () => import('../../../src/app/features/admin/admin.module').then((m) => m.AdminModule) }],
        'admin',
      ),
      ROUTER_OPTIONS,
    ),
  ],
  bootstrap: [AppComponent],
})
export class AdminDevModule {}

if (environment.production) {
  enableProdMode();
}

platformBrowserDynamic()
  .bootstrapModule(AdminDevModule)
  .catch((err: unknown) => console.error(err));
