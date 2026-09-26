import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Inject, NgModule } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';

import { InsightsApi } from '@core/api/domain-apis';
import { PermissionGuard } from '@core/auth/guards';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { ReportDefinition, ReportResult } from '@core/models';
import { loadResource } from '@core/state/list-controller';
import { downloadCsv } from '@shared/csv';
import { SharedModule } from '@shared/shared.module';
import { DialogService } from '@shared/ui/dialogs';

const CATEGORY_ICONS: Record<ReportDefinition['category'], string> = {
  Inventory: 'inventory',
  Warehouse: 'warehouse',
  Orders: 'orders',
  Suppliers: 'supplier',
};

interface RunRequest {
  def: ReportDefinition;
  filters: { warehouseId: string | null; from: string; to: string };
  warehouseLabel: string;
}

@Component({
  selector: 'wms-report-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog lg report" role="dialog" aria-labelledby="rp-title">
      <div class="dialog-header">
        <div>
          <h2 id="rp-title">{{ req.def.name }}</h2>
          <p>{{ req.warehouseLabel }} · {{ req.filters.from | wmsDate }} – {{ req.filters.to | wmsDate }}</p>
        </div>
        <button type="button" class="icon-close" (click)="ref.close()" aria-label="Close"><wms-icon name="x" [size]="18"></wms-icon></button>
      </div>
      <div class="dialog-body" *ngIf="state$ | async as s">
        <wms-state-view *ngIf="s.status !== 'ready'" [status]="s.status" [error]="s.error" entity="this report" [rows]="6"></wms-state-view>
        <ng-container *ngIf="s.data as r">
          <p class="meta">{{ r.rows.length | number }} rows · generated {{ r.generatedAt | wmsDate: 'datetime' }}</p>
          <wms-state-view *ngIf="!r.rows.length" status="empty" icon="reports" emptyTitle="No data for these filters" emptyHint="Widen the date range or choose all warehouses."></wms-state-view>
          <div class="table-scroll" *ngIf="r.rows.length">
            <table class="data-table">
              <thead><tr><th scope="col" *ngFor="let c of r.columns" [class.num]="c.numeric">{{ c.label }}</th></tr></thead>
              <tbody>
                <tr *ngFor="let row of r.rows | slice: 0 : 500">
                  <td *ngFor="let c of r.columns" [class.num]="c.numeric">{{ c.numeric ? (row[c.key] | number) : row[c.key] }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="meta" *ngIf="r.rows.length > 500">Showing the first 500 rows. Export for the full report.</p>
        </ng-container>
      </div>
      <div class="dialog-footer" *ngIf="state$ | async as s">
        <button type="button" class="btn" (click)="print()" [disabled]="!s.data?.rows?.length"><wms-icon name="printer"></wms-icon>Print</button>
        <button type="button" class="btn btn-primary" (click)="s.data && export(s.data)" [disabled]="!s.data?.rows?.length"><wms-icon name="download"></wms-icon>Export CSV</button>
      </div>
    </div>
  `,
  styles: ['.report { width: 1000px; }', '.meta { font-size: 11px; color: var(--wms-text-subtle); margin-bottom: 10px; }'],
})
export class ReportPreviewComponent {
  readonly state$ = loadResource(this.api.runReport(this.req.def.key, this.req.filters));

  constructor(@Inject(DIALOG_DATA) readonly req: RunRequest, readonly ref: DialogRef<boolean>, private readonly api: InsightsApi) {}

  export(r: ReportResult): void {
    downloadCsv(`${r.key}-${r.generatedAt.slice(0, 10)}.csv`, [r.columns.map((c) => c.label), ...r.rows.map((row) => r.columns.map((c) => row[c.key]))]);
  }

  print(): void {
    window.print();
  }
}

@Component({
  selector: 'wms-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page-header">
      <div>
        <div class="eyebrow">Analytics</div>
        <h1>Reports</h1>
        <p>Turn warehouse activity into operational insight. Every report is computed from live data when you run it.</p>
      </div>
    </section>

    <section class="panel filters" [formGroup]="filters">
      <div class="field">
        <label for="rf-wh">Warehouse</label>
        <select id="rf-wh" class="select" formControlName="warehouseId">
          <option value="" *ngIf="context.canChooseAll">All warehouses</option>
          <option *ngFor="let w of context.options$ | async" [value]="w.id">{{ w.name }}</option>
        </select>
      </div>
      <div class="field">
        <label for="rf-from">From</label>
        <input id="rf-from" class="input" type="date" formControlName="from" />
      </div>
      <div class="field">
        <label for="rf-to">To</label>
        <input id="rf-to" class="input" type="date" formControlName="to" />
      </div>
      <div class="presets" role="group" aria-label="Date presets">
        <button type="button" class="btn btn-sm" (click)="preset(7)">Last 7 days</button>
        <button type="button" class="btn btn-sm" (click)="preset(30)">Last 30 days</button>
        <button type="button" class="btn btn-sm" (click)="preset(90)">Last 90 days</button>
      </div>
    </section>

    <ng-container *ngIf="state$ | async as s">
      <div class="panel" *ngIf="s.status !== 'ready'"><wms-state-view [status]="s.status" [error]="s.error" entity="reports" (retry)="reload$.next()"></wms-state-view></div>
      <section class="report-grid" *ngIf="s.data as groups">
        <article class="panel" *ngFor="let g of groups">
          <div class="cat-head">
            <span class="tone-icon tone-blue"><wms-icon [name]="icon(g.category)"></wms-icon></span>
            <div><h2>{{ label(g.category) }} reports</h2><p>{{ g.reports.length }} reports</p></div>
          </div>
          <div class="report-row" *ngFor="let r of g.reports">
            <div class="report-text">
              <strong>{{ r.name }}</strong>
              <small>{{ r.description }}</small>
              <small class="last">Last run: {{ r.lastRunAt ? (r.lastRunAt | relTime) : 'never' }}</small>
            </div>
            <button type="button" class="btn btn-sm btn-primary" (click)="run(r)">Run <wms-icon name="arrow-right"></wms-icon></button>
          </div>
        </article>
      </section>
    </ng-container>
  `,
  styles: [
    `
      .filters { display: flex; align-items: flex-end; gap: 16px; padding: 16px 20px; flex-wrap: wrap; }
      .filters .field { min-width: 180px; }
      .presets { display: flex; gap: 6px; margin-left: auto; flex-wrap: wrap; }
      .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      .report-grid .panel { margin-bottom: 0; }
      .cat-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--wms-divider); }
      .cat-head h2 { font-size: 15px; }
      .cat-head p { font-size: 11px; color: var(--wms-text-subtle); }
      .report-row { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--wms-divider); }
      .report-row:last-child { border-bottom: 0; }
      .report-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .report-text strong { font-size: 13px; font-weight: 600; }
      .report-text small { font-size: 12px; color: var(--wms-text-muted); }
      .report-text .last { font-size: 11px; color: var(--wms-text-faint); }
      @media (max-width: 900px) { .report-grid { grid-template-columns: 1fr; } .presets { margin-left: 0; } }
    `,
  ],
})
export class ReportsComponent {
  readonly reload$ = new Subject<void>();
  readonly filters = new FormGroup({
    warehouseId: new FormControl(this.context.activeId ?? '', { nonNullable: true }),
    from: new FormControl(this.daysAgo(30), { nonNullable: true }),
    to: new FormControl(this.daysAgo(0), { nonNullable: true }),
  });

  readonly state$ = this.reload$.pipe(
    startWith(null),
    switchMap(() =>
      loadResource(
        this.api.reports().pipe(
          map((defs) =>
            (['Inventory', 'Warehouse', 'Orders', 'Suppliers'] as const).map((category) => ({ category, reports: defs.filter((d) => d.category === category) })),
          ),
        ),
      ),
    ),
  );

  constructor(private readonly api: InsightsApi, private readonly dialogs: DialogService, readonly context: WarehouseContext) {}

  label(c: ReportDefinition['category']): string {
    return c === 'Orders' ? 'Order' : c === 'Suppliers' ? 'Supplier' : c;
  }

  icon(c: ReportDefinition['category']): string {
    return CATEGORY_ICONS[c];
  }

  preset(days: number): void {
    this.filters.patchValue({ from: this.daysAgo(days), to: this.daysAgo(0) });
  }

  run(def: ReportDefinition): void {
    const f = this.filters.getRawValue();
    const req: RunRequest = {
      def,
      filters: { warehouseId: f.warehouseId || null, from: f.from, to: f.to },
      warehouseLabel: this.context.name(f.warehouseId || null),
    };
    this.dialogs.open(ReportPreviewComponent, req).subscribe(() => this.reload$.next());
  }

  private daysAgo(n: number): string {
    const d = new Date(Date.now() - n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

/** Remote boundary: `wms-reports` — heavy, loaded rarely (docs/MICROFRONTEND.md §2). */
@NgModule({
  declarations: [ReportsComponent, ReportPreviewComponent],
  imports: [
    SharedModule,
    RouterModule.forChild([{ path: 'reports', component: ReportsComponent, canActivate: [PermissionGuard], data: { permission: 'reports:view' }, title: 'Reports · WMS360' }]),
  ],
})
export class ReportsModule {}
