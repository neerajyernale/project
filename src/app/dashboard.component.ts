import { Component } from '@angular/core';
import { KPIS, ACTIVITIES, TOP_PRODUCTS, ORDER_STATUS_DATA } from './data';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
})
export class Dashboard {
  currentDate = 'Monday, 24 June 2024';
  kpis = KPIS;
  activities = ACTIVITIES;
  products = TOP_PRODUCTS;
  orderStatusData = ORDER_STATUS_DATA;

  donutGradient(): string {
    let cumulative = 0;
    const segments = this.orderStatusData.map(item => {
      const start = cumulative;
      cumulative += item.value;
      return `${item.color} ${start}% ${cumulative}%`;
    });
    return `conic-gradient(${segments.join(', ')})`;
  }
}
