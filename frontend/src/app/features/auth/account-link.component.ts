import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { applyServerErrors, AuthSession } from '@wms/core';

type Mode = 'invite' | 'reset';

function sameAsPassword(group: AbstractControl): ValidationErrors | null {
  const confirm = group.get('confirm');
  if (confirm?.value && confirm.value !== group.get('password')?.value) {
    confirm.setErrors({ ...(confirm.errors ?? {}), custom: 'Passwords do not match.' });
  }
  return null;
}

/**
 * Where the links in invitation and password-reset emails land (`/accept-invite?token=…`,
 * `/reset-password?token=…`). The token in the link is the credential; it works once.
 */
@Component({
  selector: 'wms-account-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="login-page single">
      <main class="login-right">
        <form class="login-form" [formGroup]="form" (ngSubmit)="submit()" novalidate aria-labelledby="al-title" *ngIf="!done; else finished">
          <div class="login-brand">
            <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
            <div><p class="brand-name">WMS<span>360</span></p></div>
          </div>
          <h2 id="al-title">{{ mode === 'invite' ? 'Welcome to WMS360' : 'Choose a new password' }}</h2>
          <p class="sub">{{ mode === 'invite' ? 'Choose the password you will sign in with.' : 'You will be signed out on your other devices.' }}</p>

          <div class="inline-alert danger" *ngIf="!token" role="alert">
            <wms-icon name="alert-circle"></wms-icon><span>This link is incomplete. Open it again from the email.</span>
          </div>
          <div class="inline-alert danger" *ngIf="error" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ error }}</span></div>

          <div class="field">
            <label for="al-password">New password</label>
            <input id="al-password" class="input" type="password" formControlName="password" autocomplete="new-password" wmsAutofocus />
            <small class="field-hint">Your organisation sets the minimum length (usually 12 characters).</small>
            <wms-field-error [control]="form.controls.password" label="Password"></wms-field-error>
          </div>
          <div class="field">
            <label for="al-confirm">Confirm password</label>
            <input id="al-confirm" class="input" type="password" formControlName="confirm" autocomplete="new-password" />
            <wms-field-error [control]="form.controls.confirm" label="Confirmation"></wms-field-error>
          </div>
          <button type="submit" class="btn btn-primary submit" [disabled]="busy || !token">
            <span class="spinner" *ngIf="busy" aria-hidden="true"></span>{{ busy ? 'Saving…' : mode === 'invite' ? 'Activate account' : 'Set new password' }}
          </button>
          <p class="sub" style="margin-top: 16px"><a routerLink="/login">Back to sign in</a></p>
        </form>
        <ng-template #finished>
          <div class="login-form" role="status">
            <h2><wms-icon name="check-circle"></wms-icon> {{ mode === 'invite' ? 'Your account is ready' : 'Password changed' }}</h2>
            <p class="sub">Sign in with your email and the password you just chose.</p>
            <a class="btn btn-primary submit" routerLink="/login">Go to sign in</a>
          </div>
        </ng-template>
      </main>
    </div>
  `,
  styleUrls: ['./login.component.css'],
})
export class AccountLinkComponent {
  readonly mode: Mode;
  readonly token: string | null;
  readonly form = new FormGroup(
    {
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: sameAsPassword },
  );
  busy = false;
  done = false;
  error = '';

  constructor(route: ActivatedRoute, private readonly session: AuthSession, private readonly cdr: ChangeDetectorRef) {
    this.mode = route.snapshot.data['mode'] === 'invite' ? 'invite' : 'reset';
    this.token = route.snapshot.queryParamMap.get('token');
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.token || this.busy) return;
    this.busy = true;
    this.error = '';
    const password = this.form.controls.password.value;
    const call = this.mode === 'invite' ? this.session.acceptInvite(this.token, password) : this.session.resetPassword(this.token, password);
    call.subscribe({
      next: () => {
        this.done = true;
        this.cdr.markForCheck();
      },
      error: (e: unknown) => {
        this.busy = false;
        this.error = applyServerErrors(this.form, e).join(' ');
        this.cdr.markForCheck();
      },
    });
  }
}
