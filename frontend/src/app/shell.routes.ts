import { Routes, UrlMatcher, UrlSegment } from '@angular/router';

import { AuthGuard, GuestGuard } from '@wms/core';
import { LoginComponent } from './features/auth/login.component';
import { ShellComponent } from './layout/shell.component';
import { ForbiddenComponent, NotFoundComponent, UnavailableComponent } from './layout/status-pages.component';

/**
 * Matches when the first URL segment is one of `roots`, consuming nothing, so the domain
 * module sees the full path. One domain = one federated remote (docs/MICROFRONTEND.md §2),
 * while URLs stay flat like the prototype's navigation.
 */
export function domain(...roots: string[]): UrlMatcher {
  return (segments: UrlSegment[]) => (segments.length && roots.includes(segments[0].path) ? { consumed: [] } : null);
}

/** The routes the shell owns, around the domain routes it is given. */
export function shellRoutes(domainRoutes: Routes, home = 'dashboard'): Routes {
  return [
    { path: 'login', component: LoginComponent, canActivate: [GuestGuard], title: 'Sign in · WMS360' },
    {
      path: '',
      component: ShellComponent,
      canActivate: [AuthGuard],
      canActivateChild: [AuthGuard],
      children: [
        { path: '', pathMatch: 'full', redirectTo: home },
        ...domainRoutes,
        { path: 'forbidden', component: ForbiddenComponent, title: 'No access · WMS360' },
        { path: 'unavailable', component: UnavailableComponent, title: 'Unavailable · WMS360' },
        { path: '**', component: NotFoundComponent, title: 'Not found · WMS360' },
      ],
    },
  ];
}

export const ROUTER_OPTIONS = { scrollPositionRestoration: 'top', paramsInheritanceStrategy: 'always' } as const;
