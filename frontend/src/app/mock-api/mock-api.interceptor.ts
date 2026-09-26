import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, defer, from, of, throwError, timer } from 'rxjs';
import { mergeMap, shareReplay } from 'rxjs/operators';

import { AppConfigService } from '@core/config/app-config.service';
import type { MockServer } from './mock-server';

/**
 * Serves `/api/v1/**` from the in-browser mock server when `useMockApi` is on.
 * Registered last, so every real interceptor (auth, correlation, errors) runs first,
 * exactly as it would against the Spring Boot API. The mock (seed data and all) is
 * loaded on first use as its own chunk, so builds that talk to the real API never download it.
 */
@Injectable()
export class MockApiInterceptor implements HttpInterceptor {
  private server$: Observable<MockServer> | null = null;

  constructor(private readonly config: AppConfigService) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const { useMockApi, apiBaseUrl, mockLatencyMs } = this.config.value;
    const url = new URL(req.urlWithParams, window.location.origin);
    if (!useMockApi || !url.pathname.startsWith(apiBaseUrl)) return next.handle(req);

    this.server$ ??= defer(() => from(import('./mock-api').then((m) => m.browserServer()))).pipe(shareReplay(1));

    return this.server$.pipe(
      mergeMap((server) => {
        const res = server.handle({
          method: req.method,
          path: url.pathname.slice(apiBaseUrl.length) || '/',
          query: url.searchParams,
          body: req.body,
          header: (name) => req.headers.get(name),
        });
        // Reads are quick; writes a little slower, like a real round trip that touches the DB.
        const latency = req.method === 'GET' ? mockLatencyMs : Math.round(mockLatencyMs * 1.6);
        return timer(latency).pipe(
          mergeMap(() => {
            if (res.status >= 400) {
              return throwError(
                () =>
                  new HttpErrorResponse({
                    status: res.status,
                    statusText: String(res.status),
                    error: res.body,
                    url: req.url,
                    headers: req.headers.set('Content-Type', 'application/problem+json'),
                  }),
              );
            }
            return of(new HttpResponse({ status: res.status, body: res.body, url: req.url }));
          }),
        );
      }),
    );
  }
}
