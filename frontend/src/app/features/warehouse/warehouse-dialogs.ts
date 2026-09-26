import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { WarehouseApi } from '@core/api/domain-apis';
import { Bin, Warehouse, ZONE_TYPES, Zone } from '@core/models';
import { ToastService } from '@core/notify/toast.service';
import { FormDialog } from '@shared/ui/form-dialog';

const CODE_PATTERN = /^[A-Za-z0-9-]{3,20}$/;
const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London'];

// ------------------------------------------------------------------------------ warehouse

@Component({
  selector: 'wms-warehouse-form-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="whf-title">
      <div class="dialog-header">
        <div>
          <h2 id="whf-title">{{ data?.warehouse ? 'Edit warehouse' : 'Add warehouse' }}</h2>
          <p>{{ data?.warehouse ? data?.warehouse?.code : 'A receiving zone and dock bin are created with it.' }}</p>
        </div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="wh-code">Code <span class="req">*</span></label>
            <input id="wh-code" class="input" formControlName="code" placeholder="WH-MUM-002" />
            <wms-field-error [control]="form.controls.code" label="Code"></wms-field-error>
          </div>
          <div class="field">
            <label for="wh-name">Name <span class="req">*</span></label>
            <input id="wh-name" class="input" formControlName="name" placeholder="Mumbai East Warehouse" />
            <wms-field-error [control]="form.controls.name" label="Name"></wms-field-error>
          </div>
          <div class="field">
            <label for="wh-city">City <span class="req">*</span></label>
            <input id="wh-city" class="input" formControlName="city" />
            <wms-field-error [control]="form.controls.city" label="City"></wms-field-error>
          </div>
          <div class="field">
            <label for="wh-manager">Manager <span class="req">*</span></label>
            <input id="wh-manager" class="input" formControlName="manager" />
            <wms-field-error [control]="form.controls.manager" label="Manager"></wms-field-error>
          </div>
          <div class="field full">
            <label for="wh-address">Address</label>
            <input id="wh-address" class="input" formControlName="address" />
          </div>
          <div class="field">
            <label for="wh-area">Floor area (m²) <span class="req">*</span></label>
            <input id="wh-area" class="input num" type="number" min="1" formControlName="capacityM2" />
            <wms-field-error [control]="form.controls.capacityM2" label="Floor area"></wms-field-error>
          </div>
          <div class="field">
            <label for="wh-tz">Time zone</label>
            <select id="wh-tz" class="select" formControlName="timezone">
              <option *ngFor="let tz of timezones" [value]="tz">{{ tz }}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : data?.warehouse ? 'Save changes' : 'Create warehouse' }}</button>
      </div>
    </form>
  `,
})
export class WarehouseFormDialogComponent extends FormDialog<Warehouse> {
  readonly timezones = TIMEZONES;
  readonly form = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(CODE_PATTERN)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    manager: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    address: new FormControl('', { nonNullable: true }),
    capacityM2: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
    timezone: new FormControl('Asia/Kolkata', { nonNullable: true }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly data: { warehouse?: Warehouse } | null,
    private readonly api: WarehouseApi,
    ref: DialogRef<Warehouse>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    if (data?.warehouse) this.form.patchValue(data.warehouse);
  }

  save(): void {
    const v = { ...this.form.getRawValue(), capacityM2: Number(this.form.controls.capacityM2.value) };
    const w = this.data?.warehouse;
    this.submit(w ? this.api.update(w.id, { ...v, version: w.version }) : this.api.create(v), w ? 'Warehouse updated' : `Warehouse ${v.code.toUpperCase()} created`);
  }
}

// ------------------------------------------------------------------------------ zone

@Component({
  selector: 'wms-zone-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="zf-title">
      <div class="dialog-header">
        <div><h2 id="zf-title">{{ data.zone ? 'Edit zone' : 'Add zone' }}</h2><p>{{ data.warehouse.name }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="z-code">Code <span class="req">*</span></label>
            <input id="z-code" class="input" formControlName="code" placeholder="STR-G" />
            <wms-field-error [control]="form.controls.code" label="Code"></wms-field-error>
          </div>
          <div class="field">
            <label for="z-type">Type <span class="req">*</span></label>
            <select id="z-type" class="select" formControlName="type">
              <option *ngFor="let t of zoneTypes" [value]="t">{{ t | humanize }}</option>
            </select>
          </div>
          <div class="field">
            <label for="z-name">Name <span class="req">*</span></label>
            <input id="z-name" class="input" formControlName="name" />
            <wms-field-error [control]="form.controls.name" label="Name"></wms-field-error>
          </div>
          <div class="field">
            <label for="z-area">Area (m²)</label>
            <input id="z-area" class="input num" type="number" min="0" formControlName="areaM2" />
            <wms-field-error [control]="form.controls.areaM2" label="Area"></wms-field-error>
          </div>
          <div class="field full" *ngIf="data.zone">
            <label class="check-row"><input type="checkbox" formControlName="inactive" /> Inactive (no new stock can be placed)</label>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : 'Save zone' }}</button>
      </div>
    </form>
  `,
  styles: ['.check-row { display: flex; gap: 8px; align-items: center; font-weight: 500 !important; }'],
})
export class ZoneDialogComponent extends FormDialog<Zone> {
  readonly zoneTypes = ZONE_TYPES;
  readonly form = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(CODE_PATTERN)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl<Zone['type']>('STORAGE', { nonNullable: true }),
    areaM2: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    inactive: new FormControl(false, { nonNullable: true }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly data: { warehouse: Warehouse; zone?: Zone },
    private readonly api: WarehouseApi,
    ref: DialogRef<Zone>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    if (data.zone) this.form.patchValue({ ...data.zone, inactive: data.zone.status === 'INACTIVE' });
  }

  save(): void {
    const { inactive, ...v } = this.form.getRawValue();
    const body = { ...v, areaM2: Number(v.areaM2) };
    const z = this.data.zone;
    this.submit(
      z ? this.api.updateZone(this.data.warehouse.id, z.id, { ...body, status: inactive ? 'INACTIVE' : 'ACTIVE' }) : this.api.createZone(this.data.warehouse.id, body),
      z ? 'Zone updated' : 'Zone added',
    );
  }
}

// ------------------------------------------------------------------------------ bin

@Component({
  selector: 'wms-bin-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="bf-title">
      <div class="dialog-header">
        <div><h2 id="bf-title">Add bin</h2><p>{{ data.warehouse.name }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field full">
            <label for="b-zone">Zone <span class="req">*</span></label>
            <select id="b-zone" class="select" formControlName="zoneId">
              <option value="" disabled>Choose a zone…</option>
              <option *ngFor="let z of data.zones" [value]="z.id" [disabled]="z.status === 'INACTIVE'">{{ z.name }} ({{ z.code }})</option>
            </select>
            <wms-field-error [control]="form.controls.zoneId" label="Zone"></wms-field-error>
          </div>
          <div class="field">
            <label for="b-code">Bin code <span class="req">*</span></label>
            <input id="b-code" class="input" formControlName="code" [placeholder]="placeholder" />
            <wms-field-error [control]="form.controls.code" label="Bin code"></wms-field-error>
          </div>
          <div class="field">
            <label for="b-cap">Capacity (units) <span class="req">*</span></label>
            <input id="b-cap" class="input num" type="number" min="1" formControlName="capacityUnits" />
            <wms-field-error [control]="form.controls.capacityUnits" label="Capacity"></wms-field-error>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : 'Add bin' }}</button>
      </div>
    </form>
  `,
})
export class BinDialogComponent extends FormDialog<Bin> {
  readonly form = new FormGroup({
    zoneId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(CODE_PATTERN)] }),
    capacityUnits: new FormControl(500, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly data: { warehouse: Warehouse; zones: Zone[] },
    private readonly api: WarehouseApi,
    ref: DialogRef<Bin>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
  }

  get placeholder(): string {
    const z = this.data.zones.find((x) => x.id === this.form.controls.zoneId.value);
    return z ? `${z.code}-${String(z.binCount + 1).padStart(3, '0')}` : 'STR-B-009';
  }

  save(): void {
    const v = this.form.getRawValue();
    this.submit(this.api.createBin(this.data.warehouse.id, { ...v, capacityUnits: Number(v.capacityUnits) }), `Bin ${v.code.toUpperCase()} added`);
  }
}
