import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';

import { CatalogApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { Customer, Page, Supplier } from '@core/models';
import { ListController } from '@core/state/list-controller';
import { downloadCsv } from '@shared/csv';
import { DialogService } from '@shared/ui/dialogs';
import { PartnerDialogComponent } from './catalog-dialogs';

type Partner = Supplier | Customer;

/** Suppliers and customers share one page shape; `data.kind` on the route picks which. */
@Component({
  selector: 'wms-partners',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Catalog</div>
          <h1>{{ isSupplier ? 'Suppliers' : 'Customers' }}</h1>
          <p>{{ isSupplier ? 'Manage supplier relationships and inbound partners.' : 'Customer accounts and their order history.' }}</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" (click)="export(s.page?.content ?? [])" [disabled]="!s.page?.content?.length"><wms-icon name="download"></wms-icon>Export</button>
          <button *wmsCan="'catalog:create'" type="button" class="btn btn-primary" (click)="create()"><wms-icon name="plus"></wms-icon>Add {{ kind }}</button>
        </div>
      </section>

      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search</span>
            <input type="search" [placeholder]="'Search ' + kind + 's…'" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="ON_HOLD">On hold</option>
            <option value="INACTIVE">Inactive</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} {{ kind }}s</span>
        </div>
        <wms-state-view
          *ngIf="s.status !== 'ready'"
          [status]="s.status"
          [error]="s.error"
          [entity]="kind + 's'"
          [icon]="kind"
          [emptyTitle]="'No ' + kind + 's yet'"
          [actionLabel]="session.can('catalog:create') ? 'Add ' + kind : ''"
          (action)="create()"
          (retry)="list.reload()"
          (clear)="list.clear()"
        ></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col"><button type="button" (click)="list.sortBy('code')">Code</button></th>
                <th scope="col"><button type="button" (click)="list.sortBy('name')">Name</button></th>
                <th scope="col" *ngIf="isSupplier">Contact</th>
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">City</th>
                <th scope="col" class="num">{{ isSupplier ? 'Inbound shipments' : 'Orders' }}</th>
                <th scope="col" *ngIf="!isSupplier">Last order</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of s.page.content; trackBy: trackById">
                <td class="code">{{ r.code }}</td>
                <td><strong>{{ r.name }}</strong></td>
                <td *ngIf="isSupplier">{{ asSupplier(r).contact }}</td>
                <td><a [href]="'mailto:' + r.email">{{ r.email }}</a></td>
                <td>{{ r.phone }}</td>
                <td>{{ r.city }}</td>
                <td class="num">
                  <a *ngIf="isSupplier" routerLink="/inbound" [queryParams]="{ q: r.name }">{{ asSupplier(r).inboundCount }}</a>
                  <a *ngIf="!isSupplier" routerLink="/orders" [queryParams]="{ customerId: r.id }">{{ asCustomer(r).orderCount }}</a>
                </td>
                <td *ngIf="!isSupplier">{{ asCustomer(r).lastOrderAt | relTime }}</td>
                <td><wms-status [value]="r.status"></wms-status></td>
                <td><button *wmsCan="'catalog:edit'" type="button" class="link-btn" (click)="edit(r)">Edit</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <wms-paginator *ngIf="s.status === 'ready'" [page]="s.page" (pageChange)="list.setPage($event)" (sizeChange)="list.setSize($event)"></wms-paginator>
      </section>
    </ng-container>
  `,
})
export class PartnersComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly kind: 'supplier' | 'customer' = this.route.snapshot.data['kind'];
  readonly isSupplier = this.kind === 'supplier';
  readonly list = new ListController<Partner>(
    (p) => (this.isSupplier ? this.api.suppliers(p) : this.api.customers(p)) as Observable<Page<Partner>>,
    { sort: 'name,asc', route: { router: this.router, route: this.route }, destroy$: this.destroy$ },
  );

  constructor(
    private readonly api: CatalogApi,
    private readonly dialogs: DialogService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly session: AuthSession,
  ) {}

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('new') && this.session.can('catalog:create')) this.create();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  asSupplier(r: Partner): Supplier {
    return r as Supplier;
  }

  asCustomer(r: Partner): Customer {
    return r as Customer;
  }

  create(): void {
    this.dialogs.open<Partner>(PartnerDialogComponent, { kind: this.kind }).subscribe((r) => r && this.list.reload());
  }

  edit(record: Partner): void {
    this.dialogs.open<Partner>(PartnerDialogComponent, { kind: this.kind, record }).subscribe((r) => r && this.list.reload());
  }

  export(rows: Partner[]): void {
    downloadCsv(`${this.kind}s.csv`, [
      ['Code', 'Name', 'Email', 'Phone', 'City', 'Status'],
      ...rows.map((r) => [r.code, r.name, r.email, r.phone, r.city, r.status]),
    ]);
  }

  trackById = (_: number, r: Partner) => r.id;
}
