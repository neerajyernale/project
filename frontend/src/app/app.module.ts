import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

import { AppComponent } from './app.component';
import { REMOTE_ROUTES } from './federation/remote-routes';
import { ROUTER_OPTIONS, shellRoutes } from './shell.routes';
import { ShellCoreModule } from './shell-core.module';

/** The shell: its own pages, plus one route per federated remote, loaded from the runtime manifest. */
@NgModule({
  imports: [ShellCoreModule, RouterModule.forRoot(shellRoutes(REMOTE_ROUTES), ROUTER_OPTIONS)],
  bootstrap: [AppComponent],
})
export class AppModule {}
