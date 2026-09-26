import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject, merge, of } from 'rxjs';
import { catchError, map, skip, switchMap, tap } from 'rxjs/operators';

import { errorMessage } from '@core/api/api-error';
import { CatalogApi, InboundApi, PartnerOption, ProductOption, WarehouseApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { Bin, Inbound } from '@core/models';
import { ToastService } from '@core/notify/toast.service';
import { ListController, ResourceState, loadResource } from '@core/state/list-controller';
import { DialogService } from '@shared/ui/dialogs';
import { FormDialog } from '@shared/ui/form-dialog';
import { LineForm, lineGroup } from '@shared/ui/line-items.component';

const STATUSES: Inbound['status'][] = ['EXPECTED', 'RECEIVING', 'PUTAWAY_PENDING', 'COMPLETED', 'CANCELLED'];

// ------------------------------------------------------------------------------ create

@Component({
  selector: 'wms-inbound-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog lg" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="ib-title">
      <div class="dialog-header">
        <div><h2 id="ib-title">Schedule inbound shipment</h2><p>Creates an advance shipping notice (ASN) the dock can receive against.</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="ib-sup">Supplier <span class="req">*</span></label>
            <select id="ib-sup" class="select" formControlName="supplierId">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let s of suppliers" [value]="s.id">{{ s.name }}</option>
            </select>
            <wms-field-error [control]="form.controls.supplierId" label="Supplier"></wms-field-error>
          </div>
          <div class="field">
            <label for="ib-wh">Receiving warehouse <span class="req">*</span></label>
            <select id="ib-wh" class="select" formControlName="warehouseId">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let w of warehouses$ | async" [value]="w.id">{{ w.name }}</option>
            </select>
            <wms-field-error [control]="form.controls.warehouseId" label="Warehouse"></wms-field-error>
          </div>
          <div class="field">
            <label for="ib-eta">Expected arrival <span class="req">*</span></label>
            <input id="ib-eta" class="input" type="datetime-local" formControlName="expectedAt" />
            <wms-field-error [control]="form.controls.expectedAt" label="Expected arrival"></wms-field-error>
          </div>
          <div class="field">
            <label for="ib-po">Purchase order</label>
            <input id="ib-po" class="input" formControlName="poReference" placeholder="PO-88260" />
          </div>
          <div class="field full">
            <span class="label">Expected products</span>
            <wms-line-items [lines]="form.controls.lines" [products]="products" qtyLabel="Expected qty"></wms-line-items>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : 'Schedule shipment' }}</button>
      </div>
    </form>
  `,
})
export class InboundDialogComponent extends FormDialog<Inbound> {
  suppliers: PartnerOption[] = [];
  products: ProductOption[] = [];
  readonly warehouses$ = this.context.activeOptions$;
  readonly form = new FormGroup({
    supplierId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    warehouseId: new FormControl(this.context.activeId ?? '', { nonNullable: true, validators: [Validators.required] }),
    expectedAt: new FormControl(localInput(new Date(Date.now() + 86400000)), { nonNullable: true, validators: [Validators.required] }),
    poReference: new FormControl('', { nonNullable: true }),
    lines: new FormArray<LineForm>([lineGroup()]),
  });

  constructor(
    private readonly api: InboundApi,
    catalog: CatalogApi,
    private readonly context: WarehouseContext,
    ref: DialogRef<Inbound>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    catalog.supplierOptions().subscribe((s) => ((this.suppliers = s), cdr.markForCheck()));
    catalog.productOptions().subscribe((p) => ((this.products = p), cdr.markForCheck()));
  }

  save(): void {
    const v = this.form.getRawValue();
    this.submit(
      this.api.create({
        ...v,
        expectedAt: new Date(v.expectedAt).toISOString(),
        lines: v.lines.map((l) => ({ productId: l.productId, expectedQty: Number(l.qty) })),
      }),
      'Inbound shipment scheduled',
    );
  }
}

function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ------------------------------------------------------------------------------ list

@Component({
  selector: 'wms-inbound-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Inbound · {{ (context.active$ | async)?.name || 'All warehouses' }}</div>
          <h1>Inbound</h1>
          <p>Expected deliveries, receiving and putaway.</p>
        </div>
        <div class="page-actions">
          <button *wmsCan="'inbound:create'" type="button" class="btn btn-primary" (click)="create()"><wms-icon name="plus"></wms-icon>Schedule shipment</button>
        </div>
      </section>

      <section class="kpi-strip" *ngIf="counts$ | async as c">
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'EXPECTED')"><span class="tone-icon tone-navy"><wms-icon name="calendar"></wms-icon></span><div><strong>{{ c.EXPECTED }}</strong><small>Expected</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'RECEIVING')"><span class="tone-icon tone-blue"><wms-icon name="inbound"></wms-icon></span><div><strong>{{ c.RECEIVING }}</strong><small>At the dock</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'PUTAWAY_PENDING')"><span class="tone-icon tone-orange"><wms-icon name="layers"></wms-icon></span><div><strong>{{ c.PUTAWAY_PENDING }}</strong><small>Awaiting putaway</small></div></button>
        <button type="button" class="kpi-tile as-btn" (click)="list.setFilter('status', 'COMPLETED')"><span class="tone-icon tone-green"><wms-icon name="check-circle"></wms-icon></span><div><strong>{{ c.COMPLETED }}</strong><small>Completed</small></div></button>
      </section>

      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search inbound</span>
            <input type="search" placeholder="Search ASN, PO, supplier…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
            <option value="">All statuses</option>
            <option *ngFor="let st of statuses" [value]="st">{{ st | humanize }}</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} shipments</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="inbound shipments" icon="inbound" emptyTitle="Nothing inbound" emptyHint="Schedule a shipment when a supplier confirms a delivery." (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead><tr><th scope="col">Shipment</th><th scope="col">Supplier</th><th scope="col">Warehouse</th><th scope="col"><button type="button" (click)="list.sortBy('expectedAt')">Expected</button></th><th scope="col" class="num">Lines</th><th scope="col" class="num">Units</th><th scope="col">Status</th></tr></thead>
            <tbody>
              <tr *ngFor="let x of s.page.content; trackBy: trackById">
                <td><div class="cell-stack"><a class="code" [routerLink]="['/inbound', x.id]">{{ x.number }}</a><small>{{ x.poReference }}</small></div></td>
                <td><strong>{{ x.supplierName }}</strong></td>
                <td>{{ x.warehouseName }}</td>
                <td>{{ x.expectedAt | wmsDate: 'datetime' }}</td>
                <td class="num">{{ x.lines.length }}</td>
                <td class="num">{{ x.status === 'EXPECTED' || x.status === 'RECEIVING' ? (x.totalExpected | number) : (x.totalReceived | number) + ' / ' + (x.totalExpected | number) }}</td>
                <td><wms-status [value]="x.status"></wms-status> <span class="chip warn" *ngIf="x.discrepancy">Discrepancy</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
  styles: ['.as-btn { text-align: left; cursor: pointer; } .as-btn:hover { border-color: var(--wms-primary); } .chip.warn { background: var(--wms-warning-soft); color: var(--wms-warning); }'],
})
export class InboundListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly changed$ = new Subject<void>();
  readonly statuses = STATUSES;
  readonly list = new ListController<Inbound>((p) => this.api.list(p), {
    sort: 'expectedAt,desc',
    reload$: merge(this.context.activeId$.pipe(skip(1)), this.changed$),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });
  readonly counts$ = merge(this.context.activeId$, this.changed$).pipe(
    switchMap(() => this.api.list({ size: 200 })),
    map((p) => {
      const c: Record<Inbound['status'], number> = { EXPECTED: 0, RECEIVING: 0, PUTAWAY_PENDING: 0, COMPLETED: 0, CANCELLED: 0 };
      p.content.forEach((x) => c[x.status]++);
      return c;
    }),
  );

  constructor(
    private readonly api: InboundApi,
    private readonly dialogs: DialogService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly context: WarehouseContext,
    private readonly session: AuthSession,
  ) {}

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('new') && this.session.can('inbound:create')) this.create();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  create(): void {
    this.dialogs.open<Inbound>(InboundDialogComponent).subscribe((x) => {
      if (!x) return;
      this.changed$.next();
      void this.router.navigate(['/inbound', x.id]);
    });
  }

  trackById = (_: number, x: Inbound) => x.id;
}

// ------------------------------------------------------------------------------ detail

type ReceiveRow = FormGroup<{ productId: FormControl<string>; receivedQty: FormControl<number>; damagedQty: FormControl<number> }>;
type PutawayRow = FormGroup<{ productId: FormControl<string>; binId: FormControl<string> }>;

@Component({
  selector: 'wms-inbound-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './inbound-detail.component.html',
  styles: [
    `
      h1 wms-status { vertical-align: middle; margin-left: 8px; }
      .facts { padding: 16px 20px 20px; }
      .qty-input { width: 100px; }
      .bin-select { min-width: 220px; }
      .form-actions { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px 18px; border-top: 1px solid var(--wms-divider); }
      .diff { font-size: 11px; }
      .diff.bad { color: var(--wms-warning); font-weight: 600; }
    `,
  ],
})
export class InboundDetailComponent {
  readonly reload$ = new Subject<void>();
  bins: Bin[] = [];
  busy = false;
  banner = '';
  receiveForm = new FormArray<ReceiveRow>([]);
  putawayForm = new FormArray<PutawayRow>([]);

  readonly state$: Observable<ResourceState<Inbound>> = merge(this.route.paramMap, this.reload$).pipe(
    switchMap(() => loadResource(this.api.get(this.route.snapshot.paramMap.get('id') ?? ''))),
    tap((s) => s.data && this.prepareForms(s.data)),
  );

  constructor(
    private readonly api: InboundApi,
    private readonly warehouses: WarehouseApi,
    private readonly route: ActivatedRoute,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly cdr: ChangeDetectorRef,
    readonly session: AuthSession,
  ) {}

  get canEdit(): boolean {
    return this.session.can('inbound:edit');
  }

  private prepareForms(x: Inbound): void {
    this.banner = '';
    if (x.status === 'RECEIVING') {
      this.receiveForm = new FormArray<ReceiveRow>(
        x.lines.map(
          (l) =>
            new FormGroup({
              productId: new FormControl(l.productId, { nonNullable: true }),
              receivedQty: new FormControl(l.expectedQty, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)] }),
              damagedQty: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)] }),
            }),
        ),
      );
    }
    if (x.status === 'PUTAWAY_PENDING') {
      const toStore = x.lines.filter((l) => l.receivedQty - l.damagedQty > 0);
      this.putawayForm = new FormArray<PutawayRow>(
        toStore.map((l) => new FormGroup({ productId: new FormControl(l.productId, { nonNullable: true }), binId: new FormControl('', { nonNullable: true, validators: [Validators.required] }) })),
      );
      this.warehouses
        .bins(x.warehouseId, { size: 200, sort: 'code,asc' })
        .pipe(catchError(() => of({ content: [] as Bin[] })))
        .subscribe((p) => {
          this.bins = p.content.filter((b) => !b.blocked && (b.zoneType === 'STORAGE' || b.zoneType === 'PICKING'));
          // Suggest, line by line, the tightest bin that still fits the units, counting space
          // already promised to earlier lines; fall back to the emptiest bin.
          const free = new Map(this.bins.map((b) => [b.id, this.free(b)]));
          for (const g of this.putawayForm.controls) {
            if (g.controls.binId.value) continue;
            const units = this.toStore(x, g.controls.productId.value);
            const fits = this.bins.filter((b) => (free.get(b.id) ?? 0) >= units).sort((a, b) => (free.get(a.id) ?? 0) - (free.get(b.id) ?? 0));
            const pick = fits[0] ?? [...this.bins].sort((a, b) => (free.get(b.id) ?? 0) - (free.get(a.id) ?? 0))[0];
            if (!pick) continue;
            g.controls.binId.setValue(pick.id);
            free.set(pick.id, (free.get(pick.id) ?? 0) - units);
          }
          this.cdr.markForCheck();
        });
    }
  }

  lineName(x: Inbound, productId: string): string {
    const l = x.lines.find((y) => y.productId === productId);
    return l ? `${l.sku} · ${l.productName}` : productId;
  }

  toStore(x: Inbound, productId: string): number {
    const l = x.lines.find((y) => y.productId === productId);
    return l ? l.receivedQty - l.damagedQty : 0;
  }

  free(b: Bin): number {
    return b.capacityUnits - b.usedUnits;
  }

  /** Units by which the chosen bin would overflow, counting every line sent to it. */
  overflow(x: Inbound, binId: string): number {
    const bin = this.bins.find((b) => b.id === binId);
    if (!bin) return 0;
    const planned = this.putawayForm.controls
      .filter((g) => g.controls.binId.value === binId)
      .reduce((a, g) => a + this.toStore(x, g.controls.productId.value), 0);
    return Math.max(0, planned - this.free(bin));
  }

  start(x: Inbound): void {
    this.command(this.api.start(x.id), `Receiving started for ${x.number}`);
  }

  cancel(x: Inbound): void {
    this.dialogs
      .confirm({ title: `Cancel ${x.number}?`, message: 'The shipment will no longer be expected at the dock.', confirmLabel: 'Cancel shipment', tone: 'danger', action: () => this.api.cancel(x.id) })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${x.number} cancelled`);
        this.reload$.next();
      });
  }

  receive(x: Inbound): void {
    this.receiveForm.markAllAsTouched();
    if (this.receiveForm.invalid) return;
    const lines = this.receiveForm.getRawValue().map((r) => ({ productId: r.productId, receivedQty: Number(r.receivedQty), damagedQty: Number(r.damagedQty) }));
    if (lines.some((l) => l.damagedQty > l.receivedQty)) {
      this.banner = 'Damaged units cannot exceed received units.';
      return;
    }
    const total = lines.reduce((a, l) => a + l.receivedQty, 0);
    const differs = lines.some((l, i) => l.receivedQty !== x.lines[i].expectedQty || l.damagedQty > 0);
    const confirm: Observable<unknown> = differs
      ? this.dialogs.confirm({
          title: 'Record a discrepancy?',
          message: `The counts differ from the ASN (${total} of ${x.totalExpected} units, or damage recorded). The shipment will be flagged and the supplier's fill rate updated.`,
          confirmLabel: 'Record counts',
        })
      : of({ confirmed: true as const, reason: '' });
    confirm.subscribe((ok) => ok && this.command(this.api.receive(x.id, { lines }), `${total} units received into ${x.receivingBinCode}`));
  }

  putaway(x: Inbound): void {
    this.putawayForm.markAllAsTouched();
    if (this.putawayForm.invalid) return;
    this.command(this.api.putaway(x.id, { lines: this.putawayForm.getRawValue() }), `${x.number} put away`);
  }

  private command(call: Observable<Inbound>, success: string): void {
    this.busy = true;
    this.banner = '';
    call.subscribe({
      next: () => {
        this.busy = false;
        this.toasts.success(success);
        this.reload$.next();
      },
      error: (e: unknown) => {
        this.busy = false;
        this.banner = errorMessage(e);
        this.cdr.markForCheck();
      },
    });
  }
}

