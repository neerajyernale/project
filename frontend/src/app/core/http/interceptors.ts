import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, throwError, timer } from 'rxjs';
import { catchError, retry, switchMap } from 'rxjs/operators';

import { ApiError, toApiError } from '@core/api/api-error';
import { AuthSession, SKIP_AUTH } from '@core/auth/auth-session.service';
import { AppConfigService } from '@core/config/app-config.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { uuid } from '@core/util/ids';

/*
 * The HTTP pipeline, in order (ARCHITECTURE §3.4):
 *   1 correlation → 2 auth (+single-flight refresh) → 3 warehouse context → 4 retry + error mapping
 */

const isApi = (req: HttpRequest<unknown>, config: AppConfigService) => {
  const base = config.value.apiBaseUrl;
  return req.url.startsWith(base) || req.url.includes(`${base}/`);
};

/** 1. Tags every API call with an X-Correlation-Id for tracing across logs. */
@Injectable()
export class CorrelationInterceptor implements HttpInterceptor {
  constructor(private readonly config: AppConfigService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!isApi(req, this.config) || req.headers.has('X-Correlation-Id')) return next.handle(req);
    return next.handle(req.clone({ setHeaders: { 'X-Correlation-Id': uuid() } }));
  }
}

/** 2. Attaches the in-memory token; on 401 refreshes once (shared by concurrent calls) and retries. */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private readonly session: AuthSession,
    private readonly config: AppConfigService,
    private readonly router: Router,
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!isApi(req, this.config) || req.context.get(SKIP_AUTH)) return next.handle(req);
    return next.handle(this.withToken(req, this.session.token)).pipe(
      catchError((err: unknown) => {
        if (!(err instanceof ApiError) || err.status !== 401 || !this.session.isAuthenticated) return throwError(() => err);
        return this.session.refresh().pipe(
          catchError((refreshErr: unknown) => {
            this.session.expire();
            void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
            return throwError(() => toApiError(refreshErr));
          }),
          switchMap((token) => next.handle(this.withToken(req, token))),
        );
      }),
    );
  }

  private withToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
    return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  }
}

/** 3. Sends the active warehouse; the tenant is never sent — it comes from the token. */
@Injectable()
export class WarehouseContextInterceptor implements HttpInterceptor {
  constructor(private readonly context: WarehouseContext, private readonly config: AppConfigService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const id = this.context.activeId;
    if (!id || !isApi(req, this.config) || req.headers.has('X-Warehouse-Id')) return next.handle(req);
    return next.handle(req.clone({ setHeaders: { 'X-Warehouse-Id': id } }));
  }
}

/** 4. Retries idempotent GETs on network/5xx (max 2, backoff), then maps errors to ApiError. */
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  constructor(private readonly config: AppConfigService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!isApi(req, this.config)) return next.handle(req);
    const correlationId = req.headers.get('X-Correlation-Id');
    const retryable = (e: unknown) => e instanceof HttpErrorResponse && (e.status === 0 || e.status >= 500);
    return next.handle(req).pipe(
      retry({
        count: req.method === 'GET' ? 2 : 0,
        delay: (e: unknown, attempt: number) => (retryable(e) ? timer(300 * 2 ** (attempt - 1)) : throwError(() => e)),
      }),
      catchError((e: unknown) => throwError(() => toApiError(e, correlationId))),
    );
  }
}
