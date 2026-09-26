import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';

const COLLAPSE_KEY = 'wms360.sidebarCollapsed';

/** App frame: sidebar (rail on desktop, drawer on phones), top bar, routed page. */
@Component({
  selector: 'wms-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app-shell" [class.collapsed]="collapsed && !mobile" [class.mobile]="mobile" [class.drawer-open]="drawerOpen">
      <wms-sidebar
        [collapsed]="collapsed && !mobile"
        [mobile]="mobile"
        (toggleCollapse)="toggleCollapse()"
        (navigate)="drawerOpen = false"
        [attr.aria-hidden]="mobile && !drawerOpen ? 'true' : null"
      ></wms-sidebar>
      <div class="scrim" *ngIf="mobile && drawerOpen" (click)="drawerOpen = false" aria-hidden="true"></div>
      <div class="main-area">
        <wms-topbar [mobile]="mobile" (openMenu)="drawerOpen = true"></wms-topbar>
        <main id="main" class="page-content" tabindex="-1">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      .app-shell { min-height: 100vh; display: flex; }
      .main-area { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .page-content { padding: 28px 32px 40px; width: 100%; max-width: var(--wms-content-max); margin: 0 auto; outline: 0; }
      .scrim { position: fixed; inset: 0; background: var(--wms-overlay); z-index: 40; }
      .mobile .page-content { padding: 20px 16px 32px; }
    `,
  ],
})
export class ShellComponent implements OnInit, OnDestroy {
  collapsed = false;
  mobile = false;
  drawerOpen = false;
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly breakpoints: BreakpointObserver, private readonly router: Router, private readonly cdr: ChangeDetectorRef) {
    try {
      this.collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      this.collapsed = false;
    }
  }

  ngOnInit(): void {
    this.breakpoints
      .observe('(max-width: 900px)')
      .pipe(takeUntil(this.destroy$))
      .subscribe((s) => {
        this.mobile = s.matches;
        if (!s.matches) this.drawerOpen = false;
        this.cdr.markForCheck();
      });
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntil(this.destroy$)).subscribe(() => {
      this.drawerOpen = false;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    try {
      localStorage.setItem(COLLAPSE_KEY, this.collapsed ? '1' : '0');
    } catch {
      /* not persisted */
    }
  }

  @HostListener('document:keydown.escape')
  closeDrawer(): void {
    if (this.drawerOpen) {
      this.drawerOpen = false;
      this.cdr.markForCheck();
    }
  }
}
