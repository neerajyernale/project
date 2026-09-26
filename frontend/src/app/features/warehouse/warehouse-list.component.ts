import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';

import { WarehouseApi } from '@core/api/domain-apis';
import { errorMessage } from '@core/api/api-error';
import { AuthSession } from '@core/auth/auth-session.service';
import { WarehouseContext } from '@core/context/warehouse-context.service';
import { Warehouse } from '@core/models';
import { ToastService } from '@core/notify/toast.service';
import { ListController } from '@core/state/list-controller';
import { DialogService } from '@shared/ui/dialogs';
import { downloadCsv } from '@shared/csv';
import { WarehouseFormDialogComponent } from './warehouse-dialogs';

@Component({
  selector: 'wms-warehouse-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './warehouse-list.component.html',
})
export class WarehouseListComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  readonly list = new ListController<Warehouse>((p) => this.api.list(p), {
    sort: 'code,asc',
    route: { router: this.router, route: this.route },
    destroy$: this.destroy$,
  });

  /** KPI strip over all warehouses the user may see (unaffected by table filters). */
  readonly summary$ = this.api.list({ size: 200 }).pipe(
    map((p) => {
      const all = p.content;
      const active = all.filter((w) => w.status === 'ACTIVE');
      const util = all.length ? Math.round(all.reduce((a, w) => a + w.utilization, 0) / all.length) : 0;
      return { total: all.length, active: active.length, util, hot: all.filter((w) => w.utilization >= 80).length, cities: Array.from(new Set(all.map((w) => w.city))).sort() };
    }),
  );

  constructor(
    private readonly api: WarehouseApi,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly dialogs: DialogService,
    private readonly toasts: ToastService,
    private readonly context: WarehouseContext,
    readonly session: AuthSession,
  ) {}

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('new') && this.session.can('warehouses:create')) this.create();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  create(): void {
    this.dialogs.open<Warehouse>(WarehouseFormDialogComponent, {}).subscribe((w) => {
      if (!w) return;
      this.list.reload();
      this.context.load();
      void this.router.navigate(['/warehouses', w.id]);
    });
  }

  edit(w: Warehouse): void {
    this.dialogs.open<Warehouse>(WarehouseFormDialogComponent, { warehouse: w }).subscribe((r) => {
      if (r) {
        this.list.reload();
        this.context.load();
      }
    });
  }

  exportCsv(rows: Warehouse[]): void {
    try {
      const header = ['Code', 'Name', 'City', 'Manager', 'Floor area m2', 'Zones', 'Bins', 'Utilization %', 'Status'];
      const lines = rows.map((w) => [w.code, w.name, w.city, w.manager, w.capacityM2, w.zoneCount, w.binCount, w.utilization, w.status]);
      downloadCsv('warehouses.csv', [header, ...lines]);
    } catch (e) {
      this.toasts.error('Export failed', errorMessage(e));
    }
  }

  trackById = (_: number, w: Warehouse) => w.id;
}
