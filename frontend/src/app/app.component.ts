import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter, pairwise } from 'rxjs/operators';

import { AuthSession, WarehouseContext } from '@wms/core';

@Component({
  selector: 'wms-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main">Skip to content</a>
    <router-outlet></router-outlet>
    <wms-toast-host></wms-toast-host>
  `,
  styles: [
    `
      .skip-link { position: absolute; left: -9999px; top: 8px; z-index: 2000; background: var(--wms-primary); color: #fff; padding: 8px 12px; border-radius: 6px; }
      .skip-link:focus { left: 8px; }
    `,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  private sub?: Subscription;

  constructor(private readonly session: AuthSession, private readonly context: WarehouseContext, private readonly router: Router) {}

  ngOnInit(): void {
    // When the session ends anywhere (sign-out, expired refresh), leave the app.
    this.sub = this.session.user$
      .pipe(
        pairwise(),
        filter(([before, after]) => !!before && !after),
      )
      .subscribe(() => {
        this.context.clear();
        if (this.router.url.startsWith('/login')) return;
        const expired = this.session.endReason === 'expired';
        void this.router.navigate(['/login'], { queryParams: expired ? { returnUrl: this.router.url } : {} });
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
