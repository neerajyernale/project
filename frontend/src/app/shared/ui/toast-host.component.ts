import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Toast, ToastService } from '@wms/core';

@Component({
  selector: 'wms-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      <div class="toast" *ngFor="let t of toasts.toasts$ | async; trackBy: trackById" [ngClass]="'toast-' + t.tone" role="status">
        <wms-icon [name]="icon(t)" [size]="18"></wms-icon>
        <div class="toast-body">
          <strong>{{ t.title }}</strong>
          <small *ngIf="t.detail">{{ t.detail }}</small>
        </div>
        <button *ngIf="t.action" type="button" class="link-btn" (click)="t.action.run(); toasts.dismiss(t.id)">{{ t.action.label }}</button>
        <button type="button" class="icon-close" (click)="toasts.dismiss(t.id)" aria-label="Dismiss"><wms-icon name="x"></wms-icon></button>
      </div>
    </div>
  `,
  styles: [
    `
      .toast-stack { position: fixed; right: 20px; bottom: 20px; z-index: 1100; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); }
      .toast { display: flex; align-items: flex-start; gap: 10px; background: var(--wms-surface); border: 1px solid var(--wms-border); border-left-width: 4px; border-radius: var(--wms-radius-lg); box-shadow: var(--wms-shadow-pop); padding: 12px 12px 12px 14px; animation: wms-rise .2s ease; }
      .toast-success { border-left-color: var(--wms-success); color: var(--wms-success); }
      .toast-danger { border-left-color: var(--wms-danger); color: var(--wms-danger); }
      .toast-warning { border-left-color: var(--wms-warning-fill); color: var(--wms-warning); }
      .toast-info, .toast-neutral { border-left-color: var(--wms-primary); color: var(--wms-primary); }
      .toast-body { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; color: var(--wms-text); }
      .toast-body strong { font-size: 13px; }
      .toast-body small { font-size: 12px; color: var(--wms-text-muted); }
    `,
  ],
})
export class ToastHostComponent {
  constructor(readonly toasts: ToastService) {}

  trackById = (_: number, t: Toast) => t.id;

  icon(t: Toast): string {
    return t.tone === 'success' ? 'check-circle' : t.tone === 'danger' ? 'alert-circle' : t.tone === 'warning' ? 'alert' : 'info';
  }
}
