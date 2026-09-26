import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { ProductOption } from '@core/api/domain-apis';

export type LineForm = FormGroup<{ productId: FormControl<string>; qty: FormControl<number> }>;

export function lineGroup(productId = '', qty = 1): LineForm {
  return new FormGroup({
    productId: new FormControl(productId, { nonNullable: true, validators: [Validators.required] }),
    qty: new FormControl(qty, { nonNullable: true, validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)] }),
  });
}

/** Editable product/quantity lines for orders, inbound shipments and transfers. */
@Component({
  selector: 'wms-line-items',
  // Default CD: must re-render when the parent form is submitted (touched state has no event).
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
  changeDetection: ChangeDetectionStrategy.Default,
  template: `
    <table class="lines-table">
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col" style="width: 120px">{{ qtyLabel }}</th>
          <th scope="col" style="width: 40px"><span class="sr-only">Remove</span></th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let g of lines.controls; let i = index; trackBy: trackByIndex" [formGroup]="g">
          <td>
            <select class="select" formControlName="productId" [attr.aria-label]="'Product, line ' + (i + 1)">
              <option value="" disabled>Choose a product…</option>
              <option *ngFor="let p of products; trackBy: trackById" [value]="p.id" [disabled]="isTaken(p.id, i)">{{ p.sku }} · {{ p.name }}</option>
            </select>
            <wms-field-error [control]="g.controls.productId" label="Product"></wms-field-error>
          </td>
          <td>
            <input class="input num" type="number" min="1" step="1" formControlName="qty" [attr.aria-label]="qtyLabel + ', line ' + (i + 1)" />
            <wms-field-error [control]="g.controls.qty" label="Quantity"></wms-field-error>
          </td>
          <td>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="remove(i)" [disabled]="lines.length === 1" [attr.aria-label]="'Remove line ' + (i + 1)">
              <wms-icon name="x"></wms-icon>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <button type="button" class="link-btn add-line" (click)="add()" [disabled]="lines.length >= products.length">
      + Add product
    </button>
  `,
  styles: ['.add-line { margin-top: 8px; }'],
})
export class LineItemsComponent {
  @Input() lines!: FormArray<LineForm>;
  @Input() products: ProductOption[] = [];
  @Input() qtyLabel = 'Quantity';

  trackByIndex = (i: number) => i;
  trackById = (_: number, p: ProductOption) => p.id;

  add(): void {
    this.lines.push(lineGroup());
  }

  remove(i: number): void {
    if (this.lines.length > 1) this.lines.removeAt(i);
  }

  isTaken(productId: string, index: number): boolean {
    return this.lines.controls.some((g, i) => i !== index && g.controls.productId.value === productId);
  }
}
