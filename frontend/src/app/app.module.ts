import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { APP_INITIALIZER, ErrorHandler, Injectable, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Router } from '@angular/router';

import { AuthSession } from '@core/auth/auth-session.service';
import { AppConfigService } from '@core/config/app-config.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { AuthInterceptor, CorrelationInterceptor, ErrorInterceptor, WarehouseContextInterceptor } from '@core/http/interceptors';
import { SharedModule } from '@shared/shared.module';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { LoginComponent } from './features/auth/login.component';
import { ShellComponent } from './layout/shell.component';
import { SidebarComponent } from './layout/sidebar.component';
import { ForbiddenComponent, NotFoundComponent, UnavailableComponent } from './layout/status-pages.component';
import { ChangePasswordDialogComponent, ShortcutsDialogComponent, TopbarComponent } from './layout/topbar.component';
import { MockApiInterceptor } from './mock-api/mock-api.interceptor';

/** Config first, then resume any session from the refresh cookie, then the warehouse list. */
export function initialize(config: AppConfigService, session: AuthSession, context: WarehouseContext): () => Promise<void> {
  return async () => {
    await config.load();
    await session.restore();
    if (session.isAuthenticated) await context.load();
  };
}

/** A lazy domain bundle that fails to load shows /unavailable instead of a blank page. */
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

@NgModule({
  declarations: [
    AppComponent,
    ShellComponent,
    SidebarComponent,
    TopbarComponent,
    ChangePasswordDialogComponent,
    ShortcutsDialogComponent,
    LoginComponent,
    ForbiddenComponent,
    NotFoundComponent,
    UnavailableComponent,
  ],
  imports: [BrowserModule, HttpClientModule, SharedModule, AppRoutingModule],
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
  bootstrap: [AppComponent],
})
export class AppModule {}
