import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { ApiError, ViewStatus } from '@wms/core';

/**
 * Renders every non-ready page state (ARCHITECTURE §3.3) so no page can forget one:
 * loading (skeleton), empty (with next action), no-results (clear filters),
 * error (retry), forbidden, offline.
 */
@Component({
  selector: 'wms-state-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container [ngSwitch]="status">
      <div *ngSwitchCase="'loading'" role="status" aria-live="polite" aria-label="Loading">
        <div class="skeleton-row" *ngFor="let r of rowsArray">
          <span class="skeleton" style="max-width: 120px"></span>
          <span class="skeleton"></span>
          <span class="skeleton" style="max-width: 90px"></span>
          <span class="skeleton" style="max-width: 70px"></span>
        </div>
      </div>

      <div *ngSwitchCase="'empty'" class="state-view">
        <wms-icon class="state-icon" [name]="icon" [size]="32" [stroke]="1.4"></wms-icon>
        <strong>{{ emptyTitle || 'Nothing here yet' }}</strong>
        <small *ngIf="emptyHint">{{ emptyHint }}</small>
        <button *ngIf="actionLabel" type="button" class="btn btn-primary btn-sm" (click)="action.emit()">
          <wms-icon name="plus"></wms-icon>{{ actionLabel }}
        </button>
      </div>

      <div *ngSwitchCase="'no-results'" class="state-view">
        <wms-icon class="state-icon" name="search" [size]="32" [stroke]="1.4"></wms-icon>
        <strong>No {{ entity }} match these filters</strong>
        <small>Try a different search, or clear the filters.</small>
        <button type="button" class="btn btn-sm" (click)="clear.emit()">Clear filters</button>
      </div>

      <div *ngSwitchCase="'forbidden'" class="state-view">
        <wms-icon class="state-icon" name="lock" [size]="32" [stroke]="1.4"></wms-icon>
        <strong>You don't have access to {{ entity }}</strong>
        <small>Ask an administrator if you need it for your work.</small>
      </div>

      <div *ngSwitchCase="'offline'" class="state-view" role="alert">
        <wms-icon class="state-icon" name="alert-circle" [size]="32" [stroke]="1.4"></wms-icon>
        <strong>You're offline</strong>
        <small>Check your connection. Nothing was lost.</small>
        <button type="button" class="btn btn-sm" (click)="retry.emit()"><wms-icon name="refresh"></wms-icon>Try again</button>
      </div>

      <div *ngSwitchCase="'error'" class="state-view" role="alert">
        <wms-icon class="state-icon" name="alert-circle" [size]="32" [stroke]="1.4"></wms-icon>
        <strong>{{ entity | titlecase }} couldn't be loaded</strong>
        <small>{{ error?.detail || 'Something went wrong.' }}</small>
        <small *ngIf="error?.correlationId" class="code">Reference {{ error?.correlationId }}</small>
        <button type="button" class="btn btn-sm" (click)="retry.emit()"><wms-icon name="refresh"></wms-icon>Try again</button>
      </div>
    </ng-container>
  `,
})
export class StateViewComponent {
  @Input() status: ViewStatus = 'loading';
  @Input() error: ApiError | null = null;
  /** Plural noun used in messages, e.g. "orders". */
  @Input() entity = 'records';
  @Input() icon = 'inventory';
  @Input() emptyTitle = '';
  @Input() emptyHint = '';
  @Input() actionLabel = '';
  @Input() rows = 5;
  @Output() retry = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();
  @Output() action = new EventEmitter<void>();

  get rowsArray(): number[] {
    return Array.from({ length: this.rows }, (_, i) => i);
  }
}
