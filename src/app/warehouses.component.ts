import { Component } from '@angular/core';
import { WAREHOUSES, statusClass } from './data';

@Component({
  selector: 'app-warehouses',
  templateUrl: './warehouses.component.html',
})
export class Warehouses {
  warehouses = WAREHOUSES;
  searchQuery = '';
  showAddModal = false;

  activeCount(): number {
    return this.warehouses.filter(w => w.status === 'ACTIVE').length;
  }

  atCapacityCount(): number {
    return this.warehouses.filter(w => w.utilization >= 80).length;
  }

  avgUtilization(): number {
    const total = this.warehouses.reduce((sum, w) => sum + w.utilization, 0);
    return Math.round(total / this.warehouses.length);
  }

  filteredWarehouses() {
    if (!this.searchQuery) return this.warehouses;
    const q = this.searchQuery.toLowerCase();
    return this.warehouses.filter(w =>
      w.name.toLowerCase().includes(q) ||
      w.code.toLowerCase().includes(q) ||
      w.city.toLowerCase().includes(q) ||
      w.manager.toLowerCase().includes(q)
    );
  }

  viewWarehouse(code: string): void {
    window.dispatchEvent(new CustomEvent('warehouse-view', { detail: code }));
  }

  onSearchInput(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
  }

  utilBarClass(util: number): string {
    if (util >= 85) return 'bar-danger';
    if (util >= 70) return 'bar-warning';
    return 'bar-ok';
  }

  statusClass = statusClass;
}
