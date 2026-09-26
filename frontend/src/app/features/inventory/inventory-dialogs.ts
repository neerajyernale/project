import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import {
  ADJUSTMENT_REASONS,
  Bin,
  CatalogApi,
  InventoryApi,
  InventoryBalance,
  InventoryItem,
  loadResource,
  ProductOption,
  ToastService,
  Transfer,
  WarehouseApi,
  WarehouseContext,
} from '@wms/core';
import { DialogService, FormDialog, LineForm, lineGroup } from '@wms/design-system';

// ------------------------------------------------------------------------------ stock by bin

@Component({
  selector: 'wms-balances-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog lg" role="dialog" aria-labelledby="bal-title">
      <div class="dialog-header">
        <div><h2 id="bal-title">{{ item.productName }}</h2><p>{{ item.sku }} · {{ item.warehouseName }} · stock by bin</p></div>
        <button type="button" class="icon-close" (click)="ref.close(changed)" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body" *ngIf="state$ | async as s">
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="stock" (retry)="reload$.next()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.data as rows">
          <table class="data-table">
            <thead><tr><th scope="col">Bin</th><th scope="col">Zone</th><th scope="col" class="num">On hand</th><th scope="col" class="num">Reserved</th><th scope="col" class="num">Damaged</th><th scope="col" class="num">Available</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              <tr *ngFor="let b of rows">
                <td class="code">{{ b.binCode }}</td>
                <td>{{ b.zoneName }}</td>
                <td class="num">{{ b.onHand | number }}</td>
                <td class="num">{{ b.reserved | number }}</td>
                <td class="num">{{ b.damaged | number }}</td>
                <td class="num"><strong>{{ b.available | number }}</strong></td>
                <td>
                  <div class="row-actions" *wmsCan="'inventory:edit'">
                    <button type="button" class="link-btn" (click)="move(b)" [disabled]="!b.available">Move</button>
                    <button type="button" class="link-btn" (click)="adjust(b)">Adjust</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="note">Reserved stock is held for orders and transfers. Available = on hand − reserved − damaged − blocked.</p>
      </div>
      <div class="dialog-footer">
        <a class="btn" routerLink="/inventory/movements" [queryParams]="{ q: item.sku }" (click)="ref.close(changed)"><wms-icon name="activity"></wms-icon>Movement history</a>
        <button type="button" class="btn btn-primary" (click)="ref.close(changed)">Done</button>
      </div>
    </div>
  `,
  styles: ['.note { font-size: 11px; color: var(--wms-text-subtle); margin-top: 12px; }'],
})
export class BalancesDialogComponent {
  readonly reload$ = new BehaviorSubject<void>(undefined);
  changed = false;
  readonly state$ = this.reload$.pipe(
    switchMap(() => loadResource(this.api.balances({ warehouseId: this.item.warehouseId, productId: this.item.productId }))),
  );

  constructor(
    @Inject(DIALOG_DATA) readonly item: InventoryItem,
    readonly ref: DialogRef<boolean>,
    private readonly api: InventoryApi,
    private readonly dialogs: DialogService,
  ) {}

  move(balance: InventoryBalance): void {
    this.dialogs.open<InventoryBalance>(MoveDialogComponent, balance).subscribe((r) => {
      if (!r) return;
      this.changed = true;
      this.reload$.next();
    });
  }

  adjust(balance: InventoryBalance): void {
    this.dialogs.open<InventoryBalance>(AdjustDialogComponent, balance).subscribe((r) => {
      if (!r) return;
      this.changed = true;
      this.reload$.next();
    });
  }
}

// ------------------------------------------------------------------------------ adjust

@Component({
  selector: 'wms-adjust-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="adj-title">
      <div class="dialog-header">
        <div><h2 id="adj-title">Adjust stock</h2><p>{{ b.sku }} · bin {{ b.binCode }} · {{ b.onHand | number }} on hand, {{ b.available | number }} available</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <fieldset class="kind">
          <legend class="label">Type of change</legend>
          <label><input type="radio" formControlName="kind" value="ADJUST" /> Count correction <small>changes on-hand</small></label>
          <label><input type="radio" formControlName="kind" value="DAMAGE" /> Mark as damaged <small>stays on hand, not sellable</small></label>
        </fieldset>
        <div class="form-grid" style="margin-top: 14px">
          <div class="field">
            <label for="adj-qty">{{ form.controls.kind.value === 'DAMAGE' ? 'Damaged units' : 'Change (+/−)' }} <span class="req">*</span></label>
            <input id="adj-qty" class="input num" type="number" step="1" formControlName="qty" />
            <small class="field-hint" *ngIf="form.controls.kind.value === 'ADJUST'">e.g. −12 if 12 units are missing</small>
            <wms-field-error [control]="form.controls.qty" label="Quantity"></wms-field-error>
          </div>
          <div class="field">
            <label for="adj-reason">Reason <span class="req">*</span></label>
            <select id="adj-reason" class="select" formControlName="reason">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let r of reasons" [value]="r">{{ r }}</option>
            </select>
            <wms-field-error [control]="form.controls.reason" label="Reason"></wms-field-error>
          </div>
          <div class="field full">
            <label for="adj-note">Note</label>
            <input id="adj-note" class="input" formControlName="note" placeholder="Optional, e.g. where it was found" />
          </div>
        </div>
        <p class="result" *ngIf="preview !== null">On hand after: <strong>{{ preview | number }}</strong></p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : 'Record adjustment' }}</button>
      </div>
    </form>
  `,
  styles: [
    `
      .kind { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
      .kind legend { margin-bottom: 6px; }
      .kind label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
      .kind small { color: var(--wms-text-subtle); font-size: 11px; }
      .result { margin-top: 12px; font-size: 12px; color: var(--wms-text-muted); }
    `,
  ],
})
export class AdjustDialogComponent extends FormDialog<InventoryBalance> {
  readonly reasons = ADJUSTMENT_REASONS;
  readonly form = new FormGroup({
    kind: new FormControl<'ADJUST' | 'DAMAGE'>('ADJUST', { nonNullable: true }),
    qty: new FormControl<number | null>(null, { validators: [Validators.required, Validators.pattern(/^-?\d+$/)] }),
    reason: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    note: new FormControl('', { nonNullable: true }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly b: InventoryBalance,
    private readonly api: InventoryApi,
    ref: DialogRef<InventoryBalance>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
  }

  get preview(): number | null {
    const q = Number(this.form.controls.qty.value);
    if (!Number.isInteger(q) || q === 0 || this.form.controls.kind.value === 'DAMAGE') return null;
    return this.b.onHand + q;
  }

  save(): void {
    const v = this.form.getRawValue();
    this.submit(
      this.api.adjust({ balanceId: this.b.id, kind: v.kind, qty: Number(v.qty), reason: v.reason, note: v.note }),
      v.kind === 'DAMAGE' ? `${v.qty} units marked damaged` : 'Stock adjusted',
    );
  }
}

// ------------------------------------------------------------------------------ move between bins

@Component({
  selector: 'wms-move-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="mv-title">
      <div class="dialog-header">
        <div><h2 id="mv-title">Move stock</h2><p>{{ b.sku }} · from bin {{ b.binCode }} ({{ b.zoneName }}) · {{ b.available | number }} available to move</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="inline-alert info" *ngIf="b.zoneName === 'Receiving'"><wms-icon name="info"></wms-icon><span>Stock in the dock can't be allocated to orders until it is moved to a storage or picking bin.</span></div>
        <div class="form-grid">
          <div class="field full">
            <label for="mv-bin">To bin <span class="req">*</span></label>
            <select id="mv-bin" class="select" formControlName="toBinId">
              <option value="" disabled>{{ bins ? 'Choose a bin…' : 'Loading bins…' }}</option>
              <option *ngFor="let x of bins" [value]="x.id">{{ x.code }} · {{ x.zoneName }} · {{ x.capacityUnits - x.usedUnits | number }} free</option>
            </select>
            <wms-field-error [control]="form.controls.toBinId" label="Bin"></wms-field-error>
          </div>
          <div class="field">
            <label for="mv-qty">Units <span class="req">*</span></label>
            <input id="mv-qty" class="input num" type="number" min="1" [max]="b.available" formControlName="qty" />
            <wms-field-error [control]="form.controls.qty" label="Units"></wms-field-error>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy || !b.available">{{ busy ? 'Moving…' : 'Move stock' }}</button>
      </div>
    </form>
  `,
})
export class MoveDialogComponent extends FormDialog<InventoryBalance> {
  bins: Bin[] | null = null;
  readonly form = new FormGroup({
    toBinId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    qty: new FormControl(this.b.available, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.max(this.b.available), Validators.pattern(/^\d+$/)] }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly b: InventoryBalance,
    private readonly api: InventoryApi,
    warehouses: WarehouseApi,
    ref: DialogRef<InventoryBalance>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    warehouses.bins(b.warehouseId, { size: 200, sort: 'code,asc' }).subscribe({
      next: (p) => {
        // Storage and picking first: that is where stock becomes allocatable.
        const rank = (x: Bin) => (x.zoneType === 'PICKING' ? 0 : x.zoneType === 'STORAGE' ? 1 : 2);
        this.bins = p.content.filter((x) => !x.blocked && x.id !== b.binId).sort((x, y) => rank(x) - rank(y) || x.code.localeCompare(y.code));
        cdr.markForCheck();
      },
      error: () => {
        this.bins = [];
        this.banner = 'Bins could not be loaded. You need access to warehouse layouts to move stock.';
        cdr.markForCheck();
      },
    });
  }

  save(): void {
    const v = this.form.getRawValue();
    const to = this.bins?.find((x) => x.id === v.toBinId);
    this.submit(this.api.move({ balanceId: this.b.id, toBinId: v.toBinId, qty: Number(v.qty) }), `${v.qty} units moved to ${to?.code ?? 'bin'}`);
  }
}

// ------------------------------------------------------------------------------ transfer

@Component({
  selector: 'wms-transfer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog lg" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="trf-title">
      <div class="dialog-header">
        <div><h2 id="trf-title">Request stock transfer</h2><p>Stock is reserved when the transfer is approved.</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="t-src">From warehouse <span class="req">*</span></label>
            <select id="t-src" class="select" formControlName="sourceWarehouseId">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let w of sources$ | async" [value]="w.id">{{ w.name }}</option>
            </select>
            <wms-field-error [control]="form.controls.sourceWarehouseId" label="Source"></wms-field-error>
          </div>
          <div class="field">
            <label for="t-dst">To warehouse <span class="req">*</span></label>
            <select id="t-dst" class="select" formControlName="destWarehouseId">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let w of allWarehouses$ | async" [value]="w.id" [disabled]="w.id === form.controls.sourceWarehouseId.value">{{ w.name }}</option>
            </select>
            <wms-field-error [control]="form.controls.destWarehouseId" label="Destination"></wms-field-error>
          </div>
          <div class="field full">
            <span class="label">Products</span>
            <wms-line-items [lines]="form.controls.lines" [products]="products"></wms-line-items>
          </div>
          <div class="field full">
            <label for="t-note">Note</label>
            <input id="t-note" class="input" formControlName="note" placeholder="Why is this stock moving?" />
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Submitting…' : 'Request transfer' }}</button>
      </div>
    </form>
  `,
})
export class TransferDialogComponent extends FormDialog<Transfer> {
  products: ProductOption[] = [];
  /** Any active warehouse can receive stock, even ones outside the user's own scope. */
  readonly allWarehouses$ = this.warehouseApi.networkOptions();
  /** Scoped users can only send stock from their own warehouses. */
  readonly sources$ = this.context.activeOptions$;
  readonly form = new FormGroup({
    sourceWarehouseId: new FormControl(this.context.activeId ?? '', { nonNullable: true, validators: [Validators.required] }),
    destWarehouseId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lines: new FormArray<LineForm>([lineGroup()]),
    note: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private readonly api: InventoryApi,
    catalog: CatalogApi,
    private readonly context: WarehouseContext,
    private readonly warehouseApi: WarehouseApi,
    ref: DialogRef<Transfer>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    catalog.productOptions().subscribe((p) => {
      this.products = p;
      cdr.markForCheck();
    });
  }

  save(): void {
    const v = this.form.getRawValue();
    this.submit(
      this.api.createTransfer({ ...v, lines: v.lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })) }),
      'Transfer requested',
    );
  }
}
