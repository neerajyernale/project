import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  CanActivateChild,
  CanLoad,
  Route,
  Router,
  RouterStateSnapshot,
  UrlSegment,
  UrlTree,
} from '@angular/router';

import { AuthSession } from './auth-session.service';

/** Signed-in users only; others go to /login with a return URL. */
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate, CanActivateChild, CanLoad {
  constructor(private readonly session: AuthSession, private readonly router: Router) {}

  canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    return this.check(state.url);
  }

  canActivateChild(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    return this.check(state.url);
  }

  canLoad(_route: Route, segments: UrlSegment[]): boolean | UrlTree {
    return this.check('/' + segments.map((s) => s.path).join('/'));
  }

  private check(url: string): boolean | UrlTree {
    if (this.session.isAuthenticated) return true;
    return this.router.createUrlTree(['/login'], { queryParams: url && url !== '/' ? { returnUrl: url } : {} });
  }
}

/**
 * Route `data.permission` (string or any-of array) must be granted, else /forbidden.
 * The server enforces the same permission; this only avoids showing a page that would 403.
 */
@Injectable({ providedIn: 'root' })
export class PermissionGuard implements CanActivate {
  constructor(private readonly session: AuthSession, private readonly router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean | UrlTree {
    const required = route.data['permission'] as string | string[] | undefined;
    if (!required || this.session.can(required)) return true;
    return this.router.createUrlTree(['/forbidden']);
  }
}

/** Keeps signed-in users off /login. */
@Injectable({ providedIn: 'root' })
export class GuestGuard implements CanActivate {
  constructor(private readonly session: AuthSession, private readonly router: Router) {}

  canActivate(): boolean | UrlTree {
    return this.session.isAuthenticated ? this.router.createUrlTree(['/']) : true;
  }
}
