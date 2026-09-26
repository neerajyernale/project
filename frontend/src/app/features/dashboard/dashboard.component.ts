import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Subject, combineLatest, merge } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { ActivityEntry, AuthSession, DashboardSummary, InsightsApi, loadResource, Tone, WarehouseContext } from '@wms/core';
import { BarListRow, ChartSeries, humanize } from '@wms/design-system';

interface KpiTile {
  label: string;
  value: string;
  hint: string;
  icon: string;
  tone: string;
  link: string;
  queryParams?: Record<string, string>;
  permission: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ACTIVITY_ICON: Record<ActivityEntry['kind'], string> = {
  order: 'orders',
  pick: 'picking',
  pack: 'packing',
  ship: 'shipping',
  inbound: 'inbound',
  inventory: 'inventory',
  transfer: 'transfer',
  warehouse: 'warehouse',
  catalog: 'product',
  admin: 'users',
};

@Component({
  selector: 'wms-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent {
  private readonly refresh$ = new Subject<void>();
  readonly today = new Date().toISOString();

  readonly stockSeries: ChartSeries[] = [
    { key: 'available', label: 'Available', color: 'var(--wms-series-1)' },
    { key: 'reserved', label: 'Reserved', color: 'var(--wms-series-2)' },
    { key: 'damaged', label: 'Damaged', color: 'var(--wms-series-3)' },
    { key: 'inTransit', label: 'Inbound transfer', color: 'var(--wms-series-4)' },
  ];
  readonly orderSeries: ChartSeries[] = [
    { key: 'received', label: 'Orders received', color: 'var(--wms-series-1)' },
    { key: 'shipped', label: 'Orders shipped', color: 'var(--wms-series-2)' },
  ];

  // activeId$ replays the current warehouse on subscribe, so it doubles as the initial load.
  readonly state$ = merge(this.context.activeId$, this.refresh$).pipe(switchMap(() => loadResource(this.insights.dashboard())));

  readonly view$ = combineLatest([this.state$, this.context.active$]).pipe(
    map(([state, active]) => ({ state, active, vm: state.data ? this.toViewModel(state.data) : null })),
  );

  constructor(private readonly insights: InsightsApi, readonly context: WarehouseContext, private readonly session: AuthSession) {}

  refresh(): void {
    this.refresh$.next();
  }

  can(p: string): boolean {
    return this.session.can(p);
  }

  activityIcon(a: ActivityEntry): string {
    return ACTIVITY_ICON[a.kind] ?? 'activity';
  }

  toneClass(t: Tone): string {
    return { success: 'tone-green', warning: 'tone-orange', danger: 'tone-red', info: 'tone-blue', neutral: 'tone-navy' }[t];
  }

  trackById = (_: number, x: { id: string }) => x.id;
  trackByLabel = (_: number, x: { label: string }) => x.label;

  private toViewModel(s: DashboardSummary) {
    const n = (v: number) => v.toLocaleString('en-US');
    const whCount = s.stockByWarehouse.length;
    const kpis: KpiTile[] = [
      { label: 'Units on hand', value: n(s.kpis.onHand), hint: whCount === 1 ? 'in this warehouse' : `across ${whCount} warehouses`, icon: 'inventory', tone: 'tone-blue', link: '/inventory', permission: 'inventory:view' },
      { label: "Today's orders", value: n(s.kpis.ordersToday), hint: 'received since midnight', icon: 'orders', tone: 'tone-sky', link: '/orders', permission: 'orders:view' },
      { label: 'Open pick tasks', value: n(s.kpis.pendingPicking), hint: 'pending or in progress', icon: 'picking', tone: 'tone-orange', link: '/picking', queryParams: { status: 'PENDING,ASSIGNED,IN_PROGRESS' }, permission: 'picking:view' },
      { label: 'Ready to ship', value: n(s.kpis.readyToShip), hint: 'packed, awaiting carrier', icon: 'shipping', tone: 'tone-green', link: '/shipping', permission: 'shipping:view' },
      { label: 'Low-stock items', value: n(s.kpis.lowStockItems), hint: 'at or below reorder level', icon: 'alert', tone: 'tone-red', link: '/inventory', queryParams: { stockStatus: 'LOW_STOCK,OUT_OF_STOCK' }, permission: 'inventory:view' },
      { label: 'Capacity used', value: `${s.kpis.capacityPct}%`, hint: 'of bin capacity', icon: 'grid', tone: 'tone-navy', link: '/warehouses', permission: 'warehouses:view' },
    ];
    const orderStatus: BarListRow[] = s.orderStatus.map((x) => ({ label: humanize(x.status), value: x.count }));
    return {
      summary: s,
      kpis,
      stockCategories: s.stockByWarehouse.map((w) => w.name),
      stockData: s.stockByWarehouse.map((w) => [w.available, w.reserved, w.damaged, w.inTransit]),
      dayLabels: s.ordersByDay.map((d) => WEEKDAYS[new Date(d.date).getDay()]),
      orderData: [s.ordersByDay.map((d) => d.received), s.ordersByDay.map((d) => d.shipped)],
      receivedTotal: s.ordersByDay.reduce((a, d) => a + d.received, 0),
      shippedTotal: s.ordersByDay.reduce((a, d) => a + d.shipped, 0),
      orderStatus,
      orderTotal: s.orderStatus.reduce((a, x) => a + x.count, 0),
      freeUnits: s.capacity.capacityUnits - s.capacity.usedUnits,
    };
  }
}
