import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { App } from './main';
import { Login } from './app/login.component';
import { Dashboard } from './app/dashboard.component';
import { Warehouses } from './app/warehouses.component';
import { WarehouseDetail } from './app/warehouse-detail.component';
import { ModuleTable } from './app/module-table.component';
import { Reports } from './app/reports.component';
import { UsersRoles } from './app/users-roles.component';
import { Settings } from './app/settings.component';
import { Modal } from './app/modal.component';

@NgModule({
  declarations: [
    App,
    Login,
    Dashboard,
    Warehouses,
    WarehouseDetail,
    ModuleTable,
    Reports,
    UsersRoles,
    Settings,
    Modal,
  ],
  imports: [BrowserModule, FormsModule],
  bootstrap: [App],
})
export class AppModule {}

platformBrowserDynamic().bootstrapModule(AppModule);
