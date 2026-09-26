import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, merge } from 'rxjs';
import { map, skip, switchMap } from 'rxjs/operators';

import { FulfillmentApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { CARRIERS, Order, PackageRecord, PickTask, Shipment } from '@core/models';
import { ToastService } from '@core/notify/toast.service';
import { ListController } from '@core/state/list-controller';
import { DialogService } from '@shared/ui/dialogs';
import { AssignDialogComponent, PickDialogComponent } from './fulfillment-dialogs';
import { OrderActions } from './order-actions.service';

const TILE_BTN = '.as-btn { text-align: left; cursor: pointer; } .as-btn:hover { border-color: var(--wms-primary); }';

// ------------------------------------------------------------------------------ picking

@Component({
  selector: 'wms-picking',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Fulfillment · {{ (context.active$ | async)?.name || 'All warehouses' }}</div>
          <h1>Picking</h1>
          <p>Pick queues, assignments and short picks.</p>
        </div>
      </section>

      <section class="kpi-strip" *ngIf="counts$ | async as c">
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'PENDING')"><span class="tone-icon tone-red"><wms-icon name="users"></wms-icon></span><div><strong>{{ c.PENDING }}</strong><small>Unassigned</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'ASSIGNED')"><span class="tone-icon tone-navy"><wms-icon name="clock"></wms-icon></span><div><strong>{{ c.ASSIGNED }}</strong><small>Assigned, not started</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'IN_PROGRESS')"><span class="tone-icon tone-blue"><wms-icon name="picking"></wms-icon></span><div><strong>{{ c.IN_PROGRESS }}</strong><small>In progress</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'SHORT')"><span class="tone-icon tone-orange"><wms-icon name="alert"></wms-icon></span><div><strong>{{ c.SHORT }}</strong><small>Short picks</small></div></button>
      </section>

      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search pick tasks</span>
            <input type="search" placeholder="Search task, order, picker, zone…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
            <option value="">All statuses</option>
            <option value="PENDING,ASSIGNED,IN_PROGRESS">Open</option>
            <option *ngFor="let st of statuses" [value]="st">{{ st | humanize }}</option>
          </select>
          <label class="mine"><input type="checkbox" [checked]="list.filter('picker') === 'me'" (change)="list.setFilter('picker', $any($event.target).checked ? 'me' : '')" /> My tasks</label>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} tasks</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="pick tasks" icon="picking" emptyTitle="No pick tasks" emptyHint="Tasks are created when an allocated order is released to picking." (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead><tr><th scope="col">Task</th><th scope="col">Order</th><th scope="col">Warehouse</th><th scope="col">Zone</th><th scope="col">Picker</th><th scope="col" class="num">Units</th><th scope="col">Priority</th><th scope="col"><button type="button" (click)="list.sortBy('createdAt')">Created</button></th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              <tr *ngFor="let t of s.page.content; trackBy: trackById">
                <td class="code">{{ t.number }}</td>
                <td><a class="code" [routerLink]="['/orders', t.orderId]">{{ t.orderNumber }}</a></td>
                <td>{{ t.warehouseName }}</td>
                <td class="code">{{ t.zone }}</td>
                <td>{{ t.picker || '—' }}</td>
                <td class="num">{{ t.totalQty | number }}</td>
                <td><wms-status [value]="t.priority"></wms-status></td>
                <td>{{ t.createdAt | relTime }}</td>
                <td><wms-status [value]="t.status"></wms-status></td>
                <td>
                  <div class="row-actions" *wmsCan="'picking:edit'">
                    <button *ngIf="t.status === 'PENDING' || t.status === 'ASSIGNED'" type="button" class="link-btn" (click)="assign(t)">{{ t.picker ? 'Reassign' : 'Assign' }}</button>
                    <button *ngIf="t.status === 'PENDING' || t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS'" type="button" class="link-btn" (click)="pick(t)">{{ t.status === 'IN_PROGRESS' ? 'Confirm picks' : 'Pick' }}</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
  styles: [TILE_BTN, '.mine { display: flex; gap: 6px; align-items: center; font-size: 12px; }'],
})
export class PickingComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly changed$ = new Subject<void>();
  readonly statuses = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'SHORT'];
  readonly list = new ListController<PickTask>((p) => this.api.pickTasks(p), {
    sort: 'createdAt,desc',
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });
  readonly counts$ = merge(this.context.activeId$, this.changed$).pipe(
    switchMap(() => this.api.pickTasks({ size: 200 })),
    map((p) => {
      const c: Record<PickTask['status'], number> = { PENDING: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0, SHORT: 0 };
      p.content.forEach((t) => c[t.status]++);
      return c;
    }),
  );

  constructor(
    private readonly api: FulfillmentApi,
    private readonly dialogs: DialogService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly context: WarehouseContext,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  assign(t: PickTask): void {
    this.dialogs.open<PickTask>(AssignDialogComponent, t).subscribe((r) => r && this.changed$.next());
  }

  pick(t: PickTask): void {
    // The dialog can start the task and then confirm it, so refresh whenever it closes.
    this.dialogs.open<PickTask>(PickDialogComponent, t).subscribe(() => this.changed$.next());
  }

  trackById = (_: number, t: PickTask) => t.id;
}

// ------------------------------------------------------------------------------ packing

@Component({
  selector: 'wms-packing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [OrderActions],
  template: `
    <section class="page-header">
      <div>
        <div class="eyebrow">Fulfillment · {{ (context.active$ | async)?.name || 'All warehouses' }}</div>
        <h1>Packing</h1>
        <p>Picked orders waiting at packing stations, and packages already closed.</p>
      </div>
    </section>

    <section class="panel" *ngIf="queue.state$ | async as q">
      <div class="panel-heading"><div><h2>Ready to pack</h2><p>{{ q.page?.totalElements ?? 0 }} picked orders</p></div></div>
      <wms-state-view *ngIf="q.status !== 'ready'" [status]="q.status" [error]="q.error" entity="orders" icon="packing" emptyTitle="Nothing to pack" emptyHint="Orders appear here once their picks are confirmed." (retry)="queue.reload()"></wms-state-view>
      <div class="table-scroll" *ngIf="q.status === 'ready' && q.page" style="margin-top: 12px">
        <table class="data-table">
          <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Warehouse</th><th scope="col" class="num">Units picked</th><th scope="col">Priority</th><th scope="col">Required by</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr *ngFor="let o of q.page.content">
              <td><a class="code" [routerLink]="['/orders', o.id]">{{ o.number }}</a> <wms-status *ngIf="o.delayed" value="DELAYED"></wms-status></td>
              <td><strong>{{ o.customerName }}</strong></td>
              <td>{{ o.warehouseName }}</td>
              <td class="num">{{ picked(o) | number }}</td>
              <td><wms-status [value]="o.priority"></wms-status></td>
              <td>{{ o.requiredBy | wmsDate }}</td>
              <td><button *wmsCan="'packing:edit'" type="button" class="btn btn-primary btn-sm" (click)="pack(o)"><wms-icon name="packing"></wms-icon>Pack</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel" *ngIf="packages.state$ | async as s">
      <div class="table-controls">
        <strong class="section-title">Packed</strong>
        <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search packages</span>
          <input type="search" placeholder="Search package, order, station…" [value]="packages.query.q" (input)="packages.search($any($event.target).value)" />
        </label>
        <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} packages</span>
      </div>
      <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="packages" icon="packing" emptyTitle="No packages yet" (retry)="packages.reload()" (clear)="packages.clear()"></wms-state-view>
      <div class="table-scroll" *ngIf="s.status === 'ready' && s.page">
        <table class="data-table">
          <thead><tr><th scope="col">Package</th><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Station</th><th scope="col" class="num">Items</th><th scope="col" class="num">Weight</th><th scope="col">Packed by</th><th scope="col">Packed</th></tr></thead>
          <tbody>
            <tr *ngFor="let p of s.page.content; trackBy: trackById">
              <td class="code">{{ p.number }}</td>
              <td><a class="code" [routerLink]="['/orders', p.orderId]">{{ p.orderNumber }}</a></td>
              <td>{{ p.customerName }}</td>
              <td>{{ p.station }}</td>
              <td class="num">{{ p.items | number }}</td>
              <td class="num">{{ p.weightKg }} kg</td>
              <td>{{ p.packedBy }}</td>
              <td>{{ p.packedAt | relTime }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="packages.setPage($event)" (sizeChange)="packages.setSize($event)"></wms-paginator>
    </section>
  `,
  styles: ['.section-title { font-size: 15px; margin-right: 8px; }'],
})
export class PackingComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly changed$ = new Subject<void>();
  readonly queue = new ListController<Order>((p) => this.api.orders({ ...p, status: 'PICKED' }), {
    size: 50,
    sort: 'requiredBy,asc',
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    destroy$: this.destroy$,
  });
  readonly packages = new ListController<PackageRecord>((p) => this.api.packages(p), {
    size: 10,
    sort: 'packedAt,desc',
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    destroy$: this.destroy$,
  });

  constructor(private readonly api: FulfillmentApi, private readonly actions: OrderActions, readonly context: WarehouseContext) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  picked(o: Order): number {
    return o.lines.reduce((a, l) => a + l.picked, 0);
  }

  pack(o: Order): void {
    this.actions.run(o, 'pack').subscribe((changed) => changed && this.changed$.next());
  }

  trackById = (_: number, p: PackageRecord) => p.id;
}

// ------------------------------------------------------------------------------ shipping

@Component({
  selector: 'wms-shipping',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [OrderActions],
  template: `
    <section class="page-header">
      <div>
        <div class="eyebrow">Fulfillment · {{ (context.active$ | async)?.name || 'All warehouses' }}</div>
        <h1>Shipping</h1>
        <p>Dispatch packed orders and track them to delivery.</p>
      </div>
    </section>

    <section class="panel" *ngIf="queue.state$ | async as q">
      <div class="panel-heading"><div><h2>Ready to dispatch</h2><p>{{ q.page?.totalElements ?? 0 }} packed orders</p></div></div>
      <wms-state-view *ngIf="q.status !== 'ready'" [status]="q.status" [error]="q.error" entity="orders" icon="shipping" emptyTitle="Nothing waiting for a carrier" (retry)="queue.reload()"></wms-state-view>
      <div class="table-scroll" *ngIf="q.status === 'ready' && q.page" style="margin-top: 12px">
        <table class="data-table">
          <thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Destination</th><th scope="col">Package</th><th scope="col">Priority</th><th scope="col">Required by</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr *ngFor="let o of q.page.content">
              <td><a class="code" [routerLink]="['/orders', o.id]">{{ o.number }}</a> <wms-status *ngIf="o.delayed" value="DELAYED"></wms-status></td>
              <td><strong>{{ o.customerName }}</strong></td>
              <td>{{ o.shipToCity || '—' }}</td>
              <td class="code">{{ o.packageNumber }}</td>
              <td><wms-status [value]="o.priority"></wms-status></td>
              <td>{{ o.requiredBy | wmsDate }}</td>
              <td><button *wmsCan="'shipping:edit'" type="button" class="btn btn-primary btn-sm" (click)="ship(o)"><wms-icon name="shipping"></wms-icon>Dispatch</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel" *ngIf="shipments.state$ | async as s">
      <div class="table-controls">
        <strong class="section-title">Shipments</strong>
        <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search shipments</span>
          <input type="search" placeholder="Search shipment, order, tracking…" [value]="shipments.query.q" (input)="shipments.search($any($event.target).value)" />
        </label>
        <select class="filter-select" aria-label="Status" [value]="shipments.filter('status')" (change)="shipments.setFilter('status', $any($event.target).value)">
          <option value="">All statuses</option><option value="IN_TRANSIT">In transit</option><option value="DELIVERED">Delivered</option><option value="EXCEPTION">Exception</option>
        </select>
        <select class="filter-select" aria-label="Carrier" [value]="shipments.filter('carrier')" (change)="shipments.setFilter('carrier', $any($event.target).value)">
          <option value="">All carriers</option><option *ngFor="let c of carriers" [value]="c">{{ c }}</option>
        </select>
        <button *ngIf="shipments.hasFilters" type="button" class="link-btn" (click)="shipments.clear()">Clear</button>
        <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} shipments</span>
      </div>
      <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="shipments" icon="shipping" emptyTitle="No shipments yet" (retry)="shipments.reload()" (clear)="shipments.clear()"></wms-state-view>
      <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
        <table class="data-table">
          <thead><tr><th scope="col">Shipment</th><th scope="col">Order</th><th scope="col">Carrier</th><th scope="col">Tracking</th><th scope="col">Destination</th><th scope="col"><button type="button" (click)="shipments.sortBy('shippedAt')">Shipped</button></th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            <tr *ngFor="let x of s.page.content; trackBy: trackById">
              <td class="code">{{ x.number }}</td>
              <td><a class="code" [routerLink]="['/orders', x.orderId]">{{ x.orderNumber }}</a></td>
              <td>{{ x.carrier }}</td>
              <td class="code">{{ x.trackingNumber }}</td>
              <td>{{ x.destination }}</td>
              <td>{{ x.shippedAt | wmsDate: 'datetime' }}</td>
              <td>
                <wms-status [value]="x.status"></wms-status>
                <small class="muted note" *ngIf="x.exceptionNote && x.status === 'EXCEPTION'">{{ x.exceptionNote }}</small>
              </td>
              <td>
                <div class="row-actions" *wmsCan="'shipping:edit'">
                  <button *ngIf="x.status !== 'DELIVERED'" type="button" class="link-btn" (click)="deliver(x)">Mark delivered</button>
                  <button *ngIf="x.status === 'IN_TRANSIT'" type="button" class="link-btn" (click)="exception(x)">Report problem</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="shipments.setPage($event)" (sizeChange)="shipments.setSize($event)"></wms-paginator>
    </section>
  `,
  styles: ['.section-title { font-size: 15px; margin-right: 8px; }', '.note { display: block; margin-top: 3px; max-width: 220px; white-space: normal; }'],
})
export class ShippingComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly changed$ = new Subject<void>();
  readonly carriers = CARRIERS;
  readonly queue = new ListController<Order>((p) => this.api.orders({ ...p, status: 'PACKED' }), {
    size: 50,
    sort: 'requiredBy,asc',
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    destroy$: this.destroy$,
  });
  readonly shipments = new ListController<Shipment>((p) => this.api.shipments(p), {
    sort: 'shippedAt,desc',
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  constructor(
    private readonly api: FulfillmentApi,
    private readonly actions: OrderActions,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly context: WarehouseContext,
    readonly session: AuthSession,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ship(o: Order): void {
    this.actions.run(o, 'ship').subscribe((changed) => changed && this.changed$.next());
  }

  deliver(x: Shipment): void {
    this.dialogs
      .confirm({ title: `Mark ${x.number} delivered?`, message: `${x.carrier} · ${x.trackingNumber} to ${x.destination}. The order is closed as delivered.`, confirmLabel: 'Mark delivered', action: () => this.api.deliver(x.id) })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${x.number} delivered`);
        this.changed$.next();
      });
  }

  exception(x: Shipment): void {
    this.dialogs
      .confirm({
        title: `Report a problem with ${x.number}`,
        message: 'The shipment is flagged and supervisors are notified.',
        confirmLabel: 'Report problem',
        tone: 'danger',
        reasonLabel: 'What happened?',
        reasonRequired: true,
        action: (note) => this.api.exception(x.id, note),
      })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.show('warning', `${x.number} flagged`, r.reason);
        this.changed$.next();
      });
  }

  trackById = (_: number, x: Shipment) => x.id;
}
