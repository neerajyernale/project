import { Component } from '@angular/core';
import { WAREHOUSES, Warehouse, statusClass } from './data';

@Component({
  selector: 'app-warehouse-detail',
  templateUrl: './warehouse-detail.component.html',
})
export class WarehouseDetail {
  activeTab = 'Overview';
  tabs = ['Overview', 'Inventory', 'Zones', 'Bins', 'Orders', 'Activity', 'Performance'];
  warehouseCode = 'WH-MUM-001';

  binsData = [
    { code: 'STR-B-001', zone: 'Storage', capacity: '100', occupied: '82', items: '4', status: 'OCCUPIED' },
    { code: 'STR-B-002', zone: 'Storage', capacity: '100', occupied: '45', items: '2', status: 'PARTIAL' },
    { code: 'PCK-C-014', zone: 'Picking', capacity: '50', occupied: '50', items: '6', status: 'FULL' },
    { code: 'PCK-C-015', zone: 'Picking', capacity: '50', occupied: '0', items: '0', status: 'EMPTY' },
    { code: 'RCV-A-008', zone: 'Receiving', capacity: '80', occupied: '62', items: '3', status: 'PARTIAL' },
    { code: 'PKG-D-003', zone: 'Packing', capacity: '40', occupied: '28', items: '5', status: 'PARTIAL' },
  ];

  invData = [
    { sku: 'SKU-10001', product: 'Wireless Keyboard', zone: 'Storage B', bin: 'STR-B-001', quantity: '2,450', status: 'IN STOCK' },
    { sku: 'SKU-10045', product: 'WirelessBarcode Scanner', zone: 'Storage B', bin: 'STR-B-002', quantity: '2,450', status: 'IN STOCK' },
    { sku: 'SKU-10078', product: 'Thermal Label Roll 4×6', zone: 'Picking C', bin: 'PCK-C-014', quantity: '184', status: 'LOW STOCK' },
    { sku: 'SKU-10112', product: 'Heavy Duty Storage Bin', zone: 'Storage B', bin: 'STR-B-003', quantity: '1,820', status: 'IN STOCK' },
  ];

  ordData = [
    { id: 'ORD-10482', customer: 'Reliance Retail Ltd', items: '12', priority: 'HIGH', date: '24 Jun 2024', status: 'PICKING' },
    { id: 'ORD-10481', customer: 'Flipkart Wholesale', items: '8', priority: 'NORMAL', date: '24 Jun 2024', status: 'PROCESSING' },
    { id: 'ORD-10470', customer: 'Croma Retail', items: '6', priority: 'NORMAL', date: '24 Jun 2024', status: 'PACKED' },
    { id: 'ORD-10462', customer: 'Croma Retail', items: '26', priority: 'CRITICAL', date: '23 Jun 2024', status: 'DELAYED' },
  ];

  get warehouse(): Warehouse | undefined {
    return WAREHOUSES.find(w => w.code === this.warehouseCode);
  }

  zoneBarClass(util: number): string {
    if (util >= 85) return 'bar-danger';
    if (util >= 70) return 'bar-warning';
    return 'bar-ok';
  }

  priorityClass(priority: string): string {
    if (priority === 'CRITICAL') return 'danger';
    if (priority === 'HIGH') return 'warning';
    return 'info';
  }

  goBack(): void {
    window.dispatchEvent(new CustomEvent('warehouse-back'));
  }

  setWarehouseCode(code: string): void {
    this.warehouseCode = code;
  }

  statusClass = statusClass;
}
