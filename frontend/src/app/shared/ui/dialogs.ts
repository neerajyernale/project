import { Dialog, DIALOG_DATA, DialogConfig, DialogRef } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, Injectable } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';

import { errorMessage } from '@wms/core';

/**
 * Opens dialogs through the CDK (focus trap, Escape to close, restored focus, aria-modal).
 * Replaces the prototype's dead `Modal` component.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  constructor(private readonly dialog: Dialog) {}

  open<R, D = unknown, C = unknown>(component: ComponentType<C>, data?: D, config: DialogConfig<D, DialogRef<R, C>> = {}): Observable<R | undefined> {
    const ref = this.dialog.open<R, D, C>(component, {
      data,
      backdropClass: 'dialog-backdrop',
      panelClass: 'dialog-panel',
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      ...config,
    });
    return ref.closed;
  }

  confirm(data: ConfirmData): Observable<ConfirmResult | undefined> {
    return this.open<ConfirmResult, ConfirmData>(ConfirmDialogComponent, data);
  }
}

export interface ConfirmData {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Ask for a reason (e.g. rejecting a transfer). */
  reasonLabel?: string;
  reasonRequired?: boolean;
  /** Runs on confirm; the dialog stays open and shows the error if it fails. */
  action?: (reason: string) => Observable<unknown>;
}

export interface ConfirmResult {
  confirmed: true;
  reason: string;
  result?: unknown;
}

@Component({
  selector: 'wms-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog sm" role="alertdialog" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
      <div class="dialog-header">
        <div>
          <h2 id="confirm-title">{{ data.title }}</h2>
        </div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="error" role="alert">
          <wms-icon name="alert-circle"></wms-icon><span>{{ error }}</span>
        </div>
        <p id="confirm-msg" class="confirm-message">{{ data.message }}</p>
        <div class="field" *ngIf="data.reasonLabel">
          <label for="confirm-reason">{{ data.reasonLabel }} <span class="req" *ngIf="data.reasonRequired">*</span></label>
          <textarea id="confirm-reason" class="textarea" rows="3" [formControl]="reason"></textarea>
          <wms-field-error [control]="reason" label="Reason"></wms-field-error>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()" [disabled]="busy">Cancel</button>
        <button type="button" class="btn" [class.btn-danger]="data.tone === 'danger'" [class.btn-primary]="data.tone !== 'danger'" (click)="confirm()" [disabled]="busy">
          {{ busy ? 'Working…' : data.confirmLabel }}
        </button>
      </div>
    </div>
  `,
  styles: ['.confirm-message { font-size: 13px; color: var(--wms-text-body); line-height: 1.5; margin-bottom: 12px; }'],
})
export class ConfirmDialogComponent {
  readonly reason = new FormControl('', { nonNullable: true });
  busy = false;
  error = '';
  private sub?: Subscription;

  constructor(
    @Inject(DIALOG_DATA) readonly data: ConfirmData,
    readonly ref: DialogRef<ConfirmResult, ConfirmDialogComponent>,
    private readonly cdr: ChangeDetectorRef,
  ) {
    if (data.reasonRequired) this.reason.addValidators([Validators.required, Validators.minLength(3)]);
  }

  confirm(): void {
    if (this.reason.invalid) {
      this.reason.markAsTouched();
      return;
    }
    const reason = this.reason.value.trim();
    if (!this.data.action) {
      this.ref.close({ confirmed: true, reason });
      return;
    }
    this.busy = true;
    this.error = '';
    this.sub?.unsubscribe();
    this.sub = this.data.action(reason).subscribe({
      next: (result) => this.ref.close({ confirmed: true, reason, result }),
      error: (e: unknown) => {
        this.busy = false;
        this.error = errorMessage(e);
        this.cdr.markForCheck();
      },
    });
  }
}
