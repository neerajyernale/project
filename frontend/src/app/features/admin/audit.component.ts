import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { AdminApi, AuditEntry, ListController } from '@wms/core';
import { downloadCsv } from '@wms/design-system';
import { ADMIN_TABS } from './users.component';

/** Groups for the action filter; values are the server's action codes. */
const ACTION_GROUPS: { label: string; value: string }[] = [
  { label: 'Sign-ins', value: 'LOGIN_SUCCEEDED,LOGIN_FAILED' },
  { label: 'Failed sign-ins', value: 'LOGIN_FAILED' },
  { label: 'Passwords', value: 'PASSWORD_CHANGED,PASSWORD_RESET,PASSWORD_RESET_REQUESTED' },
  { label: 'Two-factor', value: 'MFA_ENABLED,MFA_DISABLED,MFA_RESET' },
  { label: 'Users', value: 'USER_CREATED,USER_UPDATED,USER_ENABLED,USER_DISABLED,USER_INVITED,INVITATION_ACCEPTED' },
  { label: 'Roles', value: 'ROLE_CREATED,ROLE_UPDATED,ROLE_DELETED' },
  { label: 'Settings', value: 'SETTINGS_UPDATED' },
  { label: 'Session security', value: 'REFRESH_TOKEN_REUSED' },
];

const DANGER = new Set(['LOGIN_FAILED', 'REFRESH_TOKEN_REUSED', 'USER_DISABLED', 'ROLE_DELETED', 'MFA_DISABLED', 'MFA_RESET']);

/** The security and administration trail: who did what, when and from where. */
@Component({
  selector: 'wms-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Users &amp; Roles</div>
          <h1>Audit log</h1>
          <p>Sign-ins, password and two-factor changes, and every change to users, roles and settings.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" (click)="export(s.page?.content ?? [])" [disabled]="!s.page?.content?.length"><wms-icon name="download"></wms-icon>Export</button>
        </div>
      </section>
      ${ADMIN_TABS}
      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search the audit log</span>
            <input type="search" placeholder="Search email or detail…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Event type" [value]="list.filter('action')" (change)="list.setFilter('action', $any($event.target).value)">
            <option value="">All events</option>
            <option *ngFor="let g of groups" [value]="g.value">{{ g.label }}</option>
          </select>
          <label class="date-filter">From <input type="date" class="input" [value]="list.filter('from')" (change)="list.setFilter('from', $any($event.target).value)" /></label>
          <label class="date-filter">To <input type="date" class="input" [value]="list.filter('to')" (change)="list.setFilter('to', $any($event.target).value)" /></label>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements | number }} events</span>
        </div>
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="events" icon="shield" emptyTitle="No events yet" (retry)="list.reload()" (clear)="list.clear()"></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead><tr><th scope="col"><button type="button" (click)="list.sortBy('at')">When</button></th><th scope="col">Event</th><th scope="col">Who</th><th scope="col">Detail</th><th scope="col">From</th></tr></thead>
            <tbody>
              <tr *ngFor="let a of s.page.content; trackBy: trackById">
                <td>{{ a.at | wmsDate: 'datetime' }}</td>
                <td><span class="chip" [class.chip-danger]="danger(a)">{{ a.action | humanize }}</span></td>
                <td>{{ a.actorEmail || 'System' }}</td>
                <td>{{ a.detail || '—' }}</td>
                <td class="code">{{ a.ip || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" [sizes]="[25, 50, 100, 200]" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
  styles: [
    '.date-filter { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--wms-text-muted); }',
    '.date-filter .input { width: auto; }',
    '.chip-danger { background: var(--wms-danger-soft); color: var(--wms-danger); }',
  ],
})
export class AuditComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly groups = ACTION_GROUPS;
  readonly list = new ListController<AuditEntry>((p) => this.api.audit(p), {
    size: 50,
    sort: 'at,desc',
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  constructor(private readonly api: AdminApi, private readonly router: Router, private readonly route: ActivatedRoute) {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  danger(a: AuditEntry): boolean {
    return DANGER.has(a.action);
  }

  export(rows: AuditEntry[]): void {
    downloadCsv('audit-log.csv', [
      ['When', 'Event', 'Who', 'Detail', 'Target', 'IP'],
      ...rows.map((a) => [a.at, a.action, a.actorEmail, a.detail, a.targetId, a.ip]),
    ]);
  }

  trackById = (_: number, a: AuditEntry) => a.id;
}
