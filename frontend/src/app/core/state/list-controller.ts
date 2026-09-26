import { ActivatedRoute, Params, Router } from '@angular/router';
import { BehaviorSubject, NEVER, Observable, Subject, combineLatest, merge, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, shareReplay, skip, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { ApiError, toApiError } from '@core/api/api-error';
import { QueryParams } from '@core/api/api-client';
import { Page } from '@core/models';

/** The page-state contract (ARCHITECTURE §3.3): a data page renders exactly one of these. */
export type ViewStatus = 'loading' | 'ready' | 'empty' | 'no-results' | 'error' | 'forbidden' | 'offline';

export interface ListState<T> {
  status: ViewStatus;
  /** Last loaded page; kept while a newer request loads so the table does not flash. */
  page: Page<T> | null;
  error: ApiError | null;
  refreshing: boolean;
}

export interface ListQueryState {
  q: string;
  page: number;
  size: number;
  sort: string;
  filters: Record<string, string>;
}

export interface ListControllerOptions {
  size?: number;
  sort?: string;
  /** Filter keys that are fixed by the page (not user filters, not synced to the URL). */
  fixed?: Record<string, string>;
  /** Emits when data must reload for outside reasons, e.g. the active warehouse changed. */
  reload$?: Observable<unknown>;
  /** Sync q/filters/page/sort to the URL so views can be linked and survive refresh. */
  route?: { router: Router; route: ActivatedRoute };
  destroy$?: Observable<unknown>;
}

export function statusOf(err: ApiError): ViewStatus {
  if (err.isOffline) return 'offline';
  if (err.isForbidden) return 'forbidden';
  return 'error';
}

/**
 * Drives one list page: search (debounced; a newer query cancels the older request via
 * switchMap), filters, paging, sorting, reload, and the resulting ListState.
 */
export class ListController<T> {
  private readonly querySubject: BehaviorSubject<ListQueryState>;
  private readonly searchInput = new Subject<string>();
  private readonly refreshSubject = new Subject<void>();
  private lastPage: Page<T> | null = null;

  readonly query$: Observable<ListQueryState>;
  readonly state$: Observable<ListState<T>>;

  constructor(private readonly fetch: (params: QueryParams) => Observable<Page<T>>, private readonly options: ListControllerOptions = {}) {
    this.querySubject = new BehaviorSubject<ListQueryState>(this.initialQuery());
    this.query$ = this.querySubject.asObservable();

    this.searchInput
      .pipe(debounceTime(300), map((q) => q.trim()), distinctUntilChanged(), takeUntil(options.destroy$ ?? new Subject()))
      .subscribe((q) => this.patch({ q, page: 0 }));

    if (options.route) {
      this.querySubject.pipe(skip(1), takeUntil(options.destroy$ ?? new Subject())).subscribe((q) => this.writeUrl(q));
    }

    const trigger$ = combineLatest([
      this.querySubject,
      // NEVER, not of(null): the default must not emit, or the first request is sent twice.
      merge(options.reload$ ?? NEVER, this.refreshSubject).pipe(startWith(null)),
    ]);

    this.state$ = trigger$.pipe(
      switchMap(([q]) =>
        this.fetch(this.toParams(q)).pipe(
          map((page): ListState<T> => {
            this.lastPage = page;
            const status: ViewStatus = page.totalElements > 0 ? 'ready' : this.hasUserFilters(q) ? 'no-results' : 'empty';
            return { status, page, error: null, refreshing: false };
          }),
          catchError((e: unknown) => {
            const error = toApiError(e);
            return of<ListState<T>>({ status: statusOf(error), page: null, error, refreshing: false });
          }),
          startWith<ListState<T>>(
            this.lastPage
              ? { status: 'ready', page: this.lastPage, error: null, refreshing: true }
              : { status: 'loading', page: null, error: null, refreshing: true },
          ),
        ),
      ),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  get query(): ListQueryState {
    return this.querySubject.value;
  }

  search(text: string): void {
    this.searchInput.next(text);
  }

  setFilter(key: string, value: string | null | undefined): void {
    const filters = { ...this.query.filters };
    if (value) filters[key] = value;
    else delete filters[key];
    this.patch({ filters, page: 0 });
  }

  filter(key: string): string {
    return this.query.filters[key] ?? '';
  }

  setPage(page: number): void {
    this.patch({ page });
  }

  setSize(size: number): void {
    this.patch({ size, page: 0 });
  }

  /** Toggle sort on a field: asc → desc → asc. */
  sortBy(field: string): void {
    const [current, dir] = this.query.sort.split(',');
    this.patch({ sort: `${field},${current === field && dir === 'asc' ? 'desc' : 'asc'}`, page: 0 });
  }

  sortDir(field: string): 'asc' | 'desc' | null {
    const [current, dir] = this.query.sort.split(',');
    return current === field ? (dir as 'asc' | 'desc') : null;
  }

  clear(): void {
    this.patch({ q: '', filters: {}, page: 0 });
  }

  reload(): void {
    this.refreshSubject.next();
  }

  get hasFilters(): boolean {
    return this.hasUserFilters(this.query);
  }

  private patch(p: Partial<ListQueryState>): void {
    this.querySubject.next({ ...this.query, ...p });
  }

  private hasUserFilters(q: ListQueryState): boolean {
    return !!q.q || Object.keys(q.filters).length > 0;
  }

  private toParams(q: ListQueryState): QueryParams {
    return { ...q.filters, ...(this.options.fixed ?? {}), q: q.q, page: q.page, size: q.size, sort: q.sort };
  }

  private initialQuery(): ListQueryState {
    const base: ListQueryState = { q: '', page: 0, size: this.options.size ?? 25, sort: this.options.sort ?? '', filters: {} };
    const params: Params = this.options.route?.route.snapshot.queryParams ?? {};
    const filters: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (['q', 'page', 'size', 'sort'].includes(k) || typeof v !== 'string' || !v) continue;
      filters[k] = v;
    }
    return {
      q: typeof params['q'] === 'string' ? params['q'] : base.q,
      page: Number(params['page'] ?? 0) || 0,
      size: Number(params['size'] ?? base.size) || base.size,
      sort: typeof params['sort'] === 'string' ? params['sort'] : base.sort,
      filters,
    };
  }

  private writeUrl(q: ListQueryState): void {
    const r = this.options.route;
    if (!r) return;
    const queryParams: Params = { ...q.filters, q: q.q || null, page: q.page || null, size: q.size !== (this.options.size ?? 25) ? q.size : null, sort: q.sort !== (this.options.sort ?? '') ? q.sort : null };
    // Remove filters that were cleared.
    for (const k of Object.keys(r.route.snapshot.queryParams)) if (!(k in queryParams)) queryParams[k] = null;
    void r.router.navigate([], { relativeTo: r.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true });
  }
}

/** Single-resource loader with the same state contract (detail pages). */
export interface ResourceState<T> {
  status: ViewStatus;
  data: T | null;
  error: ApiError | null;
}

export function loadResource<T>(source: Observable<T>): Observable<ResourceState<T>> {
  return source.pipe(
    map((data): ResourceState<T> => ({ status: 'ready', data, error: null })),
    catchError((e: unknown) => {
      const error = toApiError(e);
      return of<ResourceState<T>>({ status: error.status === 404 ? 'empty' : statusOf(error), data: null, error });
    }),
    startWith<ResourceState<T>>({ status: 'loading', data: null, error: null }),
  );
}
