import { HttpClient, HttpContext, HttpContextToken } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, tap } from 'rxjs/operators';

import { AppConfigService } from '../config/app-config.service';
import { LoginRequest, SessionUser, TokenResponse } from '../models';

/** Requests marked with this skip the auth interceptor (login/refresh/logout themselves). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

export type SessionEndReason = 'signed-out' | 'expired';

/**
 * The one authentication state for the app (docs/MICROFRONTEND.md §5: `AuthSession`).
 * The access token lives in memory only; the refresh token is an HttpOnly cookie the
 * app never sees. Remotes read `user$` and `can()`; only the shell logs in or out.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly userSubject = new BehaviorSubject<SessionUser | null>(null);
  readonly user$ = this.userSubject.asObservable();
  private readonly endedSubject = new BehaviorSubject<SessionEndReason | null>(null);
  /** Why the last session ended; the login page shows a message for 'expired'. */
  readonly ended$ = this.endedSubject.asObservable();

  private accessToken: string | null = null;
  private refreshInFlight$: Observable<string> | null = null;

  constructor(private readonly http: HttpClient, private readonly config: AppConfigService) {}

  get user(): SessionUser | null {
    return this.userSubject.value;
  }

  get token(): string | null {
    return this.accessToken;
  }

  get isAuthenticated(): boolean {
    return !!this.userSubject.value;
  }

  can(permission: string | string[]): boolean {
    const perms = this.userSubject.value?.permissions ?? [];
    return Array.isArray(permission) ? permission.some((p) => perms.includes(p)) : perms.includes(permission);
  }

  /** Warehouses the user is limited to; empty means all. */
  get warehouseScope(): string[] {
    return this.userSubject.value?.warehouseIds ?? [];
  }

  login(req: LoginRequest): Observable<SessionUser> {
    return this.http.post<TokenResponse>(`${this.api}/auth/login`, req, { context: this.skipAuth() }).pipe(
      tap((res) => this.accept(res)),
      map((res) => res.user),
    );
  }

  /**
   * Single-flight refresh: concurrent 401s share one refresh call (ARCHITECTURE §3.4).
   * Emits the new access token or errors when the session cannot be renewed.
   */
  refresh(): Observable<string> {
    if (!this.refreshInFlight$) {
      this.refreshInFlight$ = this.http.post<TokenResponse>(`${this.api}/auth/refresh`, {}, { context: this.skipAuth() }).pipe(
        tap((res) => this.accept(res)),
        map((res) => res.accessToken),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.refreshInFlight$;
  }

  /** Called once at startup: resumes a session from the refresh cookie if there is one. */
  restore(): Promise<void> {
    return new Promise((resolve) => {
      this.refresh()
        .pipe(catchError(() => of(null)))
        .subscribe({ complete: () => resolve() });
    });
  }

  /** Re-reads the current user (permissions may change when an admin edits a role). */
  reloadUser(): Observable<SessionUser> {
    return this.http.get<SessionUser>(`${this.api}/auth/me`).pipe(tap((u) => this.userSubject.next(u)));
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/logout`, {}, { context: this.skipAuth(), headers: this.bearer() }).pipe(
      catchError(() => of(undefined)),
      finalize(() => this.clear('signed-out')),
    );
  }

  /** The server rejected our credentials and refresh failed. */
  expire(): void {
    if (this.userSubject.value) this.clear('expired');
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/change-password`, { currentPassword, newPassword });
  }

  private accept(res: TokenResponse): void {
    this.accessToken = res.accessToken;
    this.endedSubject.next(null);
    this.userSubject.next(res.user);
  }

  private clear(reason: SessionEndReason): void {
    this.accessToken = null;
    // Reason first, so user$ subscribers can read it when the user becomes null.
    this.endedSubject.next(reason);
    this.userSubject.next(null);
  }

  get endReason(): SessionEndReason | null {
    return this.endedSubject.value;
  }

  private bearer(): Record<string, string> {
    return this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {};
  }

  private skipAuth(): HttpContext {
    return new HttpContext().set(SKIP_AUTH, true);
  }

  private get api(): string {
    return this.config.value.apiBaseUrl;
  }
}
