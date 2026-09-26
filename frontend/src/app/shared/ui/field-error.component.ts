import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * Shows the first validation message for a control once it has been touched.
 * Default change detection on purpose: `touched` changes emit no event an OnPush view could see.
 */
@Component({
  selector: 'wms-field-error',
  // eslint-disable-next-line @angular-eslint/prefer-on-push-component-change-detection
  changeDetection: ChangeDetectionStrategy.Default,
  template: `<small class="field-error" *ngIf="message" role="alert">{{ message }}</small>`,
})
export class FieldErrorComponent implements OnInit, OnDestroy {
  @Input() control: AbstractControl | null = null;
  @Input() label = 'This field';
  private sub?: Subscription;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.sub = this.control?.statusChanges.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get message(): string | null {
    const c = this.control;
    if (!c || !c.errors || !(c.touched || c.dirty)) return null;
    const e = c.errors;
    if (e['server']) return e['server'] as string;
    if (e['required']) return `${this.label} is required.`;
    if (e['email']) return 'Enter a valid email address.';
    if (e['minlength']) return `Use at least ${(e['minlength'] as { requiredLength: number }).requiredLength} characters.`;
    if (e['maxlength']) return `Use at most ${(e['maxlength'] as { requiredLength: number }).requiredLength} characters.`;
    if (e['min']) return `Must be at least ${(e['min'] as { min: number }).min}.`;
    if (e['max']) return `Must be at most ${(e['max'] as { max: number }).max}.`;
    if (e['pattern']) return `${this.label} has an invalid format.`;
    if (e['custom']) return e['custom'] as string;
    return `${this.label} is invalid.`;
  }
}
