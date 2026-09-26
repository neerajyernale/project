import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, Subject, combineLatest } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

import {
  ActivityEntry,
  Bin,
  FulfillmentApi,
  InsightsApi,
  InventoryApi,
  ListController,
  loadResource,
  Order,
  ToastService,
  Warehouse,
  WarehouseApi,
  Zone,
} from '@wms/core';
import { ChartSeries, DialogService } from '@wms/design-system';
import { BinDialogComponent, ZoneDialogComponent } from './warehouse-dialogs';
import { WarehouseDetailStore } from './warehouse-detail.component';

// ------------------------------------------------------------------------------ overview

@Component({
  selector: 'wms-warehouse-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid-2" *ngIf="vm$ | async as vm">
      <article class="panel">
        <div class="panel-heading"><div><h2>Bin utilization</h2><p>Units stored against bin capacity</p></div></div>
        <div class="panel-body">
          <p class="hero">{{ vm.w.utilization }}<span>%</span></p>
          <wms-meter [value]="vm.w.utilization" [wide]="true" [warnAt]="80" [dangerAt]="90"></wms-meter>
          <dl class="dl facts">
            <dt>Used</dt><dd class="num">{{ vm.w.usedUnits | number }} units</dd>
            <dt>Free</dt><dd class="num">{{ vm.w.capacityUnits - vm.w.usedUnits | number }} units</dd>
            <dt>Address</dt><dd>{{ vm.w.address || '—' }}</dd>
            <dt>Time zone</dt><dd>{{ vm.w.timezone }}</dd>
          </dl>
        </div>
      </article>
      <article class="panel">
        <div class="panel-heading"><div><h2>Zones</h2><p>{{ vm.zones.length }} zones · utilization by zone</p></div><a class="link-btn" routerLink="../zones">Manage zones →</a></div>
        <div class="panel-body zone-list">
          <div class="zone-row" *ngFor="let z of vm.zones">
            <span class="zone-name">{{ z.name }} <small class="code">{{ z.code }}</small></span>
            <wms-meter [value]="z.utilization" [wide]="true" [warnAt]="80" [dangerAt]="90" [label]="z.name + ' utilization'"></wms-meter>
          </div>
        </div>
      </article>
    </div>
  `,
  styles: [
    `
      .hero { font-size: 44px; font-weight: 700; letter-spacing: -1.4px; margin-bottom: 12px; }
      .hero span { font-size: 22px; }
      .facts { margin-top: 18px; }
      .zone-list { display: flex; flex-direction: column; gap: 12px; }
      .zone-row { display: grid; grid-template-columns: 160px 1fr; align-items: center; gap: 12px; font-size: 12px; }
      .zone-name { color: var(--wms-text-body); }
    `,
  ],
})
export class WarehouseOverviewComponent {
  readonly vm$ = combineLatest([this.store.warehouse$, this.store.zones$]).pipe(map(([w, zones]) => ({ w, zones })));
  constructor(private readonly store: WarehouseDetailStore) {}
}

// ------------------------------------------------------------------------------ zones

@Component({
  selector: 'wms-warehouse-zones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" *ngIf="vm$ | async as vm">
      <div class="panel-heading">
        <div><h2>Zones</h2><p>{{ vm.zones.length }} zones in this facility</p></div>
        <button *wmsCan="'warehouses:edit'" type="button" class="btn btn-sm" (click)="add(vm.w)"><wms-icon name="plus"></wms-icon>Add zone</button>
      </div>
      <div class="table-scroll" style="margin-top: 12px">
        <table class="data-table">
          <thead><tr><th scope="col">Zone</th><th scope="col">Code</th><th scope="col">Type</th><th scope="col" class="num">Area</th><th scope="col" class="num">Bins</th><th scope="col">Utilization</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr *ngFor="let z of vm.zones">
              <td><strong>{{ z.name }}</strong></td>
              <td class="code">{{ z.code }}</td>
              <td>{{ z.type | humanize }}</td>
              <td class="num">{{ z.areaM2 | number }} m²</td>
              <td class="num">{{ z.binCount }}</td>
              <td><wms-meter [value]="z.utilization" [warnAt]="80" [dangerAt]="90"></wms-meter></td>
              <td><wms-status [value]="z.status"></wms-status></td>
              <td>
                <div class="row-actions">
                  <a class="link-btn" routerLink="../bins" [queryParams]="{ zoneId: z.id }">Bins</a>
                  <button *wmsCan="'warehouses:edit'" type="button" class="link-btn" (click)="edit(vm.w, z)">Edit</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class WarehouseZonesComponent {
  readonly vm$ = combineLatest([this.store.warehouse$, this.store.zones$]).pipe(map(([w, zones]) => ({ w, zones })));
  constructor(private readonly store: WarehouseDetailStore, private readonly dialogs: DialogService) {}

  add(w: Warehouse): void {
    this.dialogs.open<Zone>(ZoneDialogComponent, { warehouse: w }).subscribe((z) => z && this.store.reload());
  }

  edit(w: Warehouse, zone: Zone): void {
    this.dialogs.open<Zone>(ZoneDialogComponent, { warehouse: w, zone }).subscribe((z) => z && this.store.reload());
  }
}

// ------------------------------------------------------------------------------ bins

@Component({
  selector: 'wms-warehouse-bins',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" *ngIf="list.state$ | async as s">
      <div class="table-controls">
        <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search bins</span>
          <input type="search" placeholder="Search bin code…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
        </label>
        <select class="filter-select" aria-label="Zone" [value]="list.filter('zoneId')" (change)="list.setFilter('zoneId', $any($event.target).value)">
          <option value="">All zones</option>
          <option *ngFor="let z of zones$ | async" [value]="z.id" [selected]="z.id === list.filter('zoneId')">{{ z.name }} ({{ z.code }})</option>
        </select>
        <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
          <option value="">All statuses</option>
          <option value="EMPTY">Empty</option><option value="PARTIAL">Partial</option><option value="FULL">Full</option><option value="BLOCKED">Blocked</option>
        </select>
        <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
        <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} bins</span>
        <button *wmsCan="'warehouses:edit'" type="button" class="btn btn-sm" (click)="add()"><wms-icon name="plus"></wms-icon>Add bin</button>
      </div>
      <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="bins" icon="grid" emptyTitle="No bins yet" (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
      <div class="table-scroll" *ngIf="s.status === 'ready' && s.page">
        <table class="data-table">
          <thead><tr><th scope="col"><button type="button" (click)="list.sortBy('code')">Bin</button></th><th scope="col">Zone</th><th scope="col" class="num">Capacity</th><th scope="col" class="num"><button type="button" (click)="list.sortBy('usedUnits')">Stored</button></th><th scope="col" class="num">SKUs</th><th scope="col">Fill</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr *ngFor="let b of s.page.content; trackBy: trackById">
              <td class="code">{{ b.code }}</td>
              <td>{{ b.zoneName }}</td>
              <td class="num">{{ b.capacityUnits | number }}</td>
              <td class="num"><strong>{{ b.usedUnits | number }}</strong></td>
              <td class="num">{{ b.skuCount }}</td>
              <td><wms-meter [value]="fill(b)" [warnAt]="90" [dangerAt]="100"></wms-meter></td>
              <td><wms-status [value]="b.status"></wms-status></td>
              <td>
                <div class="row-actions">
                  <a *wmsCan="'inventory:view'" class="link-btn" routerLink="../inventory" [queryParams]="{ binId: b.id }">Stock</a>
                  <ng-container *wmsCan="'warehouses:edit'">
                    <button type="button" class="link-btn" (click)="toggleBlock(b)">{{ b.blocked ? 'Unblock' : 'Block' }}</button>
                  </ng-container>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
    </section>
  `,
})
export class WarehouseBinsComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private warehouseId = '';
  readonly zones$ = this.store.zones$;
  readonly list = new ListController<Bin>(
    (p) => this.store.id$.pipe(take(1), switchMap((id) => ((this.warehouseId = id), this.api.bins(id, p)))),
    { sort: 'code,asc', route: { router: this.router, route: this.route }, destroy$: this.destroy$ },
  );

  constructor(
    private readonly store: WarehouseDetailStore,
    private readonly api: WarehouseApi,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  fill(b: Bin): number {
    return b.capacityUnits ? Math.round((b.usedUnits / b.capacityUnits) * 100) : 0;
  }

  add(): void {
    combineLatest([this.store.warehouse$, this.store.zones$])
      .pipe(take(1), switchMap(([warehouse, zones]) => this.dialogs.open<Bin>(BinDialogComponent, { warehouse, zones })))
      .subscribe((b) => {
        if (!b) return;
        this.list.reload();
        this.store.reload();
      });
  }

  toggleBlock(b: Bin): void {
    this.dialogs
      .confirm({
        title: b.blocked ? `Unblock ${b.code}?` : `Block ${b.code}?`,
        message: b.blocked ? 'Stock in this bin becomes available for orders again.' : 'Stock in this bin can no longer be reserved or picked until it is unblocked.',
        confirmLabel: b.blocked ? 'Unblock' : 'Block bin',
        tone: b.blocked ? 'primary' : 'danger',
        action: () => this.api.setBinBlocked(b.id, !b.blocked),
      })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`Bin ${b.code} ${b.blocked ? 'unblocked' : 'blocked'}`);
        this.list.reload();
      });
  }

  trackById = (_: number, b: Bin) => b.id;
}

// ------------------------------------------------------------------------------ inventory

@Component({
  selector: 'wms-warehouse-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" *ngIf="state$ | async as s">
      <div class="panel-heading">
        <div><h2>Stock in this warehouse</h2><p>{{ binFilter ? 'Filtered to one bin' : 'Every bin holding stock' }}</p></div>
        <a *ngIf="binFilter" class="link-btn" routerLink="." [queryParams]="{}">Show all bins</a>
      </div>
      <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="stock" (retry)="retry$.next()"></wms-state-view>
      <ng-container *ngIf="s.data as rows">
        <wms-state-view *ngIf="!rows.length" status="empty" icon="inventory" emptyTitle="No stock here" emptyHint="Receive an inbound shipment or a transfer to add stock."></wms-state-view>
        <div class="table-scroll" *ngIf="rows.length" style="margin-top: 12px">
          <table class="data-table">
            <thead><tr><th scope="col">Bin</th><th scope="col">Zone</th><th scope="col">SKU</th><th scope="col">Product</th><th scope="col" class="num">On hand</th><th scope="col" class="num">Reserved</th><th scope="col" class="num">Damaged</th><th scope="col" class="num">Available</th></tr></thead>
            <tbody>
              <tr *ngFor="let b of rows">
                <td class="code">{{ b.binCode }}</td>
                <td>{{ b.zoneName }}</td>
                <td class="code">{{ b.sku }}</td>
                <td><strong>{{ b.productName }}</strong></td>
                <td class="num">{{ b.onHand | number }}</td>
                <td class="num">{{ b.reserved | number }}</td>
                <td class="num">{{ b.damaged | number }}</td>
                <td class="num"><strong>{{ b.available | number }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </ng-container>
    </section>
  `,
})
export class WarehouseInventoryComponent {
  readonly binFilter = this.route.snapshot.queryParamMap.get('binId');
  readonly retry$ = new BehaviorSubject<void>(undefined);
  readonly state$ = combineLatest([this.store.id$, this.route.queryParamMap, this.retry$]).pipe(
    switchMap(([id, q]) => loadResource(this.inventory.balances({ warehouseId: id, binId: q.get('binId') }))),
  );

  constructor(private readonly store: WarehouseDetailStore, private readonly inventory: InventoryApi, private readonly route: ActivatedRoute) {}
}

// ------------------------------------------------------------------------------ orders

@Component({
  selector: 'wms-warehouse-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" *ngIf="list.state$ | async as s">
      <div class="panel-heading"><div><h2>Orders</h2><p>Fulfilled from this warehouse, newest first</p></div><a class="link-btn" routerLink="/orders">All orders →</a></div>
      <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="orders" icon="orders" emptyTitle="No orders yet" (retry)="list.reload()"></wms-state-view>
      <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" style="margin-top: 12px">
        <table class="data-table">
          <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col" class="num">Units</th><th scope="col">Priority</th><th scope="col">Created</th><th scope="col">Status</th></tr></thead>
          <tbody>
            <tr *ngFor="let o of s.page.content">
              <td><a class="code" [routerLink]="['/orders', o.id]">{{ o.number }}</a></td>
              <td><strong>{{ o.customerName }}</strong></td>
              <td class="num">{{ o.totalQty | number }}</td>
              <td><wms-status [value]="o.priority"></wms-status></td>
              <td>{{ o.createdAt | wmsDate }}</td>
              <td><wms-status [value]="o.status"></wms-status> <wms-status *ngIf="o.delayed" value="DELAYED"></wms-status></td>
            </tr>
          </tbody>
        </table>
      </div>
      <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
    </section>
  `,
})
export class WarehouseOrdersComponent {
  readonly list = new ListController<Order>((p) => this.store.id$.pipe(take(1), switchMap((warehouseId) => this.api.orders({ ...p, warehouseId }))), { size: 10, sort: 'createdAt,desc' });
  constructor(private readonly store: WarehouseDetailStore, private readonly api: FulfillmentApi) {}
}

// ------------------------------------------------------------------------------ activity

@Component({
  selector: 'wms-warehouse-activity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" *ngIf="list.state$ | async as s">
      <div class="panel-heading"><div><h2>Activity log</h2><p>Everything that changed at this facility</p></div></div>
      <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="activity" icon="activity" emptyTitle="No activity yet" (retry)="list.reload()"></wms-state-view>
      <div class="feed" *ngIf="s.status === 'ready' && s.page">
        <div class="feed-row" *ngFor="let a of s.page.content; trackBy: trackById">
          <span class="dot-icon" [ngClass]="tone(a)"><wms-icon name="activity" [size]="14"></wms-icon></span>
          <div><strong>{{ a.title }}</strong><small>{{ a.detail }} · {{ a.user }}</small><time [attr.datetime]="a.at">{{ a.at | wmsDate: 'datetime' }}</time></div>
        </div>
      </div>
      <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
    </section>
  `,
})
export class WarehouseActivityComponent {
  readonly list = new ListController<ActivityEntry>((p) => this.store.id$.pipe(take(1), switchMap((warehouseId) => this.api.activity({ ...p, warehouseId }))), { size: 25, sort: 'at,desc' });
  constructor(private readonly store: WarehouseDetailStore, private readonly api: InsightsApi) {}

  tone(a: ActivityEntry): string {
    return { success: 'tone-green', warning: 'tone-orange', danger: 'tone-red', info: 'tone-blue', neutral: 'tone-navy' }[a.tone];
  }

  trackById = (_: number, a: ActivityEntry) => a.id;
}

// ------------------------------------------------------------------------------ performance

@Component({
  selector: 'wms-warehouse-performance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="state$ | async as s">
      <div class="panel" *ngIf="s.status !== 'ready'"><wms-state-view [status]="s.status" [error]="s.error" entity="performance figures"></wms-state-view></div>
      <div class="grid-main-side" *ngIf="s.data as d">
        <article class="panel">
          <div class="panel-heading"><div><h2>Throughput, last 7 days</h2><p>Orders received and shipped per day</p></div></div>
          <div class="panel-body">
            <wms-line-chart [labels]="labels(d.ordersByDay)" [series]="series" [data]="[d.ordersByDay | pluck: 'received', d.ordersByDay | pluck: 'shipped']" ariaLabel="Orders received and shipped per day"></wms-line-chart>
          </div>
        </article>
        <article class="panel">
          <div class="panel-heading"><div><h2>Right now</h2><p>Work in progress at this facility</p></div></div>
          <div class="panel-body">
            <dl class="dl">
              <dt>Orders today</dt><dd class="num">{{ d.kpis.ordersToday }}</dd>
              <dt>Open pick tasks</dt><dd class="num">{{ d.kpis.pendingPicking }}</dd>
              <dt>Ready to ship</dt><dd class="num">{{ d.kpis.readyToShip }}</dd>
              <dt>Low-stock items</dt><dd class="num">{{ d.kpis.lowStockItems }}</dd>
              <dt>Bin capacity used</dt><dd class="num">{{ d.kpis.capacityPct }}%</dd>
            </dl>
          </div>
        </article>
      </div>
    </ng-container>
  `,
})
export class WarehousePerformanceComponent {
  readonly series: ChartSeries[] = [
    { key: 'received', label: 'Received', color: 'var(--wms-series-1)' },
    { key: 'shipped', label: 'Shipped', color: 'var(--wms-series-2)' },
  ];
  readonly state$ = this.store.id$.pipe(switchMap((id) => loadResource(this.insights.dashboard(id))));

  constructor(private readonly store: WarehouseDetailStore, private readonly insights: InsightsApi) {}

  labels(days: { date: string }[]): string[] {
    return days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d.date).getDay()]);
  }
}
