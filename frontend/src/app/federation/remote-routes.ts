import { Type } from '@angular/core';
import { Routes } from '@angular/router';

import { AuthGuard } from '@wms/core';
import REMOTES from '../../../federation.remotes.json';
import { RemoteUnavailableModule } from '../layout/status-pages.component';
import { domain } from '../shell.routes';
import { loadRemoteModule } from './remote-loader';

/**
 * One route per remote in federation.remotes.json. `canLoad` keeps signed-out users from
 * downloading remote code. A remote that fails to load shows the "unavailable" page in
 * place, and the shell and the other remotes keep working.
 */
export const REMOTE_ROUTES: Routes = REMOTES.map((remote) => ({
  matcher: domain(...remote.roots),
  canLoad: [AuthGuard],
  loadChildren: () =>
    loadRemoteModule<Record<string, Type<unknown> | undefined>>(remote.name)
      .then((m) => {
        const module = m[remote.module];
        if (!module) throw new Error(`Remote "${remote.name}" does not expose ${remote.module}`);
        return module;
      })
      .catch((error: unknown): Type<unknown> => {
        console.error(`[federation] remote "${remote.name}" failed to load`, error);
        return RemoteUnavailableModule;
      }),
}));
