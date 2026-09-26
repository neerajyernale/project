import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, merge } from 'rxjs';
import { map, skip, switchMap } from 'rxjs/operators';

import { FulfillmentApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { ORDER_STATUSES, Order, PRIORITIES } from '@core/models';
import { ListController, ResourceState, loadResource } from '@core/state/list-controller';
import { downloadCsv } from '@shared/csv';
import { DialogService } from '@shared/ui/dialogs';
import { OrderDialogComponent } from './fulfillment-dialogs';
import { OrderAction, OrderActions } from './order-actions.service';

const OUTBOUND_STAGES: Order['status'][] = ['ALLOCATED', 'PICKING', 'PICKED', 'PACKED', 'SHIPPED'];

// ------------------------------------------------------------------------------ list (orders + outbound)

@Component({
  selector: 'wms-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [OrderActions],
  templateUrl: './orders.component.html',
  styles: ['.as-btn { text-align: left; cursor: pointer; } .as-btn:hover { border-color: var(--wms-primary); } .delayed-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--wms-text-body); }'],
})
export class OrdersComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly changed$ = new Subject<void>();
  readonly outbound = this.route.snapshot.data['mode'] === 'outbound';
  readonly statuses: Order['status'][] = this.outbound ? OUTBOUND_STAGES : [...ORDER_STATUSES];
  readonly priorities = PRIORITIES;

  readonly list = new ListController<Order>((p) => this.api.orders(p), {
    sort: 'createdAt,desc',
    fixed: this.outbound ? { stage: 'outbound' } : {},
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  /** Counts for the KPI strip (the real API would expose a counts endpoint). */
  readonly counts$ = merge(this.context.activeId$, this.changed$).pipe(
    switchMap(() => this.api.orders({ size: 200, stage: this.outbound ? 'outbound' : undefined })),
    map((p) => {
      const by = (st: Order['status']) => p.content.filter((o) => o.status === st).length;
      return {
        created: by('CREATED'),
        allocated: by('ALLOCATED'),
        picking: by('PICKING'),
        picked: by('PICKED'),
        packed: by('PACKED'),
        inFlight: p.content.filter((o) => ['ALLOCATED', 'PICKING', 'PICKED', 'PACKED'].includes(o.status)).length,
        delayed: p.content.filter((o) => o.delayed).length,
        shipped: p.content.filter((o) => o.status === 'SHIPPED' || o.status === 'DELIVERED').length,
      };
    }),
  );

  constructor(
    private readonly api: FulfillmentApi,
    private readonly dialogs: DialogService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly context: WarehouseContext,
    readonly session: AuthSession,
    readonly actions: OrderActions,
  ) {}

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('new') && this.session.can('orders:create')) this.create();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  create(): void {
    this.dialogs.open<Order>(OrderDialogComponent).subscribe((o) => {
      if (!o) return;
      this.changed$.next();
      void this.router.navigate(['/orders', o.id], { queryParams: { created: 1 } });
    });
  }

  primaryAction(o: Order): OrderAction | undefined {
    return this.actions.available(o).find((a) => a.primary);
  }

  run(o: Order, a: OrderAction): void {
    this.actions.run(o, a.key).subscribe((changed) => changed && this.changed$.next());
  }

  export(rows: Order[]): void {
    downloadCsv(this.outbound ? 'outbound.csv' : 'orders.csv', [
      ['Order', 'Customer', 'Warehouse', 'Units', 'Priority', 'Created', 'Required by', 'Status', 'Delayed'],
      ...rows.map((o) => [o.number, o.customerName, o.warehouseName, o.totalQty, o.priority, o.createdAt, o.requiredBy, o.status, o.delayed ? 'yes' : 'no']),
    ]);
  }

  trackById = (_: number, o: Order) => o.id;
}

// ------------------------------------------------------------------------------ detail

const STEPS: Order['status'][] = ['CREATED', 'ALLOCATED', 'PICKING', 'PICKED', 'PACKED', 'SHIPPED', 'DELIVERED'];

@Component({
  selector: 'wms-order-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [OrderActions],
  templateUrl: './order-detail.component.html',
  styles: [
    `
      h1 wms-status { vertical-align: middle; margin-left: 6px; }
      .steps { list-style: none; display: flex; padding: 0; margin: 0 0 20px; background: var(--wms-surface); border: 1px solid var(--wms-border); border-radius: var(--wms-radius-lg); overflow-x: auto; }
      .steps li { flex: 1; display: flex; align-items: center; gap: 8px; padding: 14px 14px; font-size: 12px; color: var(--wms-text-subtle); white-space: nowrap; border-right: 1px solid var(--wms-divider); }
      .steps li:last-child { border-right: 0; }
      .step-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--wms-border-strong); display: inline-flex; align-items: center; justify-content: center; flex: 0 0 20px; }
      .steps li.done { color: var(--wms-text-body); }
      .steps li.done .step-dot { background: var(--wms-success); border-color: var(--wms-success); color: #fff; }
      .steps li.current { color: var(--wms-primary); font-weight: 600; }
      .steps li.current .step-dot { border-color: var(--wms-primary); }
      .short { color: var(--wms-warning); font-weight: 600; }
    `,
  ],
})
export class OrderDetailComponent {
  readonly steps = STEPS;
  readonly reload$ = new Subject<void>();
  readonly justCreated = !!this.route.snapshot.queryParamMap.get('created');
  readonly state$: Observable<ResourceState<Order>> = merge(this.route.paramMap, this.reload$).pipe(
    switchMap(() => loadResource(this.api.order(this.route.snapshot.paramMap.get('id') ?? ''))),
  );

  constructor(private readonly api: FulfillmentApi, private readonly route: ActivatedRoute, readonly actions: OrderActions) {}

  stepIndex(o: Order): number {
    const i = STEPS.indexOf(o.status);
    return o.status === 'DELIVERED' ? i + 1 : i;
  }

  run(o: Order, a: OrderAction): void {
    this.actions.run(o, a.key).subscribe((changed) => changed && this.reload$.next());
  }

  shortBy(o: Order): number {
    return ['PICKED', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(o.status) ? o.lines.reduce((a, l) => a + (l.qty - l.picked), 0) : 0;
  }
}
