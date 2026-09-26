import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

import {
  AdminApi,
  CARRIERS,
  CatalogApi,
  errorMessage,
  FulfillmentApi,
  Order,
  PACK_STATIONS,
  PartnerOption,
  PickTask,
  PRIORITIES,
  Priority,
  ProductOption,
  StaffOption,
  ToastService,
  WarehouseContext,
} from '@wms/core';
import { FormDialog, LineForm, lineGroup } from '@wms/design-system';

// ------------------------------------------------------------------------------ new order

@Component({
  selector: 'wms-order-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog lg" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="ord-title">
      <div class="dialog-header">
        <div><h2 id="ord-title">New order</h2><p>Stock is reserved when the order is allocated.</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="o-cus">Customer <span class="req">*</span></label>
            <select id="o-cus" class="select" formControlName="customerId" (change)="onCustomer()">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let c of customers" [value]="c.id">{{ c.name }}</option>
            </select>
            <wms-field-error [control]="form.controls.customerId" label="Customer"></wms-field-error>
          </div>
          <div class="field">
            <label for="o-wh">Ship from <span class="req">*</span></label>
            <select id="o-wh" class="select" formControlName="warehouseId">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let w of warehouses$ | async" [value]="w.id">{{ w.name }}</option>
            </select>
            <wms-field-error [control]="form.controls.warehouseId" label="Warehouse"></wms-field-error>
          </div>
          <div class="field">
            <label for="o-city">Ship to city</label>
            <input id="o-city" class="input" formControlName="shipToCity" />
          </div>
          <div class="field">
            <label for="o-pri">Priority</label>
            <select id="o-pri" class="select" formControlName="priority">
              <option *ngFor="let p of priorities" [value]="p">{{ p | humanize }}</option>
            </select>
          </div>
          <div class="field">
            <label for="o-due">Required by <span class="req">*</span></label>
            <input id="o-due" class="input" type="date" formControlName="requiredBy" />
            <wms-field-error [control]="form.controls.requiredBy" label="Required-by date"></wms-field-error>
          </div>
          <div class="field full">
            <span class="label">Products</span>
            <wms-line-items [lines]="form.controls.lines" [products]="products"></wms-line-items>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Creating…' : 'Create order' }}</button>
      </div>
    </form>
  `,
})
export class OrderDialogComponent extends FormDialog<Order> {
  readonly priorities = PRIORITIES;
  customers: (PartnerOption & { city?: string })[] = [];
  products: ProductOption[] = [];
  readonly warehouses$ = this.context.activeOptions$;
  readonly form = new FormGroup({
    customerId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    warehouseId: new FormControl(this.context.activeId ?? '', { nonNullable: true, validators: [Validators.required] }),
    shipToCity: new FormControl('', { nonNullable: true }),
    priority: new FormControl<Priority>('NORMAL', { nonNullable: true }),
    requiredBy: new FormControl(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), { nonNullable: true, validators: [Validators.required] }),
    lines: new FormArray<LineForm>([lineGroup()]),
  });

  constructor(
    private readonly api: FulfillmentApi,
    catalog: CatalogApi,
    private readonly context: WarehouseContext,
    ref: DialogRef<Order>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    catalog.customerOptions().subscribe((c) => ((this.customers = c), cdr.markForCheck()));
    catalog.productOptions().subscribe((p) => ((this.products = p), cdr.markForCheck()));
  }

  onCustomer(): void {
    const c = this.customers.find((x) => x.id === this.form.controls.customerId.value);
    if (c?.city && !this.form.controls.shipToCity.value) this.form.controls.shipToCity.setValue(c.city);
  }

  save(): void {
    const v = this.form.getRawValue();
    // Required by end of the chosen day, local time.
    const due = new Date(`${v.requiredBy}T18:00:00`);
    this.submit(
      this.api.createOrder({ ...v, requiredBy: due.toISOString(), lines: v.lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) })) }),
      '',
    );
  }
}

// ------------------------------------------------------------------------------ assign picker

@Component({
  selector: 'wms-assign-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="as-title">
      <div class="dialog-header">
        <div><h2 id="as-title">Assign {{ task.number }}</h2><p>{{ task.orderNumber }} · {{ task.totalQty }} units · zone {{ task.zone }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="field">
          <label for="as-picker">Picker <span class="req">*</span></label>
          <select id="as-picker" class="select" formControlName="picker">
            <option value="" disabled>Choose…</option>
            <option *ngFor="let p of staff" [value]="p.name">{{ p.name }}</option>
          </select>
          <small class="field-hint">People allowed to pick in {{ task.warehouseName }}.</small>
          <wms-field-error [control]="form.controls.picker" label="Picker"></wms-field-error>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">Assign</button>
      </div>
    </form>
  `,
})
export class AssignDialogComponent extends FormDialog<PickTask> {
  staff: StaffOption[] = [];
  readonly form = new FormGroup({ picker: new FormControl(this.task.picker ?? '', { nonNullable: true, validators: [Validators.required] }) });

  constructor(
    @Inject(DIALOG_DATA) readonly task: PickTask,
    private readonly api: FulfillmentApi,
    admin: AdminApi,
    ref: DialogRef<PickTask>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    // Only people allowed to pick who work in this warehouse.
    admin.staff('picking:edit', task.warehouseId).subscribe((s) => ((this.staff = s), cdr.markForCheck()));
  }

  save(): void {
    this.submit(this.api.assignPicker(this.task.id, this.form.controls.picker.value), `${this.task.number} assigned to ${this.form.controls.picker.value}`);
  }
}

// ------------------------------------------------------------------------------ pick

type PickRow = FormGroup<{ picked: FormControl<number> }>;

@Component({
  selector: 'wms-pick-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog lg" role="dialog" aria-labelledby="pk-title">
      <div class="dialog-header">
        <div><h2 id="pk-title">Pick {{ task.number }}</h2><p>{{ task.orderNumber }} · {{ task.warehouseName }} · {{ task.picker || 'Unassigned' }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="inline-alert info" *ngIf="task.status !== 'IN_PROGRESS'"><wms-icon name="info"></wms-icon><span>Start the task when you begin walking the pick path. The start time is used for pick-rate reporting.</span></div>
        <div class="inline-alert warning" *ngIf="short > 0"><wms-icon name="alert"></wms-icon><span>{{ short }} unit{{ short === 1 ? '' : 's' }} short. The missing stock is written off from the bin and the order ships what was found.</span></div>
        <table class="data-table">
          <thead><tr><th scope="col">Bin</th><th scope="col">Product</th><th scope="col" class="num">To pick</th><th scope="col">Picked</th></tr></thead>
          <tbody>
            <tr *ngFor="let l of task.lines; let i = index">
              <td class="code"><strong>{{ l.binCode }}</strong></td>
              <td><div class="cell-stack"><strong>{{ l.productName }}</strong><small class="code">{{ l.sku }}</small></div></td>
              <td class="num">{{ l.qty | number }}</td>
              <td [formGroup]="rows.controls[i]">
                <input class="input num qty" type="number" min="0" [max]="l.qty" formControlName="picked" [attr.aria-label]="'Picked, ' + l.sku + ' from ' + l.binCode" />
                <wms-field-error [control]="rows.controls[i].controls.picked" label="Picked"></wms-field-error>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Close</button>
        <button *ngIf="task.status !== 'IN_PROGRESS'" type="button" class="btn btn-primary" (click)="start()" [disabled]="busy"><wms-icon name="play"></wms-icon>Start picking</button>
        <button *ngIf="task.status === 'IN_PROGRESS'" type="button" class="btn btn-primary" (click)="complete()" [disabled]="busy"><wms-icon name="check"></wms-icon>{{ busy ? 'Confirming…' : 'Confirm picks' }}</button>
      </div>
    </div>
  `,
  styles: ['.qty { width: 110px; }', '.data-table { min-width: 0; }'],
})
export class PickDialogComponent {
  busy = false;
  banner = '';
  readonly rows: FormArray<PickRow>;

  constructor(
    @Inject(DIALOG_DATA) public task: PickTask,
    readonly ref: DialogRef<PickTask>,
    private readonly api: FulfillmentApi,
    private readonly toasts: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.rows = new FormArray<PickRow>(
      task.lines.map((l) => new FormGroup({ picked: new FormControl(l.qty, { nonNullable: true, validators: [Validators.required, Validators.min(0), Validators.max(l.qty), Validators.pattern(/^\d+$/)] }) })),
    );
    if (task.status !== 'IN_PROGRESS') this.rows.disable();
  }

  get short(): number {
    return this.task.lines.reduce((a, l, i) => a + Math.max(0, l.qty - Number(this.rows.controls[i].controls.picked.value || 0)), 0);
  }

  start(): void {
    this.busy = true;
    this.api.startPick(this.task.id).subscribe({
      next: (t) => {
        this.task = t;
        this.busy = false;
        this.rows.enable();
        this.cdr.markForCheck();
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  complete(): void {
    this.rows.markAllAsTouched();
    if (this.rows.invalid) return;
    this.busy = true;
    const lines = this.task.lines.map((l, i) => ({ productId: l.productId, binCode: l.binCode, picked: Number(this.rows.controls[i].controls.picked.value) }));
    this.api.completePick(this.task.id, { lines }).subscribe({
      next: (t) => {
        this.toasts.success(t.status === 'SHORT' ? `${t.number} confirmed with a short pick` : `${t.number} picked`, `${t.orderNumber} is ready to pack`);
        this.ref.close(t);
      },
      error: (e: unknown) => this.fail(e),
    });
  }

  private fail(e: unknown): void {
    this.busy = false;
    this.banner = errorMessage(e);
    this.cdr.markForCheck();
  }
}

// ------------------------------------------------------------------------------ pack

@Component({
  selector: 'wms-pack-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="pack-title">
      <div class="dialog-header">
        <div><h2 id="pack-title">Pack {{ order.number }}</h2><p>{{ order.customerName }} · {{ picked }} units picked</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="pk-st">Station <span class="req">*</span></label>
            <select id="pk-st" class="select" formControlName="station"><option *ngFor="let s of stations" [value]="s">{{ s }}</option></select>
          </div>
          <div class="field">
            <label for="pk-w">Weight (kg) <span class="req">*</span></label>
            <input id="pk-w" class="input num" type="number" min="0.1" step="0.1" formControlName="weightKg" />
            <small class="field-hint">Estimated {{ estimate }} kg from product weights.</small>
            <wms-field-error [control]="form.controls.weightKg" label="Weight"></wms-field-error>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy"><wms-icon name="packing"></wms-icon>{{ busy ? 'Saving…' : 'Mark as packed' }}</button>
      </div>
    </form>
  `,
})
export class PackDialogComponent extends FormDialog<Order> {
  readonly stations = PACK_STATIONS;
  readonly picked = this.order.lines.reduce((a, l) => a + l.picked, 0);
  readonly estimate = Math.max(0.5, Math.round(this.picked * 0.8 * 10) / 10);
  readonly form = new FormGroup({
    station: new FormControl<string>(PACK_STATIONS[0], { nonNullable: true }),
    weightKg: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.1), Validators.max(1000)] }),
  });

  constructor(@Inject(DIALOG_DATA) readonly order: Order, private readonly api: FulfillmentApi, ref: DialogRef<Order>, cdr: ChangeDetectorRef, toasts: ToastService) {
    super(cdr, toasts, ref);
  }

  save(): void {
    const v = this.form.getRawValue();
    this.submit(this.api.pack(this.order.id, { station: v.station, weightKg: Number(v.weightKg) }), `${this.order.number} packed`);
  }
}

// ------------------------------------------------------------------------------ ship

@Component({
  selector: 'wms-ship-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="shp-title">
      <div class="dialog-header">
        <div><h2 id="shp-title">Dispatch {{ order.number }}</h2><p>{{ order.customerName }} · to {{ order.shipToCity || '—' }} · {{ order.packageNumber }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="sh-c">Carrier <span class="req">*</span></label>
            <select id="sh-c" class="select" formControlName="carrier"><option *ngFor="let c of carriers" [value]="c">{{ c }}</option></select>
          </div>
          <div class="field">
            <label for="sh-t">Tracking number <span class="req">*</span></label>
            <input id="sh-t" class="input" formControlName="trackingNumber" autocomplete="off" />
            <wms-field-error [control]="form.controls.trackingNumber" label="Tracking number"></wms-field-error>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy"><wms-icon name="shipping"></wms-icon>{{ busy ? 'Dispatching…' : 'Dispatch' }}</button>
      </div>
    </form>
  `,
})
export class ShipDialogComponent extends FormDialog<Order> {
  readonly carriers = CARRIERS;
  readonly form = new FormGroup({
    carrier: new FormControl<string>(CARRIERS[0], { nonNullable: true }),
    trackingNumber: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9]{6,20}$/)] }),
  });

  constructor(@Inject(DIALOG_DATA) readonly order: Order, private readonly api: FulfillmentApi, ref: DialogRef<Order>, cdr: ChangeDetectorRef, toasts: ToastService) {
    super(cdr, toasts, ref);
  }

  save(): void {
    this.submit(this.api.ship(this.order.id, this.form.getRawValue()), `${this.order.number} dispatched`);
  }
}
