import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { AppConfigService } from '../config/app-config.service';
import { uuid } from '../util/ids';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface CommandOptions {
  /** Stock-moving commands send an Idempotency-Key so a retried click is applied once. */
  idempotent?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiClient {
  constructor(private readonly http: HttpClient, private readonly config: AppConfigService) {}

  get<T>(path: string, params: QueryParams = {}): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toParams(params) });
  }

  post<T>(path: string, body: unknown = {}, options: CommandOptions = {}): Observable<T> {
    return this.http.post<T>(this.url(path), body, { headers: this.headers(options) });
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }

  private url(path: string): string {
    return `${this.config.value.apiBaseUrl}${path}`;
  }

  private headers(options: CommandOptions): HttpHeaders {
    let h = new HttpHeaders();
    if (options.idempotent) h = h.set('Idempotency-Key', uuid());
    return h;
  }
}

export function toParams(params: QueryParams): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
}
