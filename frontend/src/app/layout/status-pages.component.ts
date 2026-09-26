import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'wms-forbidden',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel status-page">
      <div class="state-view">
        <wms-icon class="state-icon" name="lock" [size]="40" [stroke]="1.3"></wms-icon>
        <strong>You don't have access to this page</strong>
        <small>Your role doesn't include it. Ask an administrator if you need it for your work.</small>
        <a class="btn btn-sm" routerLink="/dashboard">Go to dashboard</a>
      </div>
    </div>
  `,
  styles: ['.status-page { margin-top: 40px; } .status-page .btn { margin-top: 12px; }'],
})
export class ForbiddenComponent {}

@Component({
  selector: 'wms-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel status-page">
      <div class="state-view">
        <wms-icon class="state-icon" name="search" [size]="40" [stroke]="1.3"></wms-icon>
        <strong>Page not found</strong>
        <small>The link may be out of date, or the record was removed.</small>
        <a class="btn btn-sm" routerLink="/dashboard">Go to dashboard</a>
      </div>
    </div>
  `,
  styles: ['.status-page { margin-top: 40px; } .status-page .btn { margin-top: 12px; }'],
})
export class NotFoundComponent {}

@Component({
  selector: 'wms-unavailable',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel status-page">
      <div class="state-view" role="alert">
        <wms-icon class="state-icon" name="alert-circle" [size]="40" [stroke]="1.3"></wms-icon>
        <strong>This part of WMS360 couldn't load</strong>
        <small>The rest of the app still works. This is usually a network hiccup or a new version being deployed.</small>
        <button type="button" class="btn btn-sm" (click)="retry()"><wms-icon name="refresh"></wms-icon>Reload</button>
      </div>
    </div>
  `,
  styles: ['.status-page { margin-top: 40px; } .status-page .btn { margin-top: 12px; }'],
})
export class UnavailableComponent {
  retry(): void {
    window.history.back();
    setTimeout(() => window.location.reload(), 50);
  }
}
