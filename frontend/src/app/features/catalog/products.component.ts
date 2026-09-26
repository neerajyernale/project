import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { skip } from 'rxjs/operators';

import { CatalogApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { Product } from '@core/models';
import { ToastService } from '@core/notify/toast.service';
import { ListController } from '@core/state/list-controller';
import { downloadCsv } from '@shared/csv';
import { DialogService } from '@shared/ui/dialogs';
import { ProductDialogComponent } from './catalog-dialogs';

@Component({
  selector: 'wms-products',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *ngIf="list.state$ | async as s">
      <section class="page-header">
        <div>
          <div class="eyebrow">Catalog</div>
          <h1>Products</h1>
          <p>Maintain your product catalog, SKUs and reorder rules.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" (click)="export(s.page?.content ?? [])" [disabled]="!s.page?.content?.length"><wms-icon name="download"></wms-icon>Export</button>
          <button *wmsCan="'catalog:create'" type="button" class="btn btn-primary" (click)="create()"><wms-icon name="plus"></wms-icon>Add product</button>
        </div>
      </section>

      <section class="panel">
        <div class="table-controls">
          <label class="search-box"><wms-icon name="search"></wms-icon><span class="sr-only">Search products</span>
            <input type="search" placeholder="Search SKU, name, brand…" [value]="list.query.q" (input)="list.search($any($event.target).value)" />
          </label>
          <select class="filter-select" aria-label="Category" [value]="list.filter('category')" (change)="list.setFilter('category', $any($event.target).value)">
            <option value="">All categories</option>
            <option *ngFor="let c of categories" [value]="c">{{ c }}</option>
          </select>
          <select class="filter-select" aria-label="Stock" [value]="list.filter('stockStatus')" (change)="list.setFilter('stockStatus', $any($event.target).value)">
            <option value="">Any stock level</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW_STOCK">Low stock</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="OVERSTOCK">Overstock</option>
          </select>
          <select class="filter-select" aria-label="Status" [value]="list.filter('status')" (change)="list.setFilter('status', $any($event.target).value)">
            <option value="">Active and discontinued</option>
            <option value="ACTIVE">Active</option>
            <option value="DISCONTINUED">Discontinued</option>
          </select>
          <button *ngIf="list.hasFilters" type="button" class="link-btn" (click)="list.clear()">Clear</button>
          <span class="results-count" *ngIf="s.page">{{ s.page.totalElements }} products · stock {{ (context.active$ | async)?.name || 'across all warehouses' }}</span>
        </div>
        <wms-state-view
          *ngIf="s.status !== 'ready'"
          [status]="s.status"
          [error]="s.error"
          entity="products"
          icon="product"
          emptyTitle="No products yet"
          emptyHint="Add products before you can receive or order them."
          [actionLabel]="session.can('catalog:create') ? 'Add product' : ''"
          (action)="create()"
          (retry)="list.reload()"
          (clear)="list.clear()"
        ></wms-state-view>
        <div class="table-scroll" *ngIf="s.status === 'ready' && s.page" [style.opacity]="s.refreshing ? 0.6 : 1">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col"><button type="button" (click)="list.sortBy('sku')">SKU</button></th>
                <th scope="col"><button type="button" (click)="list.sortBy('name')">Product</button></th>
                <th scope="col">Brand</th>
                <th scope="col">Unit</th>
                <th scope="col" class="num"><button type="button" (click)="list.sortBy('onHand')">On hand</button></th>
                <th scope="col" class="num"><button type="button" (click)="list.sortBy('available')">Available</button></th>
                <th scope="col" class="num">Reorder at</th>
                <th scope="col">Stock</th>
                <th scope="col">Status</th>
                <th scope="col"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of s.page.content; trackBy: trackById">
                <td class="code">{{ p.sku }}</td>
                <td><div class="cell-stack"><strong>{{ p.name }}</strong><small>{{ p.category }}</small></div></td>
                <td>{{ p.brand || '—' }}</td>
                <td>{{ p.uom }}</td>
                <td class="num">{{ p.onHand | number }}</td>
                <td class="num"><strong>{{ p.available | number }}</strong></td>
                <td class="num">{{ p.reorderLevel | number }}</td>
                <td><wms-status [value]="p.stockStatus"></wms-status></td>
                <td><wms-status [value]="p.status"></wms-status></td>
                <td>
                  <div class="row-actions">
                    <a *wmsCan="'inventory:view'" class="link-btn" routerLink="/inventory" [queryParams]="{ q: p.sku }">Stock</a>
                    <button *wmsCan="'catalog:edit'" type="button" class="link-btn" (click)="edit(p)">Edit</button>
                    <ng-container *wmsCan="'catalog:delete'">
                      <button *ngIf="p.status === 'ACTIVE'" type="button" class="link-btn" (click)="setActive(p, false)">Discontinue</button>
                    </ng-container>
                    <ng-container *wmsCan="'catalog:edit'">
                      <button *ngIf="p.status !== 'ACTIVE'" type="button" class="link-btn" (click)="setActive(p, true)">Reactivate</button>
                    </ng-container>
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
export class ProductsComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  categories: string[] = [];
  readonly list = new ListController<Product>((p) => this.api.products(p), {
    sort: 'sku,asc',
    reload$: this.context.activeId$.pipe(skip(1)),
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  constructor(
    private readonly api: CatalogApi,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    readonly context: WarehouseContext,
    readonly session: AuthSession,
  ) {}

  ngOnInit(): void {
    this.api.categories().subscribe((c) => (this.categories = c));
    if (this.route.snapshot.queryParamMap.get('new') && this.session.can('catalog:create')) this.create();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  create(): void {
    this.dialogs.open<Product>(ProductDialogComponent, { categories: this.categories }).subscribe((p) => p && this.list.reload());
  }

  edit(product: Product): void {
    this.dialogs.open<Product>(ProductDialogComponent, { product, categories: this.categories }).subscribe((p) => p && this.list.reload());
  }

  setActive(p: Product, active: boolean): void {
    this.dialogs
      .confirm({
        title: active ? `Reactivate ${p.sku}?` : `Discontinue ${p.sku}?`,
        message: active ? 'It can be ordered, received and transferred again.' : 'It can no longer be ordered. Stock on hand stays and can still be picked for existing orders.',
        confirmLabel: active ? 'Reactivate' : 'Discontinue',
        tone: active ? 'primary' : 'danger',
        action: () => this.api.setProductActive(p.id, active),
      })
      .subscribe((r) => {
        if (!r) return;
        this.toasts.success(`${p.sku} ${active ? 'reactivated' : 'discontinued'}`);
        this.list.reload();
      });
  }

  export(rows: Product[]): void {
    downloadCsv('products.csv', [
      ['SKU', 'Name', 'Category', 'Brand', 'Unit', 'On hand', 'Available', 'Reorder level', 'Max stock', 'Unit cost', 'Stock', 'Status'],
      ...rows.map((p) => [p.sku, p.name, p.category, p.brand, p.uom, p.onHand, p.available, p.reorderLevel, p.maxStock, p.unitCost, p.stockStatus, p.status]),
    ]);
  }

  trackById = (_: number, p: Product) => p.id;
}
