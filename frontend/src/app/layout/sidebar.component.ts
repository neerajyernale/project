import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, merge } from 'rxjs';
import { filter, map, startWith, switchMap, takeUntil } from 'rxjs/operators';

import { FulfillmentApi } from '@core/api/domain-apis';
import { AuthSession } from '@core/auth/auth-session.service';
import { AppConfigService } from '@core/config/app-config.service';
import { WarehouseContext, WarehouseOption } from '@core/context/warehouse-context.service';
import { DialogService } from '@shared/ui/dialogs';
import { MANAGE_NAV, NavItem, WORKSPACE_NAV } from './nav';

@Component({
  selector: 'wms-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css'],
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() collapsed = false;
  @Input() mobile = false;
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() navigate = new EventEmitter<void>();

  workspace: NavItem[] = [];
  manage: NavItem[] = [];
  openOrders = 0;
  switcherOpen = false;
  readonly usesMockApi: boolean;
  private readonly destroy$ = new Subject<void>();

  constructor(
    readonly context: WarehouseContext,
    private readonly session: AuthSession,
    private readonly fulfillment: FulfillmentApi,
    private readonly router: Router,
    private readonly dialogs: DialogService,
    private readonly cdr: ChangeDetectorRef,
    config: AppConfigService,
  ) {
    this.usesMockApi = config.value.useMockApi;
  }

  ngOnInit(): void {
    this.session.user$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.workspace = WORKSPACE_NAV.filter((i) => this.session.can(i.permission));
      this.manage = MANAGE_NAV.filter((i) => this.session.can(i.permission));
      this.cdr.markForCheck();
    });

    // Orders badge: orders waiting for allocation, refreshed on navigation and warehouse change.
    if (this.session.can('orders:view')) {
      merge(this.router.events.pipe(filter((e) => e instanceof NavigationEnd)), this.context.activeId$)
        .pipe(
          startWith(null),
          switchMap(() => this.fulfillment.orders({ status: 'CREATED', size: 1 }).pipe(map((p) => p.totalElements))),
          takeUntil(this.destroy$),
        )
        .subscribe({
          next: (n) => {
            this.openOrders = n;
            this.cdr.markForCheck();
          },
          error: () => undefined,
        });
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByLink = (_: number, item: NavItem) => item.link;
  trackById = (_: number, w: WarehouseOption) => w.id;

  choose(id: string | null): void {
    this.context.set(id);
    this.switcherOpen = false;
  }

  resetDemo(): void {
    this.dialogs
      .confirm({
        title: 'Reset demo data?',
        message: 'All changes you made in this browser (orders, stock moves, users, settings) are discarded and the original sample data is restored. You will be signed out.',
        confirmLabel: 'Reset data',
        tone: 'danger',
      })
      .subscribe(async (r) => {
        if (!r) return;
        const { resetBrowserData } = await import('../mock-api/mock-api');
        resetBrowserData();
        window.location.assign('/login');
      });
  }
}
