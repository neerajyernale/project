import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { APP_INITIALIZER, ErrorHandler, Injectable, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Router } from '@angular/router';

import {
  AppConfigService,
  AuthInterceptor,
  AuthSession,
  CorrelationInterceptor,
  ErrorInterceptor,
  WarehouseContext,
  WarehouseContextInterceptor,
} from '@wms/core';
import { SharedModule } from '@wms/design-system';
import { AppComponent } from './app.component';
import { AccountLinkComponent } from './features/auth/account-link.component';
import { LoginComponent } from './features/auth/login.component';
import { ShellComponent } from './layout/shell.component';
import { SidebarComponent } from './layout/sidebar.component';
import { ForbiddenComponent, NotFoundComponent, UnavailablePageModule } from './layout/status-pages.component';
import { ChangePasswordDialogComponent, MfaDialogComponent, ShortcutsDialogComponent, TopbarComponent } from './layout/topbar.component';
import { MockApiInterceptor } from './mock-api/mock-api.interceptor';

/** Config first, then resume any session from the refresh cookie, then the warehouse list. */
export function initialize(config: AppConfigService, session: AuthSession, context: WarehouseContext): () => Promise<void> {
  return async () => {
    await config.load();
    await session.restore();
    if (session.isAuthenticated) await context.load();
  };
}

/** A chunk that fails to load mid-session shows /unavailable instead of a blank page. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private readonly router: Router) {}

  handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (/Loading chunk [\w-]+ failed|ChunkLoadError/.test(message)) {
      void this.router.navigate(['/unavailable']);
      return;
    }
    console.error(error);
  }
}

/**
 * Everything the shell owns except its routes: layout, sign-in, status pages, and the one
 * HttpClient with its interceptors (remotes import HttpClientModule nowhere).
 * Used by the shell (AppModule) and by each remote's standalone dev bootstrap.
 */
@NgModule({
  declarations: [
    AppComponent,
    ShellComponent,
    SidebarComponent,
    TopbarComponent,
    ChangePasswordDialogComponent,
    MfaDialogComponent,
    ShortcutsDialogComponent,
    LoginComponent,
    AccountLinkComponent,
    ForbiddenComponent,
    NotFoundComponent,
  ],
  imports: [BrowserModule, HttpClientModule, SharedModule, UnavailablePageModule],
  providers: [
    { provide: APP_INITIALIZER, useFactory: initialize, deps: [AppConfigService, AuthSession, WarehouseContext], multi: true },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // Order matters: correlation → auth → warehouse → error mapping → (mock server, dev only)
    { provide: HTTP_INTERCEPTORS, useClass: CorrelationInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: WarehouseContextInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: MockApiInterceptor, multi: true },
  ],
})
export class ShellCoreModule {}
