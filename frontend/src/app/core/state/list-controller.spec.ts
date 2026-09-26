import { fakeAsync, tick } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';

import { ApiError } from '@core/api/api-error';
import { QueryParams } from '@core/api/api-client';
import { Page } from '@core/models';
import { ListController, ListState } from './list-controller';

const page = <T>(content: T[], total = content.length): Page<T> => ({ content, page: 0, size: 25, totalElements: total, totalPages: 1 });

describe('ListController', () => {
  it('reports ready, empty and no-results correctly', () => {
    const calls: QueryParams[] = [];
    let result: Page<string> = page(['a']);
    const list = new ListController<string>((p) => {
      calls.push(p);
      return of(result);
    });
    const states: ListState<string>[] = [];
    const sub = list.state$.subscribe((s) => states.push(s));

    expect(states[states.length - 1].status).toBe('ready');

    result = page([]);
    list.reload();
    expect(states[states.length - 1].status).toBe('empty');

    list.setFilter('status', 'CREATED');
    expect(states[states.length - 1].status).toBe('no-results');
    expect(calls[calls.length - 1]['status']).toBe('CREATED');
    expect(calls[calls.length - 1]['page']).toBe(0);
    sub.unsubscribe();
  });

  it('maps errors to page states', () => {
    const forbidden = new ListController<string>(() => throwError(() => new ApiError(403, 'Forbidden', 'No')));
    const offline = new ListController<string>(() => throwError(() => new ApiError(0, 'Offline', '')));
    let a: ListState<string> | undefined;
    let b: ListState<string> | undefined;
    forbidden.state$.subscribe((s) => (a = s)).unsubscribe();
    offline.state$.subscribe((s) => (b = s)).unsubscribe();
    expect(a?.status).toBe('forbidden');
    expect(b?.status).toBe('offline');
  });

  it('debounces search and cancels the older request', fakeAsync(() => {
    const requests: { q: unknown; done: Subject<Page<string>> }[] = [];
    const list = new ListController<string>((p): Observable<Page<string>> => {
      const done = new Subject<Page<string>>();
      requests.push({ q: p['q'], done });
      return done;
    });
    let last: ListState<string> | undefined;
    const sub = list.state$.subscribe((s) => (last = s));

    list.search('ke');
    list.search('key');
    tick(300);
    // One initial request + one debounced search, not one per keystroke.
    expect(requests.map((r) => r.q)).toEqual(['', 'key']);

    // The stale first response arrives late and must be ignored.
    requests[0].done.next(page(['stale']));
    requests[1].done.next(page(['fresh']));
    expect(last?.page?.content).toEqual(['fresh']);
    sub.unsubscribe();
  }));

  it('toggles sort direction', () => {
    const list = new ListController<string>(() => of(page([])), { sort: 'code,asc' });
    list.sortBy('code');
    expect(list.sortDir('code')).toBe('desc');
    list.sortBy('name');
    expect(list.sortDir('name')).toBe('asc');
    expect(list.sortDir('code')).toBeNull();
  });
});
