import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of, Subject } from 'rxjs';
import { catchError, skip, startWith, switchMap } from 'rxjs/operators';

import {
  AuthSession,
  CycleCount,
  CycleCountLine,
  errorMessage,
  InventoryApi,
  ListController,
  ToastService,
  WarehouseApi,
  WarehouseContext,
  Zone,
} from '@wms/core';
import { DialogService, FormDialog } from '@wms/design-system';
import { INVENTORY_TABS } from './inventory-pages';

// ------------------------------------------------------------------------------ list

/** Physical stock counts: expected quantities are snapshotted, counted, then approved into the ledger. */
@Component({
  selector: 'wms-cycle-counts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Inventory · {{ (context.active$ | async)?.name || 'All warehouses' }}</div>
          <h1>Inventory</h1>
          <p>Count what is on the shelves; approved differences are posted to the ledger as adjustments.</p>
        </div>
        <div class="page-actions">
          <button *wmsCan="'inventory:edit'" type="button" class="btn btn-primary" (click)="create()"><wms-icon name="plus"></wms-icon>New count</button>
        </div>
      </section>
      ${INVENTORY_TABS}
      <section class="panel">
        <div class="table-controls">
          <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="COUNTED">Counted</option>
            <option value="APPROVED">Approved</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements | number }} counts</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="cycle counts" icon="scan" emptyTitle="No counts yet" (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead><tr><th scope="col"><button type="button" (click)="list.sortBy('number')">Count</button></th><th scope="col">Warehouse</th><th scope="col" class="num">Lines</th><th scope="col" class="num">Lines with a difference</th><th scope="col" class="num">Net difference</th><th scope="col">Status</th><th scope="col"><button type="button" (click)="list.sortBy('createdAt')">Started</button></th></tr></thead>
            <tbody>
              <tr *ngFor="let c of s.page.content; trackBy: trackById" class="clickable" (click)="open(c)">
                <td><a [routerLink]="['/inventory/counts', c.id]" class="code" (click)="$event.stopPropagation()">{{ c.number }}</a><div class="muted" *ngIf="c.note">{{ c.note }}</div></td>
                <td>{{ c.warehouseName }}</td>
                <td class="num">{{ c.lineCount | number }}</td>
                <td class="num">{{ c.status === 'OPEN' ? '—' : (c.varianceLines | number) }}</td>
                <td class="num">{{ c.status === 'OPEN' ? '—' : signed(c.netVariance) }}</td>
                <td><wms-status [value]="c.status"></wms-status></td>
                <td>{{ c.createdAt | wmsDate: 'datetime' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
})
export class CycleCountsComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly list = new ListController<CycleCount>((p) => this.api.cycleCounts(p), {
    sort: 'createdAt,desc',
    reload$: this.context.activeId$.pipe(skip(1)),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  constructor(
    private readonly api: InventoryApi,
    private readonly dialogs: DialogService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly context: WarehouseContext,
  ) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  create(): void {
    this.dialogs.open<CycleCount>(CycleCountDialogComponent).subscribe((c) => c && void this.router.navigate(['/inventory/counts', c.id]));
  }

  open(c: CycleCount): void {
    void this.router.navigate(['/inventory/counts', c.id]);
  }

  signed(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US');
  }

  trackById = (_: number, c: CycleCount) => c.id;
}

// ------------------------------------------------------------------------------ new count

@Component({
  selector: 'wms-cycle-count-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="cc-title">
      <div class="dialog-header">
        <div><h2 id="cc-title">New cycle count</h2><p>Every bin with stock in the area is listed with its current quantity.</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="cc-wh">Warehouse <span class="req">*</span></label>
            <select id="cc-wh" class="select" formControlName="warehouseId">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let w of context.activeOptions$ | async" [value]="w.id">{{ w.name }}</option>
            </select>
            <wms-field-error [control]="form.controls.warehouseId" label="Warehouse"></wms-field-error>
          </div>
          <div class="field">
            <label for="cc-zone">Zone</label>
            <select id="cc-zone" class="select" formControlName="zoneId">
              <option value="">Whole warehouse</option>
              <option *ngFor="let z of zones$ | async" [value]="z.id">{{ z.name }} ({{ z.code }})</option>
            </select>
          </div>
          <div class="field full">
            <label for="cc-note">Note</label>
            <input id="cc-note" class="input" formControlName="note" placeholder="e.g. Quarterly count, picking zone" />
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Starting…' : 'Start count' }}</button>
      </div>
    </form>
  `,
})
export class CycleCountDialogComponent extends FormDialog<CycleCount> {
  readonly form = new FormGroup({
    warehouseId: new FormControl(this.context.activeId ?? '', { nonNullable: true, validators: [Validators.required] }),
    zoneId: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true }),
  });
  readonly zones$: Observable<Zone[]> = this.form.controls.warehouseId.valueChanges.pipe(
    startWith(this.form.controls.warehouseId.value),
    switchMap((id) => (id ? this.warehouses.zones(id).pipe(catchError(() => of([] as Zone[]))) : of([] as Zone[]))),
  );

  constructor(
    cdr: ChangeDetectorRef,
    toasts: ToastService,
    ref: DialogRef<CycleCount>,
    readonly context: WarehouseContext,
    private readonly api: InventoryApi,
    private readonly warehouses: WarehouseApi,
  ) {
    super(cdr, toasts, ref);
  }

  save(): void {
    const v = this.form.getRawValue();
    this.submit(this.api.createCycleCount({ warehouseId: v.warehouseId, zoneId: v.zoneId || null, note: v.note }), 'Cycle count started');
  }
}

// ------------------------------------------------------------------------------ detail

@Component({
  selector: 'wms-cycle-count-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="state-loading" *ngIf="!count && !error">Loading…</div>
    <div class="inline-alert danger" *ngIf="error" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ error }}</span></div>
    <ng-container *ngIf="count as c">
      <section class="page-header">
        <div>
          <div class="eyebrow"><a routerLink="/inventory/counts">Cycle counts</a> · {{ c.warehouseName }}</div>
          <h1>{{ c.number }} <wms-status [value]="c.status"></wms-status></h1>
          <p>{{ c.note || 'Enter what is physically in each bin. Leave the expected quantity if it matches.' }}</p>
        </div>
        <div class="page-actions">
          <button *ngIf="c.status === 'OPEN' || c.status === 'COUNTED'" type="button" class="btn" (click)="cancel()" [disabled]="busy">Cancel count</button>
          <button *ngIf="editable" type="button" class="btn" (click)="fillExpected()" [disabled]="busy">Fill blanks with expected</button>
          <button *ngIf="editable" type="button" class="btn btn-primary" (click)="save()" [disabled]="busy">{{ busy ? 'Saving…' : 'Save counts' }}</button>
          <ng-container *ngIf="c.status === 'COUNTED'">
            <button *wmsCan="'inventory:approve'" type="button" class="btn btn-primary" (click)="approve()" [disabled]="busy">Approve and adjust stock</button>
          </ng-container>
        </div>
      </section>

      <section class="stats-row">
        <div class="stat"><span>Lines</span><strong>{{ c.lineCount | number }}</strong></div>
        <div class="stat"><span>Counted</span><strong>{{ counted(c) | number }}</strong></div>
        <div class="stat"><span>Lines with a difference</span><strong>{{ c.varianceLines | number }}</strong></div>
        <div class="stat"><span>Net difference</span><strong>{{ signed(c.netVariance) }}</strong></div>
        <div class="stat" *ngIf="c.approvedBy"><span>Approved</span><strong>{{ c.approvedBy }}</strong><small>{{ c.approvedAt | wmsDate: 'datetime' }}</small></div>
      </section>

      <section class="panel">
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th scope="col">Bin</th><th scope="col">Product</th><th scope="col" class="num">Expected</th><th scope="col" class="num">Counted</th><th scope="col" class="num">Difference</th></tr></thead>
            <tbody>
              <tr *ngFor="let l of c.lines; trackBy: trackByLine" [class.row-warning]="l.countedQty !== null && l.variance !== 0">
                <td class="code">{{ l.binCode }}</td>
                <td><div class="cell-stack"><strong>{{ l.productName }}</strong><small class="code">{{ l.sku }}</small></div></td>
                <td class="num">{{ l.expectedQty | number }}</td>
                <td class="num">
                  <input *ngIf="editable; else shown" class="input count-input" type="number" min="0" step="1" [formControl]="control(l)" [attr.aria-label]="'Counted in ' + l.binCode + ' for ' + l.sku" />
                  <ng-template #shown>{{ l.countedQty === null ? '—' : (l.countedQty | number) }}</ng-template>
                </td>
                <td class="num"><strong>{{ difference(l) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </ng-container>
  `,
  styles: [
    '.count-input { width: 96px; text-align: right; }',
    '.row-warning td { background: var(--wms-warning-soft, #fff7e6); }',
    '.stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }',
    '.stats-row .stat { background: var(--wms-surface); border: 1px solid var(--wms-border); border-radius: 8px; padding: 10px 14px; display: grid; gap: 2px; min-width: 140px; }',
    '.stats-row .stat span { font-size: 12px; color: var(--wms-text-muted); }',
  ],
})
export class CycleCountDetailComponent implements OnInit {
  count: CycleCount | null = null;
  error = '';
  busy = false;
  private controls = new Map<number, FormControl<number | null>>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: InventoryApi,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly session: AuthSession,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load(this.api.cycleCount(this.route.snapshot.paramMap.get('id') ?? ''));
  }

  /** Counts can be entered and corrected until approval, by people who may edit inventory. */
  get editable(): boolean {
    return !!this.count && (this.count.status === 'OPEN' || this.count.status === 'COUNTED') && this.session.can('inventory:edit');
  }

  control(l: CycleCountLine): FormControl<number | null> {
    let c = this.controls.get(l.lineNo);
    if (!c) {
      c = new FormControl<number | null>(l.countedQty, [Validators.min(0)]);
      this.controls.set(l.lineNo, c);
    }
    return c;
  }

  counted(c: CycleCount): number {
    return c.lines.filter((l) => (this.editable ? this.control(l).value : l.countedQty) !== null).length;
  }

  difference(l: CycleCountLine): string {
    const v = this.editable ? this.control(l).value : l.countedQty;
    return v === null || v === undefined || (v as unknown) === '' ? '—' : this.signed(Number(v) - l.expectedQty);
  }

  fillExpected(): void {
    this.count?.lines.forEach((l) => {
      const c = this.control(l);
      if (c.value === null || (c.value as unknown) === '') c.setValue(l.expectedQty);
    });
  }

  save(): void {
    if (!this.count) return;
    const lines = this.count.lines
      .map((l) => ({ lineNo: l.lineNo, countedQty: this.control(l).value }))
      .filter((l) => l.countedQty !== null && (l.countedQty as unknown) !== '' && Number(l.countedQty) >= 0)
      .map((l) => ({ lineNo: l.lineNo, countedQty: Number(l.countedQty) }));
    if (!lines.length) {
      this.toasts.error('Enter at least one count');
      return;
    }
    this.load(this.api.recordCounts(this.count.id, lines), (c) =>
      this.toasts.success(c.status === 'COUNTED' ? 'All lines counted: ready for approval' : 'Counts saved'),
    );
  }

  approve(): void {
    const c = this.count;
    if (!c) return;
    this.dialogs
      .confirm({
        title: `Approve ${c.number}?`,
        message: `${c.varianceLines} line(s) differ, net ${this.signed(c.netVariance)} units. Each difference is posted to the ledger as a "Cycle count correction" adjustment.`,
        confirmLabel: 'Approve and adjust',
        tone: 'primary',
        action: () => this.api.approveCycleCount(c.id),
      })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${c.number} approved`);
        this.load(this.api.cycleCount(c.id));
      });
  }

  cancel(): void {
    const c = this.count;
    if (!c) return;
    this.dialogs
      .confirm({ title: `Cancel ${c.number}?`, message: 'The counts entered so far are discarded; stock is not changed.', confirmLabel: 'Cancel count', tone: 'danger', action: () => this.api.cancelCycleCount(c.id) })
      .subscribe((r) => r && this.load(this.api.cycleCount(c.id)));
  }

  signed(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US');
  }

  trackByLine = (_: number, l: CycleCountLine) => l.lineNo;

  private load(call: Observable<CycleCount>, then?: (c: CycleCount) => void): void {
    this.busy = true;
    call.subscribe({
      next: (c) => {
        this.count = c;
        this.controls = new Map();
        this.busy = false;
        this.error = '';
        then?.(c);
        this.cdr.markForCheck();
      },
      error: (e: unknown) => {
        this.busy = false;
        if (this.count) this.toasts.error(errorMessage(e));
        else this.error = errorMessage(e);
        this.cdr.markForCheck();
      },
    });
  }
}
