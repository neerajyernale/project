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

import { applyServerErrors } from '@core/api/api-error';
import { InsightsApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { Notification, SearchResult, SessionUser } from '@core/models';
import { ToastService } from '@core/notify/toast.service';
import { DialogService } from '@shared/ui/dialogs';

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
          <small class="field-hint">At least 12 characters.</small>
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
      newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(12)] }),
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

