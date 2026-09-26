# ADR-004 — Module Federation via @angular-architects/module-federation 14.3.14

**Status:** Proposed · **Date:** 2026-09-25

## Context
Angular 14.2 CLI builds with webpack 5.76.1, which includes Module Federation, but the CLI does not expose webpack config. Checked against the npm registry: `@angular-architects/module-federation@14.3.13` declares peer `rxjs ~6.6.3` (conflicts with our RxJS 7.5.7); `14.3.14` declares `rxjs >=6.6.3`, `@angular/core >=14.1.1`. `ngx-build-plus@14.0.0` declares `@angular-devkit/build-angular >=12`.

## Decision
- `@angular-architects/module-federation` and `-runtime` pinned **exactly** at `14.3.14`; builder `ngx-build-plus@14.0.0`.
- Remote URLs come from a **runtime manifest** (`loadManifest`) rendered per environment at container start; `loadRemoteModule({ type: 'manifest', … })`.
- Each remote exposes one NgModule (`./Module`).
- Explicit `share()` list with singletons and `strictVersion` for Angular (see MICROFRONTEND.md §4); no `shareAll()`.

## Alternatives considered
- *Native Federation / plugin v15+:* built for newer Angular; outside the lock.
- *iframes:* strong isolation, but broken routing, focus, overlays and a11y, and duplicated framework downloads.
- *Web Components (Angular Elements):* possible in 14, but the shell and every remote would each bootstrap its own Angular app with a separate injector and zone. Sharing a session then becomes much harder.
- *Build-time composition (one big app):* not independently deployable.

## Consequences
- The shared library API (`@wms/core`, `@wms/design-system`) becomes a versioned contract; breaking changes require a coordinated release.
- The install step must verify the peer tree (`npm ls`) in CI to catch accidental version drift.
