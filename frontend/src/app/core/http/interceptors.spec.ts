import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { ApiError } from '../api/api-error';
import { AuthSession } from '../auth/auth-session.service';
import { AuthInterceptor, CorrelationInterceptor, ErrorInterceptor, WarehouseContextInterceptor } from './interceptors';

const user = { id: 'u1', name: 'A', email: 'a@x.com', roleId: 'r', roleName: 'Admin', warehouseIds: [], status: 'ACTIVE', lastLoginAt: null, version: 1, permissions: ['orders:view'] };

describe('HTTP pipeline', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let session: AuthSession;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule.withRoutes([{ path: 'login', children: [] }])],
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: CorrelationInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: WarehouseContextInterceptor, multi: true },
        { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    session = TestBed.inject(AuthSession);
    session.login({ email: 'a@x.com', password: 'p', rememberMe: false }).subscribe();
    ctrl.expectOne('/api/v1/auth/login').flush({ accessToken: 'old', expiresIn: 900, user });
  });

  afterEach(() => ctrl.verify());

  it('attaches the token and a correlation id', () => {
    http.get('/api/v1/orders').subscribe();
    const req = ctrl.expectOne('/api/v1/orders');
    expect(req.request.headers.get('Authorization')).toBe('Bearer old');
    expect(req.request.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
    req.flush({});
  });

  it('refreshes once for concurrent 401s and retries both requests with the new token', () => {
    const results: unknown[] = [];
    http.get('/api/v1/a').subscribe((r) => results.push(r));
    http.get('/api/v1/b').subscribe((r) => results.push(r));
    ctrl.expectOne('/api/v1/a').flush({ title: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/b').flush({ title: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    const refreshes = ctrl.match('/api/v1/auth/refresh');
    expect(refreshes.length).toBe(1);
    refreshes[0].flush({ accessToken: 'new', expiresIn: 900, user });

    const a = ctrl.expectOne('/api/v1/a');
    const b = ctrl.expectOne('/api/v1/b');
    expect(a.request.headers.get('Authorization')).toBe('Bearer new');
    expect(b.request.headers.get('Authorization')).toBe('Bearer new');
    a.flush({ ok: 'a' });
    b.flush({ ok: 'b' });
    expect(results).toEqual([{ ok: 'a' }, { ok: 'b' }]);
  });

  it('ends the session when the refresh fails', () => {
    let error: unknown;
    http.get('/api/v1/a').subscribe({ error: (e) => (error = e) });
    ctrl.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/auth/refresh').flush({ title: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    expect(session.isAuthenticated).toBe(false);
    expect(session.endReason).toBe('expired');
    expect(error).toBeInstanceOf(ApiError);
  });

  it('maps problem details to ApiError with field errors', () => {
    let error: ApiError | undefined;
    http.post('/api/v1/orders', {}).subscribe({ error: (e: ApiError) => (error = e) });
    ctrl.expectOne('/api/v1/orders').flush(
      { title: 'Validation failed', status: 422, detail: 'Bad', errors: [{ field: 'customerId', code: 'invalid', message: 'Choose a customer.' }] },
      { status: 422, statusText: 'Unprocessable' },
    );
    expect(error?.isValidation).toBe(true);
    expect(error?.fieldErrors[0].field).toBe('customerId');
  });

  it('re-reads permissions after a 403, so revoked actions disappear', () => {
    http.post('/api/v1/orders/o1/allocate', {}).subscribe({ error: () => undefined });
    ctrl.expectOne('/api/v1/orders/o1/allocate').flush({ title: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    ctrl.expectOne('/api/v1/auth/me').flush({ ...user, permissions: [] });
    expect(session.can('orders:view')).toBe(false);
  });

  it('does not retry commands, but retries GETs on server errors', () => {
    jest.useFakeTimers();
    http.post('/api/v1/x', {}).subscribe({ error: () => undefined });
    ctrl.expectOne('/api/v1/x').flush({}, { status: 500, statusText: 'Error' });
    ctrl.expectNone('/api/v1/x');

    http.get('/api/v1/y').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/v1/y').flush({}, { status: 503, statusText: 'Unavailable' });
    jest.advanceTimersByTime(300);
    ctrl.expectOne('/api/v1/y').flush({ ok: true });
    jest.useRealTimers();
  });
});
