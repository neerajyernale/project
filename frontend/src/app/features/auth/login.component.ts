import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AppConfigService, AuthSession, errorMessage, toApiError, WarehouseContext } from '@wms/core';

interface DemoAccount {
  email: string;
  role: string;
}

@Component({
  selector: 'wms-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    rememberMe: new FormControl(false, { nonNullable: true }),
  });
  /** Second step, once the server says the account uses two-factor sign-in. */
  readonly otp = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });
  step: 'password' | 'code' = 'password';
  readonly resetEmail = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });
  resetSent = false;
  resetBusy = false;
  showPassword = false;
  busy = false;
  error = '';
  forgotOpen = false;
  readonly expired: boolean;
  readonly usesMockApi: boolean;
  readonly demoPassword = 'Wms360-Demo!';
  readonly demoAccounts: DemoAccount[] = [
    { email: 'admin@wms360.com', role: 'Admin · all warehouses' },
    { email: 'rajesh.kumar@wms360.com', role: 'Warehouse Manager · Mumbai' },
    { email: 'amit.sharma@wms360.com', role: 'Supervisor · Mumbai, Pune' },
    { email: 'priya.menon@wms360.com', role: 'Inventory Manager · Pune' },
    { email: 'rohit.verma@wms360.com', role: 'Picker · Mumbai' },
    { email: 'sneha.iyer@wms360.com', role: 'Packer · Mumbai' },
    { email: 'meera.joshi@wms360.com', role: 'Seller · all warehouses' },
    { email: 'vivek.nair@wms360.com', role: 'Viewer · read only' },
  ];

  constructor(
    private readonly session: AuthSession,
    private readonly context: WarehouseContext,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    config: AppConfigService,
  ) {
    this.usesMockApi = config.value.useMockApi;
    this.expired = session.endReason === 'expired';
  }

  useDemo(a: DemoAccount): void {
    this.form.patchValue({ email: a.email, password: this.demoPassword });
    this.error = '';
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy) return;
    if (this.step === 'code') {
      this.otp.markAsTouched();
      if (this.otp.invalid) return;
    }
    this.busy = true;
    this.error = '';
    const request = { ...this.form.getRawValue(), otp: this.step === 'code' ? this.otp.value : undefined };
    this.session.login(request).subscribe({
      next: async () => {
        await this.context.load();
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        // Only same-app paths: never redirect to another origin.
        const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
        void this.router.navigateByUrl(safe);
      },
      error: (e: unknown) => {
        this.busy = false;
        const otpError = toApiError(e).fieldErrors.find((f) => f.field === 'otp');
        if (otpError) {
          // Password was right; the account needs its authenticator code.
          this.error = this.step === 'code' || otpError.code === 'invalid' ? otpError.message : '';
          this.step = 'code';
          this.otp.reset('');
        } else {
          this.error = errorMessage(e);
          this.step = 'password';
          this.form.controls.password.reset('');
        }
        this.cdr.markForCheck();
      },
    });
  }

  backToPassword(): void {
    this.step = 'password';
    this.error = '';
    this.otp.reset('');
    this.form.controls.password.reset('');
  }

  toggleForgot(): void {
    this.forgotOpen = !this.forgotOpen;
    this.resetSent = false;
    if (this.forgotOpen && this.form.controls.email.valid) this.resetEmail.setValue(this.form.controls.email.value);
  }

  /** The answer is the same whether or not the email exists, so nothing is revealed. */
  sendReset(): void {
    this.resetEmail.markAsTouched();
    if (this.resetEmail.invalid || this.resetBusy) return;
    this.resetBusy = true;
    this.session.requestPasswordReset(this.resetEmail.value).subscribe({
      next: () => this.resetDone(),
      error: () => this.resetDone(),
    });
  }

  private resetDone(): void {
    this.resetBusy = false;
    this.resetSent = true;
    this.cdr.markForCheck();
  }
}
