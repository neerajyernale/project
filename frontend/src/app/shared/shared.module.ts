import { DialogModule } from '@angular/cdk/dialog';
import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { BarListComponent, LineChartComponent, StackedColumnsComponent } from './charts/charts';
import { AutofocusDirective, CanDirective, ClickOutsideDirective } from './directives';
import { IconComponent } from './icon/icon.component';
import { CompactNumberPipe, HumanizePipe, InitialsPipe, PluckPipe, RelativeTimePipe, WmsDatePipe } from './pipes';
import { StatusBadgeComponent } from './status/status-badge.component';
import { ConfirmDialogComponent } from './ui/dialogs';
import { FieldErrorComponent } from './ui/field-error.component';
import { LineItemsComponent } from './ui/line-items.component';
import { MeterComponent } from './ui/meter.component';
import { PaginatorComponent } from './ui/paginator.component';
import { StateViewComponent } from './ui/state-view.component';
import { ToastHostComponent } from './ui/toast-host.component';

const DECLARATIONS = [
  IconComponent,
  StatusBadgeComponent,
  StateViewComponent,
  PaginatorComponent,
  MeterComponent,
  FieldErrorComponent,
  ConfirmDialogComponent,
  ToastHostComponent,
  LineItemsComponent,
  StackedColumnsComponent,
  LineChartComponent,
  BarListComponent,
  CanDirective,
  ClickOutsideDirective,
  AutofocusDirective,
  WmsDatePipe,
  RelativeTimePipe,
  HumanizePipe,
  InitialsPipe,
  CompactNumberPipe,
  PluckPipe,
];

/** The design system (`@wms/design-system` once split into a library). */
@NgModule({
  declarations: DECLARATIONS,
  imports: [CommonModule, ReactiveFormsModule, RouterModule, DialogModule],
  exports: [...DECLARATIONS, CommonModule, FormsModule, ReactiveFormsModule, RouterModule, DialogModule],
})
export class SharedModule {}
