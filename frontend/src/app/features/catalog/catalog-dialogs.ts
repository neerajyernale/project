import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import { CatalogApi, Customer, PartnerStatus, Product, Supplier, ToastService } from '@wms/core';
import { FormDialog } from '@wms/design-system';

const UOMS = ['Each', 'Pair', 'Box', 'Roll', 'Pack', 'Kg', 'Litre'];

@Component({
  selector: 'wms-product-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="pf-title">
      <div class="dialog-header">
        <div><h2 id="pf-title">{{ data?.product ? 'Edit product' : 'Add product' }}</h2><p>Reorder level and max stock apply per warehouse.</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="p-sku">SKU <span class="req">*</span></label>
            <input id="p-sku" class="input" formControlName="sku" placeholder="SKU-10200" />
            <wms-field-error [control]="form.controls.sku" label="SKU"></wms-field-error>
          </div>
          <div class="field">
            <label for="p-name">Name <span class="req">*</span></label>
            <input id="p-name" class="input" formControlName="name" />
            <wms-field-error [control]="form.controls.name" label="Name"></wms-field-error>
          </div>
          <div class="field">
            <label for="p-cat">Category <span class="req">*</span></label>
            <input id="p-cat" class="input" formControlName="category" list="p-cats" />
            <datalist id="p-cats"><option *ngFor="let c of data?.categories" [value]="c"></option></datalist>
            <wms-field-error [control]="form.controls.category" label="Category"></wms-field-error>
          </div>
          <div class="field">
            <label for="p-brand">Brand</label>
            <input id="p-brand" class="input" formControlName="brand" />
          </div>
          <div class="field">
            <label for="p-uom">Unit of measure</label>
            <select id="p-uom" class="select" formControlName="uom"><option *ngFor="let u of uoms" [value]="u">{{ u }}</option></select>
          </div>
          <div class="field">
            <label for="p-cost">Unit cost (₹)</label>
            <input id="p-cost" class="input num" type="number" min="0" step="0.01" formControlName="unitCost" />
            <wms-field-error [control]="form.controls.unitCost" label="Unit cost"></wms-field-error>
          </div>
          <div class="field">
            <label for="p-reorder">Reorder level <span class="req">*</span></label>
            <input id="p-reorder" class="input num" type="number" min="0" formControlName="reorderLevel" />
            <small class="field-hint">Low-stock alert at or below this, per warehouse.</small>
            <wms-field-error [control]="form.controls.reorderLevel" label="Reorder level"></wms-field-error>
          </div>
          <div class="field">
            <label for="p-max">Max stock</label>
            <input id="p-max" class="input num" type="number" min="0" formControlName="maxStock" />
            <small class="field-hint">Overstock above this, per warehouse. 0 = no limit.</small>
            <wms-field-error [control]="form.controls.maxStock" label="Max stock"></wms-field-error>
          </div>
          <div class="field">
            <label for="p-weight">Weight (kg)</label>
            <input id="p-weight" class="input num" type="number" min="0" step="0.01" formControlName="weightKg" />
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : data?.product ? 'Save changes' : 'Add product' }}</button>
      </div>
    </form>
  `,
})
export class ProductDialogComponent extends FormDialog<Product> {
  readonly uoms = UOMS;
  readonly form = new FormGroup({
    sku: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^[A-Za-z0-9-]{3,24}$/)] }),
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    category: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    brand: new FormControl('', { nonNullable: true }),
    uom: new FormControl('Each', { nonNullable: true }),
    unitCost: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    reorderLevel: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    maxStock: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
    weightKg: new FormControl(0, { nonNullable: true, validators: [Validators.min(0)] }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly data: { product?: Product; categories: string[] } | null,
    private readonly api: CatalogApi,
    ref: DialogRef<Product>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    if (data?.product) this.form.patchValue(data.product);
  }

  save(): void {
    const raw = this.form.getRawValue();
    const v = { ...raw, unitCost: Number(raw.unitCost), reorderLevel: Number(raw.reorderLevel), maxStock: Number(raw.maxStock), weightKg: Number(raw.weightKg) };
    const p = this.data?.product;
    this.submit(p ? this.api.updateProduct(p.id, { ...v, version: p.version }) : this.api.createProduct(v), p ? 'Product updated' : `Product ${v.sku.toUpperCase()} added`);
  }
}

// ------------------------------------------------------------------------------ partners

export interface PartnerDialogData {
  kind: 'supplier' | 'customer';
  record?: Supplier | Customer;
}

@Component({
  selector: 'wms-partner-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="ptf-title">
      <div class="dialog-header">
        <div><h2 id="ptf-title">{{ data.record ? 'Edit' : 'Add' }} {{ data.kind }}</h2><p *ngIf="data.record">{{ data.record.code }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field full">
            <label for="pt-name">{{ data.kind === 'supplier' ? 'Supplier' : 'Customer' }} name <span class="req">*</span></label>
            <input id="pt-name" class="input" formControlName="name" />
            <wms-field-error [control]="form.controls.name" label="Name"></wms-field-error>
          </div>
          <div class="field" *ngIf="data.kind === 'supplier'">
            <label for="pt-contact">Contact person <span class="req">*</span></label>
            <input id="pt-contact" class="input" formControlName="contact" />
            <wms-field-error [control]="form.controls.contact" label="Contact"></wms-field-error>
          </div>
          <div class="field">
            <label for="pt-email">Email <span class="req">*</span></label>
            <input id="pt-email" class="input" type="email" formControlName="email" />
            <wms-field-error [control]="form.controls.email" label="Email"></wms-field-error>
          </div>
          <div class="field">
            <label for="pt-phone">Phone <span class="req">*</span></label>
            <input id="pt-phone" class="input" type="tel" formControlName="phone" placeholder="+91 22 4582 1190" />
            <wms-field-error [control]="form.controls.phone" label="Phone"></wms-field-error>
          </div>
          <div class="field">
            <label for="pt-city">City <span class="req">*</span></label>
            <input id="pt-city" class="input" formControlName="city" />
            <wms-field-error [control]="form.controls.city" label="City"></wms-field-error>
          </div>
          <div class="field">
            <label for="pt-status">Status</label>
            <select id="pt-status" class="select" formControlName="status">
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On hold</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  `,
})
export class PartnerDialogComponent extends FormDialog<Supplier | Customer> {
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    contact: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\+?[0-9 ()-]{7,20}$/)] }),
    city: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    status: new FormControl<PartnerStatus>('ACTIVE', { nonNullable: true }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly data: PartnerDialogData,
    private readonly api: CatalogApi,
    ref: DialogRef<Supplier | Customer>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
    if (data.kind === 'supplier') this.form.controls.contact.addValidators(Validators.required);
    if (data.record) this.form.patchValue(data.record);
  }

  save(): void {
    const v = this.form.getRawValue();
    const r = this.data.record;
    if (this.data.kind === 'supplier') {
      this.submit(r ? this.api.updateSupplier(r.id, { ...v, version: r.version }) : this.api.createSupplier(v), r ? 'Supplier updated' : 'Supplier added');
    } else {
      const { contact: _c, ...c } = v;
      this.submit(r ? this.api.updateCustomer(r.id, { ...c, version: r.version }) : this.api.createCustomer(c), r ? 'Customer updated' : 'Customer added');
    }
  }
}
