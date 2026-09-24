import { Component } from '@angular/core';
import { REPORT_CATEGORIES } from './data';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
})
export class Reports {
  reportCategories = REPORT_CATEGORIES;
}
