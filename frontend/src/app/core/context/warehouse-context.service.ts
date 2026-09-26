import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { AuthSession } from '@core/auth/auth-session.service';
import { AppConfigService } from '@core/config/app-config.service';
import { WarehouseStatus } from '@core/models';

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  city: string;
  status: WarehouseStatus;
}

const STORAGE_PREFIX = 'wms360.activeWarehouse.';

/**
 * The warehouse the user is working in (sidebar switcher). `null` = all warehouses.
 * Sent as `X-Warehouse-Id` on every request; lists and the dashboard follow it.
 * The choice is remembered per user in localStorage — a convenience, never security.
 */
@Injectable({ providedIn: 'root' })
export class WarehouseContext {
  private readonly optionsSubject = new BehaviorSubject<WarehouseOption[]>([]);
  private readonly activeSubject = new BehaviorSubject<string | null>(null);

  readonly options$ = this.optionsSubject.asObservable();
  readonly activeId$ = this.activeSubject.pipe(distinctUntilChanged());
  readonly active$: Observable<WarehouseOption | null> = combineLatest([this.options$, this.activeId$]).pipe(
    map(([opts, id]) => opts.find((o) => o.id === id) ?? null),
  );

  constructor(private readonly http: HttpClient, private readonly config: AppConfigService, private readonly session: AuthSession) {}

  get activeId(): string | null {
    return this.activeSubject.value;
  }

  get options(): WarehouseOption[] {
    return this.optionsSubject.value;
  }

  /** Active warehouses, for pickers in forms (live: stays correct while options load). */
  readonly activeOptions$ = this.options$.pipe(map((opts) => opts.filter((o) => o.status === 'ACTIVE')));

  /** Users limited to exactly one warehouse cannot pick "all". */
  get canChooseAll(): boolean {
    return this.session.warehouseScope.length !== 1;
  }

  /** Loads the user's warehouses and restores their last choice. Resolves when done (never rejects). */
  load(): Promise<void> {
    return new Promise((resolve) => {
      this.http.get<WarehouseOption[]>(`${this.config.value.apiBaseUrl}/warehouses/options`).subscribe({
        next: (opts) => {
          this.optionsSubject.next(opts);
          const stored = this.read();
          const valid = (id: string | null) => (id === null ? this.canChooseAll : opts.some((o) => o.id === id));
          const next = stored !== undefined && valid(stored) ? stored : this.canChooseAll ? null : opts[0]?.id ?? null;
          this.activeSubject.next(next);
          resolve();
        },
        error: () => resolve(),
      });
    });
  }

  set(id: string | null): void {
    this.activeSubject.next(id);
    try {
      const user = this.session.user;
      if (user) localStorage.setItem(STORAGE_PREFIX + user.id, id ?? '*');
    } catch {
      /* storage unavailable: the choice lasts for this tab only */
    }
  }

  clear(): void {
    this.optionsSubject.next([]);
    this.activeSubject.next(null);
  }

  name(id: string | null): string {
    return id ? this.options.find((o) => o.id === id)?.name ?? '—' : 'All warehouses';
  }

  private read(): string | null | undefined {
    try {
      const user = this.session.user;
      const v = user ? localStorage.getItem(STORAGE_PREFIX + user.id) : null;
      if (v === null) return undefined;
      return v === '*' ? null : v;
    } catch {
      return undefined;
    }
  }
}
