import { ChangeDetectionStrategy, Component, Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subject, combineLatest } from 'rxjs';
import { filter, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { loadResource, ResourceState, ToastService, Warehouse, WarehouseApi, WarehouseContext, Zone } from '@wms/core';
import { DialogService } from '@wms/design-system';
import { WarehouseFormDialogComponent } from './warehouse-dialogs';

/** One warehouse + its zones, shared by the detail page and its tab routes. */
@Injectable()
export class WarehouseDetailStore {
  private readonly reload$ = new Subject<void>();
  readonly id$: Observable<string> = this.route.paramMap.pipe(
    map((p) => p.get('id') ?? ''),
    filter(Boolean),
  );

  readonly state$: Observable<ResourceState<Warehouse>> = combineLatest([this.id$, this.reload$.pipe(startWith(null))]).pipe(
    switchMap(([id]) => loadResource(this.api.get(id))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly warehouse$ = this.state$.pipe(
    map((s) => s.data),
    filter((w): w is Warehouse => !!w),
  );

  readonly zones$: Observable<Zone[]> = combineLatest([this.id$, this.reload$.pipe(startWith(null))]).pipe(
    switchMap(([id]) => this.api.zones(id)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private readonly route: ActivatedRoute, private readonly api: WarehouseApi) {}

  reload(): void {
    this.reload$.next();
  }
}

@Component({
  selector: 'wms-warehouse-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [WarehouseDetailStore],
  template: `
    <ng-container *ngIf="store.state$ | async as s">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a routerLink="/warehouses">Warehouses</a><span aria-hidden="true">/</span>
        <span aria-current="page">{{ s.data?.name || '…' }}</span>
      </nav>

      <div class="panel" *ngIf="s.status !== 'ready'">
        <wms-state-view
          [status]="s.status"
          [error]="s.error"
          entity="this warehouse"
          icon="warehouse"
          emptyTitle="Warehouse not found"
          emptyHint="It may have been removed, or it is outside your warehouses."
          (retry)="store.reload()"
        ></wms-state-view>
      </div>

      <ng-container *ngIf="s.data as w">
        <section class="page-header">
          <div>
            <h1>{{ w.name }}</h1>
            <p>{{ w.code }} · {{ w.city }} · Managed by {{ w.manager }}</p>
          </div>
          <div class="page-actions">
            <a class="btn" routerLink="/warehouses"><wms-icon name="arrow-left"></wms-icon>All warehouses</a>
            <button type="button" class="btn" *ngIf="context.activeId !== w.id" (click)="context.set(w.id)"><wms-icon name="map-pin"></wms-icon>Work in this warehouse</button>
            <ng-container *wmsCan="'warehouses:edit'">
              <button type="button" class="btn" (click)="setStatus(w, w.status === 'ACTIVE' ? 'deactivate' : 'activate')">{{ w.status === 'ACTIVE' ? 'Deactivate' : 'Activate' }}</button>
              <button type="button" class="btn btn-primary" (click)="edit(w)"><wms-icon name="edit"></wms-icon>Edit warehouse</button>
            </ng-container>
          </div>
        </section>

        <section class="stat-row" aria-label="Warehouse facts">
          <div class="stat"><span>Code</span><strong class="code">{{ w.code }}</strong></div>
          <div class="stat"><span>Location</span><strong>{{ w.city }}</strong></div>
          <div class="stat"><span>Floor area</span><strong>{{ w.capacityM2 | number }} m²</strong></div>
          <div class="stat"><span>Bin utilization</span><strong>{{ w.utilization }}%</strong></div>
          <div class="stat"><span>Zones · bins</span><strong>{{ w.zoneCount }} · {{ w.binCount }}</strong></div>
          <div class="stat"><span>Status</span><wms-status [value]="w.status"></wms-status></div>
        </section>

        <nav class="tabs" aria-label="Warehouse sections">
          <ng-container *ngFor="let t of tabs">
            <a *wmsCan="t.permission" [routerLink]="t.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">{{ t.label }}</a>
          </ng-container>
        </nav>
        <router-outlet></router-outlet>
      </ng-container>
    </ng-container>
  `,
})
export class WarehouseDetailComponent {
  readonly tabs = [
    { label: 'Overview', path: 'overview', permission: 'warehouses:view' },
    { label: 'Zones', path: 'zones', permission: 'warehouses:view' },
    { label: 'Bins', path: 'bins', permission: 'warehouses:view' },
    { label: 'Inventory', path: 'inventory', permission: 'inventory:view' },
    { label: 'Orders', path: 'orders', permission: 'orders:view' },
    { label: 'Activity', path: 'activity', permission: 'warehouses:view' },
    { label: 'Performance', path: 'performance', permission: 'dashboard:view' },
  ];

  constructor(
    readonly store: WarehouseDetailStore,
    readonly context: WarehouseContext,
    private readonly dialogs: DialogService,
    private readonly api: WarehouseApi,
    private readonly toasts: ToastService,
  ) {}

  edit(w: Warehouse): void {
    this.dialogs.open<Warehouse>(WarehouseFormDialogComponent, { warehouse: w }).subscribe((r) => r && this.store.reload());
  }

  setStatus(w: Warehouse, action: 'activate' | 'deactivate'): void {
    this.dialogs
      .confirm({
        title: `${action === 'activate' ? 'Activate' : 'Deactivate'} ${w.code}?`,
        message:
          action === 'activate'
            ? `${w.name} will accept orders, receipts and transfers again.`
            : `${w.name} will stop accepting new orders, receipts and transfers. Stock stays where it is.`,
        confirmLabel: action === 'activate' ? 'Activate' : 'Deactivate',
        tone: action === 'activate' ? 'primary' : 'danger',
        action: () => this.api.setStatus(w.id, action),
      })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${w.code} ${action}d`);
        this.store.reload();
        this.context.load();
      });
  }
}
