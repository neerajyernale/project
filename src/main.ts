import { Component, HostListener } from '@angular/core';
import { PRIMARY_NAV, MANAGE_NAV, PAGE_DESCRIPTIONS, NOTIFICATIONS_LIST, PageKey, NavItem } from './app/data';

@Component({
  selector: 'app-root',
  templateUrl: './app-shell.component.html',
})
export class App {
  loggedIn = true;
  sidebarCollapsed = false;
  profileOpen = false;
  notificationsOpen = false;
  activePage: PageKey = 'Dashboard';
  detailWarehouseCode: string | null = null;

  primaryNav: NavItem[] = PRIMARY_NAV;
  manageNav: NavItem[] = MANAGE_NAV;
  notifications = NOTIFICATIONS_LIST;

  constructor() {
    window.addEventListener('login-success', () => { this.loggedIn = true; });
    window.addEventListener('warehouse-view', ((e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      this.detailWarehouseCode = detail;
      const wd = document.querySelector('app-warehouse-detail');
      if (wd) {
        (wd as any).setWarehouseCode?.(detail);
      }
    }) as EventListener);
    window.addEventListener('warehouse-back', () => {
      this.detailWarehouseCode = null;
    });
  }

  navigate(page: PageKey): void {
    this.activePage = page;
    this.profileOpen = false;
    this.notificationsOpen = false;
    if (page !== 'Warehouses') {
      this.detailWarehouseCode = null;
    }
  }

  getDescription(): string {
    return PAGE_DESCRIPTIONS[this.activePage];
  }

  showModuleKpis(): boolean {
    const kpiPages: PageKey[] = ['Inbound', 'Outbound', 'Orders', 'Picking', 'Packing', 'Shipping', 'Stock Transfers'];
    return kpiPages.includes(this.activePage);
  }

  logout(): void {
    this.loggedIn = false;
    this.profileOpen = false;
    this.activePage = 'Dashboard';
  }

  toggleSidebar(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleProfile(): void {
    this.profileOpen = !this.profileOpen;
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
  }

  closeNotifications(): void {
    this.notificationsOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.profileOpen = false;
    this.notificationsOpen = false;
  }
}
