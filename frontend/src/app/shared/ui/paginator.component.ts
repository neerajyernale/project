import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { Page } from '@wms/core';

@Component({
  selector: 'wms-paginator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="pagination" aria-label="Pagination" *ngIf="page">
      <span class="spacer">
        <label [attr.for]="id">Rows per page</label>
        <select [id]="id" (change)="sizeChange.emit(+$any($event.target).value)">
          <option *ngFor="let s of sizes" [value]="s" [selected]="s === page.size">{{ s }}</option>
        </select>
      </span>
      <span class="num">{{ from }}–{{ to }} of {{ page.totalElements | number }}</span>
      <button type="button" [disabled]="page.page === 0" (click)="pageChange.emit(page.page - 1)" aria-label="Previous page">
        <wms-icon name="chevron-left"></wms-icon>
      </button>
      <button
        type="button"
        *ngFor="let p of pages"
        [attr.aria-current]="p === page.page ? 'page' : null"
        (click)="pageChange.emit(p)"
      >
        {{ p + 1 }}
      </button>
      <button type="button" [disabled]="page.page >= page.totalPages - 1" (click)="pageChange.emit(page.page + 1)" aria-label="Next page">
        <wms-icon name="chevron-right"></wms-icon>
      </button>
    </nav>
  `,
})
export class PaginatorComponent {
  private static seq = 0;
  readonly id = `pg-size-${++PaginatorComponent.seq}`;
  @Input() page: Page<unknown> | null = null;
  @Input() sizes = [10, 25, 50, 100];
  @Output() pageChange = new EventEmitter<number>();
  @Output() sizeChange = new EventEmitter<number>();

  get from(): number {
    return this.page && this.page.totalElements ? this.page.page * this.page.size + 1 : 0;
  }

  get to(): number {
    return this.page ? Math.min((this.page.page + 1) * this.page.size, this.page.totalElements) : 0;
  }

  /** A window of up to 5 page numbers around the current page. */
  get pages(): number[] {
    if (!this.page) return [];
    const total = this.page.totalPages;
    const start = Math.max(0, Math.min(this.page.page - 2, total - 5));
    return Array.from({ length: Math.min(5, total) }, (_, i) => start + i);
  }
}
