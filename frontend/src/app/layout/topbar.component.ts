import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, merge, of, timer } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, takeUntil, tap } from 'rxjs/operators';

import { applyServerErrors, AuthSession, errorMessage, InsightsApi, MfaSetup, Notification, SearchResult, SessionUser, ToastService } from '@wms/core';
import { DialogService } from '@wms/design-system';

const SEARCH_ICONS: Record<SearchResult['type'], string> = {
  product: 'product',
  order: 'orders',
  warehouse: 'warehouse',
  inbound: 'inbound',
  transfer: 'transfer',
  customer: 'customer',
  supplier: 'supplier',
};

@Component({
  selector: 'wms-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.css'],
})
export class TopbarComponent implements OnInit, OnDestroy {
  @Input() mobile = false;
  @Output() openMenu = new EventEmitter<void>();
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  readonly search = new FormControl('', { nonNullable: true });
  results: SearchResult[] | null = null;
  searching = false;
  activeResult = -1;

  notifications: Notification[] = [];
  unread = 0;
  notificationsOpen = false;
  profileOpen = false;
  user: SessionUser | null = null;
  readonly isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  readonly searchIcons = SEARCH_ICONS;

  private readonly refreshNotifications = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly session: AuthSession,
    private readonly insights: InsightsApi,
    private readonly router: Router,
    private readonly dialogs: DialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.session.user$.pipe(takeUntil(this.destroy$)).subscribe((u) => {
      this.user = u;
      this.cdr.markForCheck();
    });

    this.search.valueChanges
      .pipe(
        map((q) => q.trim()),
        debounceTime(250),
        distinctUntilChanged(),
        tap((q) => {
          this.searching = q.length >= 2;
          if (q.length < 2) this.results = null;
          this.cdr.markForCheck();
        }),
        // switchMap: a newer query cancels the older request.
        switchMap((q) => (q.length < 2 ? of(null) : this.insights.search(q).pipe(catchError(() => of([] as SearchResult[]))))),
        takeUntil(this.destroy$),
      )
      .subscribe((r) => {
        this.results = r;
        this.searching = false;
        this.activeResult = r && r.length ? 0 : -1;
        this.cdr.markForCheck();
      });

    // Poll every 60 s; refresh immediately after marking read.
    merge(timer(0, 60_000), this.refreshNotifications)
      .pipe(
        switchMap(() => this.insights.notifications().pipe(catchError(() => of(null)))),
        takeUntil(this.destroy$),
      )
      .subscribe((n) => {
        if (!n) return;
        this.notifications = n.items;
        this.unread = n.unread;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.searchInput?.nativeElement.focus();
      this.searchInput?.nativeElement.select();
    }
    if (e.key === 'Escape') this.closeAll();
  }

  onSearchKey(e: KeyboardEvent): void {
    const n = this.results?.length ?? 0;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.activeResult = (this.activeResult + 1) % n;
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.activeResult = (this.activeResult - 1 + n) % n;
    } else if (e.key === 'Enter' && this.results && this.activeResult >= 0) {
      e.preventDefault();
      this.open(this.results[this.activeResult]);
    }
  }

  open(r: SearchResult): void {
    void this.router.navigate([r.link], { queryParams: r.queryParams ?? {} });
    this.clearSearch();
    this.searchInput?.nativeElement.blur();
  }

  clearSearch(): void {
    this.search.setValue('');
    this.results = null;
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
    this.profileOpen = false;
  }

  openNotification(n: Notification): void {
    if (!n.read) this.insights.markRead(n.id).subscribe(() => this.refreshNotifications.next());
    this.notificationsOpen = false;
    if (n.link) void this.router.navigateByUrl(n.link);
  }

  markAllRead(): void {
    this.insights.markAllRead().subscribe(() => this.refreshNotifications.next());
  }

  toggleProfile(): void {
    this.profileOpen = !this.profileOpen;
    this.notificationsOpen = false;
  }

  closeAll(): void {
    this.profileOpen = false;
    this.notificationsOpen = false;
    this.results = null;
  }

  changePassword(): void {
    this.profileOpen = false;
    this.dialogs.open(ChangePasswordDialogComponent);
  }

  openMfa(): void {
    this.profileOpen = false;
    this.dialogs.open(MfaDialogComponent);
  }

  showShortcuts(): void {
    this.dialogs.open(ShortcutsDialogComponent);
  }

  signOut(): void {
    this.profileOpen = false;
    this.session.logout().subscribe();
  }

  trackById = (_: number, x: { id: string }) => x.id;
}

// ---------------------------------------------------------------------------------------------

function matchPasswords(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value as string;
  const confirm = group.get('confirm');
  if (confirm && confirm.value && confirm.value !== next) {
    confirm.setErrors({ ...(confirm.errors ?? {}), custom: 'Passwords do not match.' });
  }
  return null;
}

@Component({
  selector: 'wms-change-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog sm" [formGroup]="form" (ngSubmit)="save()" aria-labelledby="cp-title" novalidate>
      <div class="dialog-header">
        <div><h2 id="cp-title">Change password</h2><p>You stay signed in on this device.</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="error" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ error }}</span></div>
        <div class="field">
          <label for="cp-current">Current password</label>
          <input id="cp-current" class="input" type="password" formControlName="currentPassword" autocomplete="current-password" />
          <wms-field-error [control]="form.controls.currentPassword" label="Current password"></wms-field-error>
        </div>
        <div class="field" style="margin-top: 14px">
          <label for="cp-new">New password</label>
          <input id="cp-new" class="input" type="password" formControlName="newPassword" autocomplete="new-password" />
          <small class="field-hint">Your organisation sets the minimum length (usually 12 characters).</small>
          <wms-field-error [control]="form.controls.newPassword" label="New password"></wms-field-error>
        </div>
        <div class="field" style="margin-top: 14px">
          <label for="cp-confirm">Confirm new password</label>
          <input id="cp-confirm" class="input" type="password" formControlName="confirm" autocomplete="new-password" />
          <wms-field-error [control]="form.controls.confirm" label="Confirmation"></wms-field-error>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : 'Change password' }}</button>
      </div>
    </form>
  `,
})
export class ChangePasswordDialogComponent {
  readonly form = new FormGroup(
    {
      currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      // The organisation's minimum (a security setting) is enforced by the server; 8 is the floor here.
      newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: matchPasswords },
  );
  busy = false;
  error = '';

  constructor(
    readonly ref: DialogRef<boolean>,
    private readonly session: AuthSession,
    private readonly toasts: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy = true;
    const v = this.form.getRawValue();
    this.session.changePassword(v.currentPassword, v.newPassword).subscribe({
      next: () => {
        this.toasts.success('Password changed');
        this.ref.close(true);
      },
      error: (e: unknown) => {
        this.busy = false;
        this.error = applyServerErrors(this.form, e).join(' ');
        this.cdr.markForCheck();
      },
    });
  }
}

/**
 * Two-factor sign-in: set up an authenticator app (scan the otpauth link or type the key, then
 * confirm with a code), or turn it off with a current code.
 */
@Component({
  selector: 'wms-mfa-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog sm" role="dialog" aria-labelledby="mfa-title">
      <div class="dialog-header">
        <div><h2 id="mfa-title">Two-factor sign-in</h2><p>{{ enabled ? 'On: you enter a code from your authenticator app when you sign in.' : 'Protect your account with a code from an authenticator app.' }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="error" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ error }}</span></div>

        <ng-container *ngIf="!enabled && !setup">
          <ol class="mfa-steps">
            <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
            <li>Add WMS360 to it with the key we show you.</li>
            <li>Enter the 6-digit code it displays to confirm.</li>
          </ol>
        </ng-container>

        <ng-container *ngIf="setup">
          <p>Add this key to your authenticator app (type it in, or open the link on your phone):</p>
          <p class="mfa-key" aria-label="Setup key">{{ groupedSecret }}</p>
          <p><a [href]="setup.otpauthUri">Open in authenticator app</a></p>
        </ng-container>

        <div class="field" *ngIf="setup || enabled" style="margin-top: 14px">
          <label for="mfa-code">{{ enabled ? 'Current code (to turn it off)' : 'Code from the app' }}</label>
          <input id="mfa-code" class="input mfa-code" [formControl]="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" />
          <wms-field-error [control]="code" label="Code"></wms-field-error>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Close</button>
        <button *ngIf="!enabled && !setup" type="button" class="btn btn-primary" (click)="start()" [disabled]="busy">{{ busy ? 'Preparing…' : 'Set up' }}</button>
        <button *ngIf="setup" type="button" class="btn btn-primary" (click)="confirm()" [disabled]="busy">{{ busy ? 'Checking…' : 'Turn on' }}</button>
        <!-- If the organisation requires two-factor sign-in, the server refuses and says so. -->
        <button *ngIf="enabled" type="button" class="btn btn-danger" (click)="turnOff()" [disabled]="busy">Turn off</button>
      </div>
    </div>
  `,
  styles: [
    '.mfa-steps { margin: 0; padding-left: 18px; display: grid; gap: 6px; }',
    '.mfa-key { font-family: var(--wms-font-mono); font-size: 16px; letter-spacing: 0.08em; background: var(--wms-surface-muted); padding: 10px 12px; border-radius: 6px; word-break: break-all; }',
    '.mfa-code { letter-spacing: 0.4em; font-family: var(--wms-font-mono); font-size: 18px; }',
  ],
})
export class MfaDialogComponent {
  readonly code = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] });
  setup: MfaSetup | null = null;
  busy = false;
  error = '';

  constructor(
    readonly ref: DialogRef<void>,
    private readonly session: AuthSession,
    private readonly toasts: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  get enabled(): boolean {
    return !!this.session.user?.mfaEnabled;
  }

  get groupedSecret(): string {
    return (this.setup?.secret ?? '').replace(/(.{4})/g, '$1 ').trim();
  }

  start(): void {
    this.run(this.session.setupMfa(), (s) => {
      this.setup = s;
    });
  }

  confirm(): void {
    this.code.markAsTouched();
    if (this.code.invalid) return;
    this.run(this.session.enableMfa(this.code.value), () => {
      this.toasts.success('Two-factor sign-in is on');
      this.ref.close();
    });
  }

  turnOff(): void {
    this.code.markAsTouched();
    if (this.code.invalid) return;
    this.run(this.session.disableMfa(this.code.value), () => {
      this.toasts.success('Two-factor sign-in is off');
      this.ref.close();
    });
  }

  private run<T>(call: import('rxjs').Observable<T>, done: (v: T) => void): void {
    this.busy = true;
    this.error = '';
    call.subscribe({
      next: (v) => {
        this.busy = false;
        done(v);
        this.cdr.markForCheck();
      },
      error: (e: unknown) => {
        this.busy = false;
        this.error = errorMessage(e);
        this.code.reset('');
        this.cdr.markForCheck();
      },
    });
  }
}

@Component({
  selector: 'wms-shortcuts-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog sm" role="dialog" aria-labelledby="sc-title">
      <div class="dialog-header">
        <div><h2 id="sc-title">Help & shortcuts</h2><p>Keys that work anywhere in WMS360.</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <dl class="dl">
          <dt><kbd>{{ mod }} K</kbd></dt><dd>Search products, orders, warehouses and more</dd>
          <dt><kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd></dt><dd>Move through and open search results</dd>
          <dt><kbd>Esc</kbd></dt><dd>Close menus, dialogs and search</dd>
          <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Step through a focused line chart</dd>
        </dl>
        <p class="muted" style="margin-top: 16px; font-size: 12px">
          Changes to stock go through commands (allocate, pick, receive) and are recorded in the movement ledger under Inventory → Movements.
        </p>
      </div>
    </div>
  `,
  styles: ['kbd { font-family: var(--wms-font-mono); font-size: 11px; border: 1px solid var(--wms-border-strong); border-radius: 4px; padding: 1px 6px; background: var(--wms-surface-muted); }'],
})
export class ShortcutsDialogComponent {
  readonly mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

  constructor(readonly ref: DialogRef<void>) {}
}

