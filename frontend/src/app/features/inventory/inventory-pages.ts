import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, merge } from 'rxjs';
import { map, skip, switchMap } from 'rxjs/operators';

import { CatalogApi, InventoryApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { InventoryItem, MOVEMENT_TYPES, Movement, Transfer } from '@core/models';
import { ToastService } from '@core/notify/toast.service';
import { ListController, ResourceState, loadResource } from '@core/state/list-controller';
import { downloadCsv } from '@shared/csv';
import { ConfirmData, DialogService } from '@shared/ui/dialogs';
import { BalancesDialogComponent, TransferDialogComponent } from './inventory-dialogs';

const INVENTORY_TABS = `
  <nav class="tabs" aria-label="Inventory views">
    <a routerLink="/inventory" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Stock</a>
    <a routerLink="/inventory/movements" routerLinkActive="active">Movements</a>
  </nav>
`;

// ------------------------------------------------------------------------------ stock

@Component({
  selector: 'wms-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Inventory · {{ (context.active$ | async)?.name || 'All warehouses' }}</div>
          <h1>Inventory</h1>
          <p>Stock levels and inventory health, per warehouse.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" (click)="export(s.page?.content ?? [])" [disabled]="!s.page?.content?.length"><wms-icon name="download"></wms-icon>Export</button>
          <a *wmsCan="'transfers:create'" class="btn btn-primary" routerLink="/transfers" [queryParams]="{ new: 1 }"><wms-icon name="transfer"></wms-icon>Request transfer</a>
        </div>
      </section>
      ${INVENTORY_TABS}
      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search inventory</span>
            <input type="search" placeholder="Search SKU, product, warehouse…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Stock level" [value]="list.filter('stockStatus')" (change)="list.setFilter('stockStatus', $any($event.target).value)">
            <option value="">Any stock level</option>
            <option value="LOW_STOCK,OUT_OF_STOCK">Needs reorder</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="OVERSTOCK">Overstock</option>
          </select>
          <select class="filter-select" aria-label="Category" [value]="list.filter('category')" (change)="list.setFilter('category', $any($event.target).value)">
            <option value="">All categories</option>
            <option *ngFor="let c of categories$ | async" [value]="c">{{ c }}</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} stock lines</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="stock" icon="inventory" emptyTitle="No stock yet" emptyHint="Stock appears here once inbound shipments are received." (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col"><button type="button" (click)="list.sortBy('sku')">SKU</button></th>
                <th scope="col"><button type="button" (click)="list.sortBy('productName')">Product</button></th>
                <th scope="col"><button type="button" (click)="list.sortBy('warehouseName')">Warehouse</button></th>
                <th scope="col" class="num"><button type="button" (click)="list.sortBy('onHand')">On hand</button></th>
                <th scope="col" class="num">Reserved</th>
                <th scope="col" class="num">Damaged</th>
                <th scope="col" class="num"><button type="button" (click)="list.sortBy('available')">Available</button></th>
                <th scope="col" class="num">Reorder at</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let i of s.page.content; trackBy: trackById">
                <td class="code">{{ i.sku }}</td>
                <td><div class="cell-stack"><strong>{{ i.productName }}</strong><small>{{ i.category }}</small></div></td>
                <td>{{ i.warehouseName }}</td>
                <td class="num">{{ i.onHand | number }}</td>
                <td class="num">{{ i.reserved | number }}</td>
                <td class="num">{{ i.damaged | number }}</td>
                <td class="num"><strong>{{ i.available | number }}</strong></td>
                <td class="num">{{ i.reorderLevel | number }}</td>
                <td><wms-status [value]="i.stockStatus"></wms-status></td>
                <td><button type="button" class="link-btn" (click)="openBins(i)">{{ i.binCount }} bin{{ i.binCount === 1 ? '' : 's' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
})
export class InventoryComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly categories$ = this.catalog.categories();
  readonly list = new ListController<InventoryItem>((p) => this.api.items(p), {
    sort: 'sku,asc',
    reload$: this.context.activeId$.pipe(skip(1)),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  constructor(
    private readonly api: InventoryApi,
    private readonly catalog: CatalogApi,
    private readonly dialogs: DialogService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly context: WarehouseContext,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  openBins(item: InventoryItem): void {
    this.dialogs.open<boolean>(BalancesDialogComponent, item).subscribe((changed) => changed && this.list.reload());
  }

  export(rows: InventoryItem[]): void {
    downloadCsv('inventory.csv', [
      ['SKU', 'Product', 'Warehouse', 'On hand', 'Reserved', 'Damaged', 'Blocked', 'Available', 'Reorder level', 'Status'],
      ...rows.map((i) => [i.sku, i.productName, i.warehouseName, i.onHand, i.reserved, i.damaged, i.blocked, i.available, i.reorderLevel, i.stockStatus]),
    ]);
  }

  trackById = (_: number, i: InventoryItem) => i.id;
}

// ------------------------------------------------------------------------------ movements

@Component({
  selector: 'wms-movements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Inventory · {{ (context.active$ | async)?.name || 'All warehouses' }}</div>
          <h1>Inventory</h1>
          <p>Every stock change, in order. Balances always equal the sum of these movements.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" (click)="export(s.page?.content ?? [])" [disabled]="!s.page?.content?.length"><wms-icon name="download"></wms-icon>Export</button>
        </div>
      </section>
      ${INVENTORY_TABS}
      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search movements</span>
            <input type="search" placeholder="Search SKU, reference, bin, user…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Movement type" [value]="list.filter('type')" (change)="list.setFilter('type', $any($event.target).value)">
            <option value="">All types</option>
            <option *ngFor="let t of types" [value]="t">{{ t | humanize }}</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements | number }} movements</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="movements" icon="activity" emptyTitle="No movements yet" (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead><tr><th scope="col"><button type="button" (click)="list.sortBy('at')">When</button></th><th scope="col">Type</th><th scope="col">Warehouse</th><th scope="col">Bin</th><th scope="col">Product</th><th scope="col" class="num">Qty</th><th scope="col">Reference</th><th scope="col">Reason</th><th scope="col">By</th></tr></thead>
            <tbody>
              <tr *ngFor="let m of s.page.content; trackBy: trackById">
                <td>{{ m.at | wmsDate: 'datetime' }}</td>
                <td><span class="chip">{{ m.type | humanize }}</span></td>
                <td>{{ m.warehouseName }}</td>
                <td class="code">{{ m.binCode }}</td>
                <td><div class="cell-stack"><strong>{{ m.productName }}</strong><small class="code">{{ m.sku }}</small></div></td>
                <td class="num"><strong>{{ signed(m) }}</strong></td>
                <td class="code">{{ m.reference }}</td>
                <td>{{ m.reason || '—' }}</td>
                <td>{{ m.user }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" [sizes]="[25, 50, 100, 200]" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
})
export class MovementsComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly types = MOVEMENT_TYPES;
  readonly list = new ListController<Movement>((p) => this.api.movements(p), {
    size: 50,
    sort: 'at,desc',
    reload$: this.context.activeId$.pipe(skip(1)),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  constructor(private readonly api: InventoryApi, private readonly router: Router, private readonly route: ActivatedRoute, readonly context: WarehouseContext) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** On-hand changes are signed; reserve/release/damage show the bucket quantity. */
  signed(m: Movement): string {
    if (['RESERVE', 'RELEASE', 'DAMAGE'].includes(m.type)) return m.qty.toLocaleString('en-US');
    return (m.qty > 0 ? '+' : m.qty < 0 ? '−' : '') + Math.abs(m.qty).toLocaleString('en-US');
  }

  export(rows: Movement[]): void {
    downloadCsv('movements.csv', [
      ['When', 'Type', 'Warehouse', 'Bin', 'SKU', 'Product', 'Qty', 'Reference', 'Reason', 'User'],
      ...rows.map((m) => [m.at, m.type, m.warehouseName, m.binCode, m.sku, m.productName, m.qty, m.reference, m.reason, m.user]),
    ]);
  }

  trackById = (_: number, m: Movement) => m.id;
}

// ------------------------------------------------------------------------------ transfers list

@Component({
  selector: 'wms-transfers',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Inventory</div>
          <h1>Stock transfers</h1>
          <p>Move inventory between warehouses: request → approve → dispatch → receive.</p>
        </div>
        <div class="page-actions">
          <button *wmsCan="'transfers:create'" type="button" class="btn btn-primary" (click)="create()"><wms-icon name="plus"></wms-icon>Request transfer</button>
        </div>
      </section>

      <section class="kpi-strip" *ngIf="counts$ | async as c">
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'REQUESTED')"><span class="tone-icon tone-orange"><wms-icon name="clock"></wms-icon></span><div><strong>{{ c.REQUESTED }}</strong><small>Awaiting approval</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'APPROVED')"><span class="tone-icon tone-blue"><wms-icon name="check"></wms-icon></span><div><strong>{{ c.APPROVED }}</strong><small>Approved, to dispatch</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'IN_TRANSIT')"><span class="tone-icon tone-sky"><wms-icon name="shipping"></wms-icon></span><div><strong>{{ c.IN_TRANSIT }}</strong><small>In transit</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'COMPLETED')"><span class="tone-icon tone-green"><wms-icon name="check-circle"></wms-icon></span><div><strong>{{ c.COMPLETED }}</strong><small>Completed</small></div></button>
      </section>

      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search transfers</span>
            <input type="search" placeholder="Search number, warehouse, SKU…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
            <option value="">All statuses</option>
            <option *ngFor="let st of statuses" [value]="st">{{ st | humanize }}</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} transfers</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="transfers" icon="transfer" emptyTitle="No transfers yet" (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead><tr><th scope="col">Transfer</th><th scope="col">From</th><th scope="col">To</th><th scope="col">Products</th><th scope="col" class="num">Units</th><th scope="col">Requested by</th><th scope="col"><button type="button" (click)="list.sortBy('requestedAt')">Requested</button></th><th scope="col">Status</th></tr></thead>
            <tbody>
              <tr *ngFor="let t of s.page.content; trackBy: trackById">
                <td><a class="code" [routerLink]="['/transfers', t.id]">{{ t.number }}</a></td>
                <td>{{ t.sourceWarehouseName }}</td>
                <td>{{ t.destWarehouseName }}</td>
                <td>{{ t.lines[0].productName }}<span class="muted" *ngIf="t.lines.length > 1"> +{{ t.lines.length - 1 }}</span></td>
                <td class="num">{{ t.totalQty | number }}</td>
                <td>{{ t.requestedBy }}</td>
                <td>{{ t.requestedAt | wmsDate }}</td>
                <td><wms-status [value]="t.status"></wms-status></td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
  styles: ['.as-btn { text-align: left; cursor: pointer; } .as-btn:hover { border-color: var(--wms-primary); }'],
})
export class TransfersComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly changed$ = new Subject<void>();
  readonly statuses = ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'COMPLETED', 'REJECTED', 'CANCELLED'];
  readonly list = new ListController<Transfer>((p) => this.api.transfers(p), {
    sort: 'requestedAt,desc',
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });
  readonly counts$ = merge(this.context.activeId$, this.changed$).pipe(
    switchMap(() => this.api.transfers({ size: 200 })),
    map((p) => {
      const c: Record<Transfer['status'], number> = { REQUESTED: 0, APPROVED: 0, IN_TRANSIT: 0, COMPLETED: 0, REJECTED: 0, CANCELLED: 0 };
      p.content.forEach((t) => c[t.status]++);
      return c;
    }),
  );

  constructor(
    private readonly api: InventoryApi,
    private readonly dialogs: DialogService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly context: WarehouseContext,
    private readonly session: AuthSession,
  ) {}

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('new') && this.session.can('transfers:create')) this.create();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  create(): void {
    this.dialogs.open<Transfer>(TransferDialogComponent).subscribe((t) => {
      if (!t) return;
      this.changed$.next();
      void this.router.navigate(['/transfers', t.id]);
    });
  }

  trackById = (_: number, t: Transfer) => t.id;
}

// ------------------------------------------------------------------------------ transfer detail

type TransferCommand = 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel';

interface TransferAction {
  command: TransferCommand;
  label: string;
  permission: string;
  primary?: boolean;
  confirm: Omit<ConfirmData, 'action'>;
}

const STEPS: Transfer['status'][] = ['REQUESTED', 'APPROVED', 'IN_TRANSIT', 'COMPLETED'];

@Component({
  selector: 'wms-transfer-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="state$ | async as s">
      <nav class="breadcrumb" aria-label="Breadcrumb"><a routerLink="/transfers">Stock transfers</a><span aria-hidden="true">/</span><span aria-current="page">{{ s.data?.number || '…' }}</span></nav>
      <div class="panel" *ngIf="s.status !== 'ready'"><wms-state-view [status]="s.status" [error]="s.error" entity="this transfer" emptyTitle="Transfer not found" (retry)="reload$.next()"></wms-state-view></div>
      <ng-container *ngIf="s.data as t">
        <section class="page-header">
          <div>
            <h1>{{ t.number }} <wms-status [value]="t.status"></wms-status></h1>
            <p>{{ t.sourceWarehouseName }} → {{ t.destWarehouseName }} · requested by {{ t.requestedBy }} on {{ t.requestedAt | wmsDate: 'datetime' }}</p>
          </div>
          <div class="page-actions">
            <ng-container *ngFor="let a of actionsFor(t)">
              <button *wmsCan="a.permission" type="button" class="btn" [class.btn-primary]="a.primary" (click)="run(t, a)">{{ a.label }}</button>
            </ng-container>
          </div>
        </section>

        <ol class="steps" aria-label="Progress" *ngIf="!['REJECTED', 'CANCELLED'].includes(t.status)">
          <li *ngFor="let st of steps; let i = index" [class.done]="stepIndex(t) > i" [class.current]="stepIndex(t) === i">
            <span class="step-dot"><wms-icon *ngIf="stepIndex(t) > i" name="check" [size]="12"></wms-icon></span>{{ st | humanize }}
          </li>
        </ol>
        <div class="inline-alert danger" *ngIf="t.status === 'REJECTED'"><wms-icon name="ban"></wms-icon><span>Rejected{{ t.note ? ': ' + t.note : '' }}</span></div>
        <div class="inline-alert warning" *ngIf="t.status === 'CANCELLED'"><wms-icon name="ban"></wms-icon><span>Cancelled. Any reserved stock was released.</span></div>

        <section class="panel">
          <div class="panel-heading"><div><h2>Products</h2><p>{{ t.totalQty | number }} units in {{ t.lines.length }} line{{ t.lines.length === 1 ? '' : 's' }}</p></div></div>
          <div class="table-scroll" style="margin-top: 12px">
            <table class="data-table">
              <thead><tr><th scope="col">SKU</th><th scope="col">Product</th><th scope="col" class="num">Quantity</th></tr></thead>
              <tbody><tr *ngFor="let l of t.lines"><td class="code">{{ l.sku }}</td><td><strong>{{ l.productName }}</strong></td><td class="num">{{ l.qty | number }}</td></tr></tbody>
            </table>
          </div>
          <p class="note" *ngIf="t.note && t.status !== 'REJECTED'">Note: {{ t.note }}</p>
        </section>
      </ng-container>
    </ng-container>
  `,
  styles: [
    `
      h1 wms-status { vertical-align: middle; margin-left: 8px; }
      .note { padding: 0 20px 16px; font-size: 12px; color: var(--wms-text-muted); }
      .steps { list-style: none; display: flex; gap: 0; padding: 0; margin: 0 0 20px; background: var(--wms-surface); border: 1px solid var(--wms-border); border-radius: var(--wms-radius-lg); overflow-x: auto; }
      .steps li { flex: 1; display: flex; align-items: center; gap: 8px; padding: 14px 16px; font-size: 12px; color: var(--wms-text-subtle); white-space: nowrap; border-right: 1px solid var(--wms-divider); }
      .steps li:last-child { border-right: 0; }
      .step-dot { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--wms-border-strong); display: inline-flex; align-items: center; justify-content: center; flex: 0 0 20px; }
      .steps li.done { color: var(--wms-text-body); }
      .steps li.done .step-dot { background: var(--wms-success); border-color: var(--wms-success); color: #fff; }
      .steps li.current { color: var(--wms-primary); font-weight: 600; }
      .steps li.current .step-dot { border-color: var(--wms-primary); }
    `,
  ],
})
export class TransferDetailComponent {
  readonly steps = STEPS;
  readonly reload$ = new Subject<void>();
  readonly state$: Observable<ResourceState<Transfer>> = merge(this.route.paramMap, this.reload$).pipe(
    switchMap(() => loadResource(this.api.transfer(this.route.snapshot.paramMap.get('id') ?? ''))),
  );

  constructor(private readonly api: InventoryApi, private readonly route: ActivatedRoute, private readonly dialogs: DialogService, private readonly toasts: ToastService) {}

  stepIndex(t: Transfer): number {
    return STEPS.indexOf(t.status) + (t.status === 'COMPLETED' ? 1 : 0);
  }

  actionsFor(t: Transfer): TransferAction[] {
    const route = `${t.sourceWarehouseName} → ${t.destWarehouseName}`;
    switch (t.status) {
      case 'REQUESTED':
        return [
          { command: 'reject', label: 'Reject', permission: 'transfers:approve', confirm: { title: `Reject ${t.number}?`, message: `${route}. The requester sees your reason.`, confirmLabel: 'Reject transfer', tone: 'danger', reasonLabel: 'Reason', reasonRequired: true } },
          { command: 'cancel', label: 'Cancel request', permission: 'transfers:create', confirm: { title: `Cancel ${t.number}?`, message: 'The request is withdrawn.', confirmLabel: 'Cancel request', tone: 'danger' } },
          { command: 'approve', label: 'Approve', permission: 'transfers:approve', primary: true, confirm: { title: `Approve ${t.number}?`, message: `${t.totalQty} units are reserved in ${t.sourceWarehouseName} so they cannot be sold meanwhile.`, confirmLabel: 'Approve and reserve' } },
        ];
      case 'APPROVED':
        return [
          { command: 'cancel', label: 'Cancel', permission: 'transfers:create', confirm: { title: `Cancel ${t.number}?`, message: 'Reserved stock is released back to the source warehouse.', confirmLabel: 'Cancel transfer', tone: 'danger' } },
          { command: 'dispatch', label: 'Dispatch', permission: 'transfers:create', primary: true, confirm: { title: `Dispatch ${t.number}?`, message: `${t.totalQty} units leave ${t.sourceWarehouseName} and are in transit until received.`, confirmLabel: 'Confirm dispatch' } },
        ];
      case 'IN_TRANSIT':
        return [
          { command: 'receive', label: 'Receive at destination', permission: 'transfers:create', primary: true, confirm: { title: `Receive ${t.number}?`, message: `${t.totalQty} units are booked into the receiving bin at ${t.destWarehouseName}.`, confirmLabel: 'Confirm receipt' } },
        ];
      default:
        return [];
    }
  }

  run(t: Transfer, a: TransferAction): void {
    this.dialogs
      .confirm({ ...a.confirm, action: (reason) => this.api.transferCommand(t.id, a.command, a.command === 'reject' ? { reason } : {}) })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${t.number}: ${a.label.toLowerCase()} done`);
        this.reload$.next();
      });
  }
}
