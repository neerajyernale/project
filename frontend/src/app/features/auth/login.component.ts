import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AppConfigService, AuthSession, errorMessage, WarehouseContext } from '@wms/core';

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
    this.busy = true;
    this.error = '';
    this.session.login(this.form.getRawValue()).subscribe({
      next: async () => {
        await this.context.load();
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        // Only same-app paths: never redirect to another origin.
        const safe = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
        void this.router.navigateByUrl(safe);
      },
      error: (e: unknown) => {
        this.busy = false;
        this.error = errorMessage(e);
        this.form.controls.password.reset('');
        this.cdr.markForCheck();
      },
    });
  }
}
