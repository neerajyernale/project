import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

import {
  AdminApi,
  AuthSession,
  errorMessage,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  PermissionAction,
  Role,
  ToastService,
} from '@wms/core';
import { DialogService } from '@wms/design-system';
import { ADMIN_TABS } from './users.component';

/**
 * Per-role permission matrix (the prototype showed one matrix for every role).
 * Permissions are server-owned strings like `orders:approve`; this edits a role's set.
 */
@Component({
  selector: 'wms-roles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-header">
      <div>
        <div class="eyebrow">Administration</div>
        <h1>Users &amp; roles</h1>
        <p>Who can sign in, what they can do, and in which warehouses.</p>
      </div>
    </section>
    ${ADMIN_TABS}

    <div class="panel" *ngIf="loadError"><wms-state-view status="error" [error]="null" entity="roles" (retry)="load()"></wms-state-view></div>
    <div class="panel" *ngIf="!roles.length && !loadError"><wms-state-view status="loading"></wms-state-view></div>

    <section class="panel roles" *ngIf="roles.length && selected">
      <aside class="role-list" aria-label="Roles">
        <div class="role-list-head">
          <h2>Roles</h2>
          <button *wmsCan="'users:create'" type="button" class="btn btn-sm" (click)="newRole()" aria-label="New role"><wms-icon name="plus"></wms-icon>New</button>
        </div>
        <button *ngFor="let r of roles" type="button" class="role-item" [class.active]="r.id === selected.id" [attr.aria-current]="r.id === selected.id" (click)="select(r)">
          <span>{{ r.name }}<small *ngIf="!r.id" class="chip">Draft</small></span>
          <small>{{ r.userCount }} user{{ r.userCount === 1 ? '' : 's' }}</small>
        </button>
      </aside>

      <div class="matrix-area">
        <div class="inline-alert danger" *ngIf="banner" role="alert"><wms-icon name="alert-circle"></wms-icon><span>{{ banner }}</span></div>
        <div class="matrix-head" [formGroup]="meta">
          <div class="meta-fields">
            <div class="field">
              <label for="r-name">Role name</label>
              <input id="r-name" class="input" formControlName="name" [readonly]="selected.system" />
              <small class="field-hint" *ngIf="selected.system">Built-in role: the name is fixed; permissions can change.</small>
              <wms-field-error [control]="meta.controls.name" label="Role name"></wms-field-error>
            </div>
            <div class="field">
              <label for="r-desc">Description</label>
              <input id="r-desc" class="input" formControlName="description" />
            </div>
          </div>
          <div class="matrix-actions" *wmsCan="'users:edit'">
            <button *ngIf="!selected.system && selected.id" type="button" class="btn btn-sm" (click)="remove()" [disabled]="busy">Delete role</button>
            <button type="button" class="btn btn-sm" (click)="revert()" [disabled]="!dirty || busy">Discard</button>
            <button type="button" class="btn btn-primary btn-sm" (click)="save()" [disabled]="!dirty || busy">{{ busy ? 'Saving…' : 'Save permissions' }}</button>
          </div>
        </div>

        <div class="table-scroll">
          <table class="data-table matrix">
            <caption class="sr-only">Permissions for {{ selected.name }}</caption>
            <thead>
              <tr>
                <th scope="col">Module</th>
                <th scope="col" *ngFor="let a of actions" class="c">{{ a }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let m of modules">
                <th scope="row"><strong>{{ m.label }}</strong></th>
                <td *ngFor="let a of actions" class="c">
                  <input
                    *ngIf="m.actions.includes(a); else na"
                    type="checkbox"
                    [checked]="has(m.key, a)"
                    [disabled]="!canEdit"
                    (change)="toggle(m.key, a)"
                    [attr.aria-label]="m.label + ': ' + a"
                  />
                  <ng-template #na><span class="na" aria-label="Not applicable">—</span></ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="hint">{{ draft.size }} permissions granted. Users in this role get the change on their next page load or sign-in.</p>
      </div>
    </section>
  `,
  styles: [
    `
      .roles { display: flex; min-height: 480px; }
      .role-list { width: 230px; flex: 0 0 230px; border-right: 1px solid var(--wms-divider); padding: 12px; }
      .role-list-head { display: flex; justify-content: space-between; align-items: center; margin: 4px 4px 10px; }
      .role-list-head h2 { font-size: 14px; }
      .role-item { width: 100%; border: 0; background: transparent; border-radius: 6px; padding: 9px 10px; display: flex; justify-content: space-between; align-items: center; text-align: left; font-size: 13px; font-weight: 600; color: var(--wms-text-body); gap: 8px; }
      .role-item small { font-size: 11px; color: var(--wms-text-faint); font-weight: 400; }
      .role-item:hover { background: var(--wms-surface-muted); }
      .role-item.active { background: var(--wms-primary-soft); color: var(--wms-primary); }
      .role-item.active small { color: var(--wms-primary-text); }
      .matrix-area { flex: 1; min-width: 0; padding: 18px 22px; }
      .matrix-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
      .meta-fields { display: grid; grid-template-columns: 220px minmax(220px, 1fr); gap: 12px; flex: 1; }
      .matrix-actions { display: flex; gap: 8px; }
      .matrix { min-width: 560px; }
      .matrix th[scope='row'] { text-align: left; font-size: 12px; text-transform: none; letter-spacing: 0; color: var(--wms-text); font-weight: 400; padding: 10px 20px; border-bottom: 1px solid var(--wms-divider); }
      .matrix .c { text-align: center; text-transform: capitalize; }
      .matrix input { width: 16px; height: 16px; accent-color: var(--wms-primary); }
      .na { color: var(--wms-text-faint); }
      .hint { font-size: 11px; color: var(--wms-text-subtle); margin-top: 12px; }
      @media (max-width: 900px) {
        .roles { flex-direction: column; }
        .role-list { width: 100%; flex: none; border-right: 0; border-bottom: 1px solid var(--wms-divider); display: flex; flex-wrap: wrap; gap: 4px; }
        .role-list-head { width: 100%; }
        .role-item { width: auto; }
        .meta-fields { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class RolesComponent implements OnInit {
  readonly modules = PERMISSION_MODULES;
  readonly actions = PERMISSION_ACTIONS;
  roles: Role[] = [];
  selected: Role | null = null;
  draft = new Set<string>();
  busy = false;
  banner = '';
  loadError = false;
  readonly meta = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2)] }),
    description: new FormControl('', { nonNullable: true }),
  });

  constructor(
    private readonly api: AdminApi,
    private readonly session: AuthSession,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  get canEdit(): boolean {
    return this.session.can('users:edit');
  }

  get dirty(): boolean {
    if (!this.selected) return false;
    const perms = this.selected.permissions;
    return (
      !this.selected.id ||
      this.meta.dirty ||
      perms.length !== this.draft.size ||
      perms.some((p) => !this.draft.has(p))
    );
  }

  load(selectId?: string): void {
    this.loadError = false;
    this.api.roles().subscribe({
      next: (roles) => {
        this.roles = roles;
        this.select(roles.find((r) => r.id === (selectId ?? this.selected?.id)) ?? roles[0]);
      },
      error: () => {
        this.loadError = true;
        this.cdr.markForCheck();
      },
    });
  }

  select(r: Role): void {
    if (this.selected && this.dirty && r !== this.selected) {
      this.dialogs
        .confirm({ title: 'Discard unsaved changes?', message: `Your changes to ${this.selected.name} are not saved.`, confirmLabel: 'Discard', tone: 'danger' })
        .subscribe((ok) => ok && this.apply(r));
      return;
    }
    this.apply(r);
  }

  private apply(r: Role): void {
    if (this.selected && !this.selected.id && r !== this.selected) this.roles = this.roles.filter((x) => x.id);
    this.selected = r;
    this.draft = new Set(r.permissions);
    this.meta.reset({ name: r.name, description: r.description });
    // Read-only for people who can view roles but not change them.
    if (this.canEdit) this.meta.enable();
    else this.meta.disable();
    this.banner = '';
    this.cdr.markForCheck();
  }

  has(module: string, action: PermissionAction): boolean {
    return this.draft.has(`${module}:${action}`);
  }

  toggle(module: string, action: PermissionAction): void {
    const p = `${module}:${action}`;
    const next = new Set(this.draft);
    if (next.has(p)) {
      next.delete(p);
      // Without view, the other actions are meaningless: remove them too.
      if (action === 'view') Array.from(next).filter((x) => x.startsWith(`${module}:`)).forEach((x) => next.delete(x));
    } else {
      next.add(p);
      next.add(`${module}:view`);
    }
    this.draft = next;
  }

  newRole(): void {
    const draft: Role = { id: '', name: 'New role', description: '', system: false, permissions: ['dashboard:view'], userCount: 0 };
    this.roles = [...this.roles.filter((r) => r.id), draft];
    this.apply(draft);
    this.meta.markAsDirty();
  }

  revert(): void {
    if (!this.selected) return;
    if (!this.selected.id) {
      this.roles = this.roles.filter((r) => r.id);
      this.apply(this.roles[0]);
    } else {
      this.apply(this.selected);
    }
  }

  save(): void {
    if (!this.selected) return;
    this.meta.markAllAsTouched();
    if (this.meta.invalid) return;
    const body = { ...this.meta.getRawValue(), permissions: Array.from(this.draft).sort() };
    const role = this.selected;
    this.busy = true;
    this.banner = '';
    (role.id ? this.api.updateRole(role.id, body) : this.api.createRole(body)).subscribe({
      next: (saved) => {
        this.busy = false;
        this.toasts.success(`${saved.name} saved`, `${saved.permissions.length} permissions`);
        // If the admin edited their own role, pick up the change now.
        if (saved.id === this.session.user?.roleId) this.session.reloadUser().subscribe();
        this.selected = null;
        this.load(saved.id);
      },
      error: (e: unknown) => {
        this.busy = false;
        this.banner = errorMessage(e);
        this.cdr.markForCheck();
      },
    });
  }

  remove(): void {
    const role = this.selected;
    if (!role?.id) return;
    this.dialogs
      .confirm({ title: `Delete ${role.name}?`, message: 'Only roles with no users can be deleted.', confirmLabel: 'Delete role', tone: 'danger', action: () => this.api.deleteRole(role.id) })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${role.name} deleted`);
        this.selected = null;
        this.load();
      });
  }
}
