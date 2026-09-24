import { Component, Input, Output, EventEmitter } from '@angular/core';
import { PAGE_DATA, statusClass, priorityClass, RecordRow } from './data';

@Component({
  selector: 'app-module-table',
  templateUrl: './module-table.component.html',
})
export class ModuleTable {
  @Input() pageTitle = '';
  @Input() description = '';
  @Input() pageKey = '';
  @Input() showKpis = false;

  @Output() addClick = new EventEmitter<void>();
  @Output() viewClick = new EventEmitter<RecordRow>();

  searchQuery = '';

  headings(): string[] {
    return PAGE_DATA[this.pageKey]?.headings ?? [];
  }

  allRows(): RecordRow[] {
    return PAGE_DATA[this.pageKey]?.rows ?? [];
  }

  filteredRows(): RecordRow[] {
    if (!this.searchQuery) return this.allRows();
    const q = this.searchQuery.toLowerCase();
    return this.allRows().filter(row =>
      Object.values(row).some(v => v.toLowerCase().includes(q))
    );
  }

  filters(): string[] {
    const base: string[] = [];
    if (this.headings().includes('WAREHOUSE')) base.push('All warehouses');
    if (this.headings().includes('STATUS')) base.push('All status');
    if (this.headings().includes('PRIORITY')) base.push('All priorities');
    if (this.headings().includes('CATEGORY')) base.push('All categories');
    if (base.length === 0) base.push('Date range');
    return base;
  }

  moduleKpis(): { label: string; value: string; icon: string; tone: string }[] {
    const rows = this.allRows();
    const kpiMap: Record<string, { label: string; value: string; icon: string; tone: string }[]> = {
      Inbound: [
        { label: 'Expected today', value: '2', icon: '⇥', tone: 'blue' },
        { label: 'Receiving', value: '1', icon: '↗', tone: 'orange' },
        { label: 'Received today', value: '1', icon: '✓', tone: 'green' },
        { label: 'Total units', value: '8,840', icon: '◫', tone: 'navy' },
      ],
      Outbound: [
        { label: 'Processing', value: '1', icon: '↗', tone: 'orange' },
        { label: 'Picking', value: '2', icon: '⌖', tone: 'blue' },
        { label: 'Shipped today', value: '2', icon: '➤', tone: 'green' },
        { label: 'Critical priority', value: '1', icon: '!', tone: 'red' },
      ],
      Orders: [
        { label: 'Total orders', value: String(rows.length), icon: '≡', tone: 'blue' },
        { label: 'In progress', value: '2', icon: '↗', tone: 'orange' },
        { label: 'Shipped', value: '2', icon: '✓', tone: 'green' },
        { label: 'Critical', value: '1', icon: '!', tone: 'red' },
      ],
      Picking: [
        { label: 'Pending', value: '1', icon: '⌖', tone: 'orange' },
        { label: 'In progress', value: '2', icon: '↗', tone: 'blue' },
        { label: 'Completed', value: '2', icon: '✓', tone: 'green' },
        { label: 'Failed', value: '1', icon: '!', tone: 'red' },
      ],
      Packing: [
        { label: 'Awaiting', value: '1', icon: '▣', tone: 'orange' },
        { label: 'In progress', value: '1', icon: '↗', tone: 'blue' },
        { label: 'Completed', value: '3', icon: '✓', tone: 'green' },
        { label: 'Exceptions', value: '1', icon: '!', tone: 'red' },
      ],
      Shipping: [
        { label: 'Ready to ship', value: '1', icon: '➤', tone: 'orange' },
        { label: 'In transit', value: '2', icon: '↗', tone: 'blue' },
        { label: 'Delivered', value: '2', icon: '✓', tone: 'green' },
        { label: 'Delayed', value: '1', icon: '!', tone: 'red' },
      ],
      'Stock Transfers': [
        { label: 'Requested', value: '1', icon: '⇄', tone: 'orange' },
        { label: 'Approved', value: '1', icon: '↗', tone: 'blue' },
        { label: 'In transit', value: '1', icon: '➤', tone: 'sky' },
        { label: 'Completed', value: '1', icon: '✓', tone: 'green' },
      ],
    };
    return kpiMap[this.pageKey] ?? [];
  }

  addLabel(): string {
    const key = this.pageKey;
    if (key === 'Inventory') return 'Add stock item';
    if (key === 'Products') return 'Add product';
    if (key === 'Inbound') return 'New shipment';
    if (key === 'Orders') return 'New order';
    if (key === 'Picking') return 'Create pick task';
    if (key === 'Packing') return 'New package';
    if (key === 'Shipping') return 'New shipment';
    if (key === 'Stock Transfers') return 'New transfer';
    if (key === 'Suppliers') return 'Add supplier';
    if (key === 'Customers') return 'Add customer';
    return 'Add new';
  }

  isIdColumn(heading: string): boolean {
    return heading.includes('ID') || heading.includes('SKU') || heading.includes('TRACKING') || heading.includes('CODE');
  }

  onSearchInput(event: Event): void {
    this.searchQuery = (event.target as HTMLInputElement).value;
  }

  statusClass = statusClass;
  priorityClass = priorityClass;
  Math = Math;
}
