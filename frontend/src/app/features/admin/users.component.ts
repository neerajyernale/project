import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { AdminApi, AuthSession, errorMessage, ListController, Role, ToastService, User, WarehouseContext } from '@wms/core';
import { DialogService, FormDialog } from '@wms/design-system';

export const ADMIN_TABS = `
  <nav class="tabs" aria-label="Access management">
    <a routerLink="/admin/users" routerLinkActive="active">Users</a>
    <a routerLink="/admin/roles" routerLinkActive="active">Roles &amp; permissions</a>
    <a routerLink="/admin/audit" routerLinkActive="active">Audit log</a>
  </nav>
`;

@Component({
  selector: 'wms-user-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog" [formGroup]="form" (ngSubmit)="save()" novalidate aria-labelledby="u-title">
      <div class="dialog-header">
        <div><h2 id="u-title">{{ data.user ? 'Edit user' : 'Invite user' }}</h2><p>{{ data.user ? data.user.email : 'They sign in with their work email.' }}</p></div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="form-grid">
          <div class="field">
            <label for="u-name">Full name <span class="req">*</span></label>
            <input id="u-name" class="input" formControlName="name" autocomplete="off" />
            <wms-field-error [control]="form.controls.name" label="Name"></wms-field-error>
          </div>
          <div class="field">
            <label for="u-email">Work email <span class="req">*</span></label>
            <input id="u-email" class="input" type="email" formControlName="email" autocomplete="off" />
            <wms-field-error [control]="form.controls.email" label="Email"></wms-field-error>
          </div>
          <div class="field full">
            <label for="u-role">Role <span class="req">*</span></label>
            <select id="u-role" class="select" formControlName="roleId">
              <option value="" disabled>Choose…</option>
              <option *ngFor="let r of data.roles" [value]="r.id">{{ r.name }} — {{ r.description }}</option>
            </select>
            <wms-field-error [control]="form.controls.roleId" label="Role"></wms-field-error>
          </div>
          <fieldset class="field full scope">
            <legend class="label">Warehouses</legend>
            <small class="field-hint">Leave all unticked to allow every warehouse. The server enforces this on every request.</small>
            <div class="scope-grid">
              <label *ngFor="let w of context.options$ | async"><input type="checkbox" [checked]="scope.has(w.id)" (change)="toggle(w.id)" /> {{ w.name }}</label>
            </div>
          </fieldset>
        </div>
        <p class="note" *ngIf="!data.user">Until email invitations are connected, new users sign in with the demo password.</p>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" (click)="ref.close()">Cancel</button>
        <button type="submit" class="btn btn-primary" [disabled]="busy">{{ busy ? 'Saving…' : data.user ? 'Save changes' : 'Invite user' }}</button>
      </div>
    </form>
  `,
  styles: [
    `
      .scope { border: 0; padding: 0; margin: 0; }
      .scope-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-top: 8px; }
      .scope-grid label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
      .note { margin-top: 14px; font-size: 11px; color: var(--wms-text-subtle); }
    `,
  ],
})
export class UserDialogComponent extends FormDialog<User> {
  readonly scope = new Set<string>(this.data.user?.warehouseIds ?? []);
  readonly form = new FormGroup({
    name: new FormControl(this.data.user?.name ?? '', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    email: new FormControl(this.data.user?.email ?? '', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    roleId: new FormControl(this.data.user?.roleId ?? '', { nonNullable: true, validators: [Validators.required] }),
  });

  constructor(
    @Inject(DIALOG_DATA) readonly data: { user?: User; roles: Role[] },
    private readonly api: AdminApi,
    readonly context: WarehouseContext,
    ref: DialogRef<User>,
    cdr: ChangeDetectorRef,
    toasts: ToastService,
  ) {
    super(cdr, toasts, ref);
  }

  toggle(id: string): void {
    if (this.scope.has(id)) this.scope.delete(id);
    else this.scope.add(id);
  }

  save(): void {
    const body = { ...this.form.getRawValue(), warehouseIds: Array.from(this.scope) };
    const u = this.data.user;
    this.submit(u ? this.api.updateUser(u.id, { ...body, version: u.version }) : this.api.createUser(body), u ? 'User updated' : `${body.name} invited`);
  }
}

@Component({
  selector: 'wms-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Administration</div>
          <h1>Users &amp; roles</h1>
          <p>Who can sign in, what they can do, and in which warehouses.</p>
        </div>
        <div class="page-actions">
          <button *wmsCan="'users:create'" type="button" class="btn btn-primary" (click)="invite()"><wms-icon name="plus"></wms-icon>Invite user</button>
        </div>
      </section>
      ${ADMIN_TABS}
      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search users</span>
            <input type="search" placeholder="Search name or email…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Role" [value]="list.filter('roleId')" (change)="list.setFilter('roleId', $any($event.target).value)">
            <option value="">All roles</option>
            <option *ngFor="let r of roles" [value]="r.id" [selected]="r.id === list.filter('roleId')">{{ r.name }}</option>
          </select>
          <select class="filter-select" aria-label="Warehouse" [value]="list.filter('warehouseId')" (change)="list.setFilter('warehouseId', $any($event.target).value)">
            <option value="">All warehouses</option>
            <option *ngFor="let w of context.options$ | async" [value]="w.id" [selected]="w.id === list.filter('warehouseId')">{{ w.name }}</option>
          </select>
          <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} users</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="users" icon="users" (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page">
          <table class="data-table">
            <thead><tr><th scope="col"><button type="button" (click)="list.sortBy('name')">Name</button></th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Warehouses</th><th scope="col"><button type="button" (click)="list.sortBy('lastLoginAt')">Last sign-in</button></th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              <tr *ngFor="let u of s.page.content; trackBy: trackById">
                <td><div class="avatar-cell"><span class="thumb round">{{ u.name | initials }}</span><strong>{{ u.name }}</strong><span class="chip" *ngIf="u.id === me">You</span></div></td>
                <td class="muted">{{ u.email }}</td>
                <td><span class="chip">{{ u.roleName }}</span></td>
                <td>{{ scopeLabel(u) }}</td>
                <td>{{ u.lastLoginAt | relTime }}</td>
                <td><wms-status [value]="u.status"></wms-status></td>
                <td>
                  <div class="row-actions" *ngIf="u.id !== me">
                    <button *wmsCan="'users:edit'" type="button" class="link-btn" (click)="edit(u)">Edit</button>
                    <ng-container *wmsCan="'users:edit'">
                      <button type="button" class="link-btn" (click)="setEnabled(u, u.status === 'DISABLED')">{{ u.status === 'DISABLED' ? 'Enable' : 'Disable' }}</button>
                    </ng-container>
                    <ng-container *ngIf="u.status === 'INVITED'">
                      <button *wmsCan="'users:create'" type="button" class="link-btn" (click)="resendInvite(u)">Resend invite</button>
                    </ng-container>
                    <button *wmsCan="'users:edit'" type="button" class="link-btn" (click)="resetMfa(u)">Reset 2FA</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
})
export class UsersComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  roles: Role[] = [];
  readonly me = this.session.user?.id;
  readonly list = new ListController<User>((p) => this.api.users(p), { sort: 'name,asc', route: { router: this.router, route: this.route }, destroy$: this.destroy$ });

  constructor(
    private readonly api: AdminApi,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly session: AuthSession,
    private readonly cdr: ChangeDetectorRef,
    readonly context: WarehouseContext,
  ) {
    this.api.roles().subscribe((r) => {
      this.roles = r;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  scopeLabel(u: User): string {
    if (!u.warehouseIds.length) return 'All warehouses';
    return u.warehouseIds.map((id) => this.context.name(id).split(' ')[0]).join(', ');
  }

  invite(): void {
    this.dialogs.open<User>(UserDialogComponent, { roles: this.roles }).subscribe((u) => u && this.list.reload());
  }

  edit(user: User): void {
    this.dialogs.open<User>(UserDialogComponent, { user, roles: this.roles }).subscribe((u) => u && this.list.reload());
  }

  setEnabled(u: User, enabled: boolean): void {
    this.dialogs
      .confirm({
        title: `${enabled ? 'Enable' : 'Disable'} ${u.name}?`,
        message: enabled ? 'They can sign in again with their existing role.' : 'They are signed out everywhere immediately and cannot sign in until re-enabled.',
        confirmLabel: enabled ? 'Enable' : 'Disable user',
        tone: enabled ? 'primary' : 'danger',
        action: () => this.api.setUserEnabled(u.id, enabled),
      })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${u.name} ${enabled ? 'enabled' : 'disabled'}`);
        this.list.reload();
      });
  }

  resendInvite(u: User): void {
    this.api.resendInvite(u.id).subscribe({
      next: () => this.toasts.success(`Invitation sent again to ${u.email}`),
      error: (e: unknown) => this.toasts.error(errorMessage(e)),
    });
  }

  /** For a user who lost their phone: signs them out; they set up a new authenticator at next sign-in. */
  resetMfa(u: User): void {
    this.dialogs
      .confirm({
        title: `Reset two-factor sign-in for ${u.name}?`,
        message: 'Their authenticator stops working and they are signed out. They can sign in with their password and set up a new one.',
        confirmLabel: 'Reset 2FA',
        tone: 'danger',
        action: () => this.api.resetMfa(u.id),
      })
      .subscribe((r) => r && this.toasts.success(`Two-factor sign-in reset for ${u.name}`));
  }

  trackById = (_: number, u: User) => u.id;
}

