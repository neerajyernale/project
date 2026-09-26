import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Injectable, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CanDeactivate } from '@angular/router';
import { Observable, map, of } from 'rxjs';

import { AdminApi, applyServerErrors, AuthSession, Settings, toApiError, ToastService, WarehouseContext } from '@wms/core';
import { DialogService } from '@wms/design-system';

type Section = 'general' | 'operations' | 'notifications' | 'security';

const SECTIONS: { key: Section; label: string; icon: string; hint: string }[] = [
  { key: 'general', label: 'General', icon: 'settings', hint: 'Company details and regional formats' },
  { key: 'operations', label: 'Operations', icon: 'warehouse', hint: 'Defaults and thresholds for warehouse work' },
  { key: 'notifications', label: 'Notifications', icon: 'bell', hint: 'Which events raise alerts' },
  { key: 'security', label: 'Security', icon: 'shield', hint: 'Sign-in and access policy, enforced by the server' },
];

@Component({
  selector: 'wms-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  readonly sections = SECTIONS;
  active: Section = 'general';
  status: 'loading' | 'ready' | 'error' = 'loading';
  busy = false;
  banner = '';
  private loaded: Settings | null = null;

  readonly form = new FormGroup({
    general: new FormGroup({
      companyName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
      currency: new FormControl('INR', { nonNullable: true }),
      timezone: new FormControl('Asia/Kolkata', { nonNullable: true }),
      dateFormat: new FormControl('DD MMM YYYY', { nonNullable: true }),
    }),
    operations: new FormGroup({
      defaultWarehouseId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      autoAssignPickers: new FormControl(true, { nonNullable: true }),
      capacityAlertPct: new FormControl(80, { nonNullable: true }),
      lowStockBufferPct: new FormControl(20, { nonNullable: true }),
    }),
    notifications: new FormGroup({
      lowStock: new FormControl(true, { nonNullable: true }),
      capacity: new FormControl(true, { nonNullable: true }),
      orderDelay: new FormControl(true, { nonNullable: true }),
      inboundReminder: new FormControl(false, { nonNullable: true }),
      dailySummary: new FormControl(true, { nonNullable: true }),
    }),
    security: new FormGroup({
      twoFactor: new FormControl(true, { nonNullable: true }),
      sessionTimeoutMin: new FormControl(30, { nonNullable: true }),
      passwordMinLength: new FormControl(12, { nonNullable: true }),
      ipAllowlist: new FormControl('', { nonNullable: true }),
    }),
  });

  constructor(
    private readonly api: AdminApi,
    private readonly toasts: ToastService,
    private readonly cdr: ChangeDetectorRef,
    readonly context: WarehouseContext,
    readonly session: AuthSession,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get canEdit(): boolean {
    return this.session.can('settings:edit');
  }

  get section() {
    return SECTIONS.find((s) => s.key === this.active) ?? SECTIONS[0];
  }

  load(): void {
    this.status = 'loading';
    this.api.settings().subscribe({
      next: (s) => this.accept(s),
      error: () => {
        this.status = 'error';
        this.cdr.markForCheck();
      },
    });
  }

  private accept(s: Settings): void {
    this.loaded = s;
    this.form.reset(s);
    if (!this.canEdit) this.form.disable();
    this.status = 'ready';
    this.banner = '';
    this.cdr.markForCheck();
  }

  reset(): void {
    if (this.loaded) this.accept(this.loaded);
  }

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.loaded) {
      this.banner = 'Fix the highlighted fields.';
      return;
    }
    this.busy = true;
    this.banner = '';
    const v = this.form.getRawValue();
    const body: Settings = {
      ...v,
      operations: { ...v.operations, capacityAlertPct: Number(v.operations.capacityAlertPct), lowStockBufferPct: Number(v.operations.lowStockBufferPct) },
      security: { ...v.security, sessionTimeoutMin: Number(v.security.sessionTimeoutMin), passwordMinLength: Number(v.security.passwordMinLength) },
      version: this.loaded.version,
    };
    this.api.saveSettings(body).subscribe({
      next: (s) => {
        this.busy = false;
        this.toasts.success('Settings saved');
        this.accept(s);
      },
      error: (e: unknown) => {
        this.busy = false;
        const err = toApiError(e);
        this.banner = err.isConflict ? 'Someone else changed these settings. Reload to see their version, then re-apply your changes.' : applyServerErrors(this.form, e).join(' ');
        this.cdr.markForCheck();
      },
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  warnOnUnload(e: BeforeUnloadEvent): void {
    if (this.form.dirty) e.preventDefault();
  }
}

/** Asks before leaving Settings with unsaved changes. */
@Injectable({ providedIn: 'root' })
export class UnsavedSettingsGuard implements CanDeactivate<SettingsComponent> {
  constructor(private readonly dialogs: DialogService) {}

  canDeactivate(c: SettingsComponent): Observable<boolean> {
    if (!c.form.dirty) return of(true);
    return this.dialogs
      .confirm({ title: 'Leave without saving?', message: 'Your changes to settings will be lost.', confirmLabel: 'Leave page', tone: 'danger' })
      .pipe(map((r) => !!r));
  }
}
