import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectorRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Observable } from 'rxjs';

import { applyServerErrors } from '@core/api/api-error';
import { ToastService } from '@core/notify/toast.service';

/**
 * Submit flow shared by every form dialog: validate → call → toast → close with the result,
 * or map server field errors onto controls and show the rest in a banner.
 */
export abstract class FormDialog<T> {
  busy = false;
  banner = '';
  abstract readonly form: FormGroup;

  constructor(protected readonly cdr: ChangeDetectorRef, protected readonly toasts: ToastService, readonly ref: DialogRef<T>) {}

  protected submit(call: Observable<T>, success: string): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy) return;
    this.busy = true;
    this.banner = '';
    call.subscribe({
      next: (result) => {
        if (success) this.toasts.success(success);
        this.ref.close(result);
      },
      error: (e: unknown) => {
        this.busy = false;
        this.banner = applyServerErrors(this.form, e).join(' ');
        this.cdr.markForCheck();
      },
    });
  }
}
