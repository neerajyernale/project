# ADR-001 — Angular 14 and Node 16 frontend toolchain

**Status:** Accepted (business constraint) · **Date:** 2026-09-25

## Context
The product owner has fixed the frontend to Angular 14 with Node 16. Installed and verified: Angular 14.3.0, CLI 14.2.13, webpack 5.76.1, TypeScript 4.7.4, RxJS 7.5.7, zone.js 0.12.0, Node 16.20.2. Both Angular 14 (LTS ended Nov 2023) and Node 16 (EOL Sept 2023) no longer receive security fixes.

## Decision
- Stay on Angular **14.3.x**; do not use APIs introduced after 14: no signals, no `@if`/`@for` control flow, no `provideHttpClient` or functional interceptors (15), no `CanActivateFn`-style functional guards (15.2), no `DestroyRef`/`takeUntilDestroyed` (16). Class-based guards/interceptors and `inject()` inside constructors or field initialisers (available in 14) are fine.
- NgModule-based architecture. Standalone components (developer preview in 14) are not used for public contracts.
- TypeScript 4.7–4.8, `strict` and `strictTemplates` on for all new code.
- Every third-party package is chosen for its Angular 14 generation and pinned (for example `@angular/cdk ~14.2`, `@angular-eslint 14.x`, `jest-preset-angular 12.x`).
- Node 16.20.2 is pinned via `.nvmrc` and `engines`, used only in CI build jobs and the Docker build stage.

## Alternatives considered
- *Upgrade to a supported Angular:* rejected by constraint. The EOL risk is recorded here so it can be revisited.

## Consequences
- Production runtime has no Node process (nginx serves static assets), which limits Node 16 exposure to the build pipeline.
- Framework CVEs will not be patched upstream. Mitigations: strict CSP, no `bypassSecurityTrust*` or raw `innerHTML` with server data, `npm audit` gate in CI, minimal dependencies.
- Tools that require newer Node (Playwright) run in separate CI jobs against the built artefacts.
