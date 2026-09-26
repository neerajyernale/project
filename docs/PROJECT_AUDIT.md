# WMS360 — Project Audit

| | |
|---|---|
| Audit ID | WMS-100 |
| Date | 2026-09-25 |
| Repository | `https://github.com/neerajyernale/project` (branch `main`, commit `ed583e3`) |
| Companion docs | [PROTOTYPE_AUDIT.md](PROTOTYPE_AUDIT.md) (file-level detail) · [ARCHITECTURE.md](ARCHITECTURE.md) · [MICROFRONTEND.md](MICROFRONTEND.md) · [MIGRATION_PLAN.md](MIGRATION_PLAN.md) · [ADR/](ADR/README.md) |

Every version below was read from the installed toolchain or `node_modules`, not from `package.json` ranges. Anything not yet verified is marked **(verify)**.

---

## 1. Repository structure

```
/                         32 tracked files
├── .bolt/config.json     Bolt generator metadata
├── angular.json          single project "demo"
├── netlify.toml          static deploy config (wrong publish path)
├── package.json          Angular 14 deps only; scripts: start, build
├── tsconfig*.json        strict: false
└── src/
    ├── index.html, main.ts, app.module.ts, app-shell.component.html
    ├── global_styles.css (≈49 KB)
    └── app/  9 components + data.ts (≈35 KB of constants)
```

There is no backend, database, infrastructure, test, CI or documentation directory.

## 2. Angular version

**14.3.0** (framework), CLI / build-angular **14.2.13**, webpack **5.76.1** (bundled by build-angular). Angular is locked at 14 (ADR-001).

## 3. Node version

**16.20.2**, npm 8.19.4. Node is locked at 16 for the Angular toolchain (ADR-001). Node only runs at build time; the production frontend image is nginx serving static files, so **Node 16 never runs in production**.

## 4. TypeScript version

**4.7.4.** Angular 14.2+ supports `>=4.6.2 <4.9`. Staying on 4.7 is fine; moving to 4.8 is optional and low-risk.

## 5. Current frontend architecture

A single eagerly loaded `NgModule` with 9 components, no router, no services, no HttpClient, no forms module usage beyond `FormsModule` import, and inter-component messaging over `window` CustomEvents. All data comes from `src/app/data.ts`. Details: PROTOTYPE_AUDIT §2–§5.

## 6. Current backend architecture

**None exists.**

## 7. Java version

JDK **21** and JDK **24** are both installed; `java` on PATH resolves to 24. **Target: Java 21 (LTS).** Java 24 is a non-LTS release that is already out of support, so it must not be the build or runtime target. The Maven toolchain will pin 21, and the container runtime will be a Java 21 JRE image (ADR-002).

## 8. Spring Boot version

None today. **Target: Spring Boot 3.5.x on Java 21** (ADR-002). This was checked against Maven Central on 2026-09-25:

| Line | Latest published | Status |
|---|---|---|
| 3.4 | 3.4.13 | No longer receiving releases |
| **3.5** | **3.5.16** | Still receiving patch releases; mature ecosystem (Hibernate 6.6, Flyway, springdoc 2.x, Testcontainers) |
| 4.0 | 4.0.8 | Newer major (Spring Framework 7, Jackson 3, modular starters) |
| 4.1 | 4.1.1 | Newest; excluded by the "no blind newest" rule |

**Sprint 0 gate (verify):** confirm the OSS support end date for 3.5 on spring.io. If it ends before the first production release, move to 4.0.x before any domain code is written. Moving later is a larger migration.

Maven is **not installed**. The backend will use the **Maven Wrapper** (`mvnw`), so no global install is needed.

## 9. Database configuration

None today. **Target: PostgreSQL 16** in Docker for dev, CI (Testcontainers) and production parity (ADR-005). The locally installed PostgreSQL 18 is not used by the project, to avoid version drift. Migrations use Flyway (Boot-managed version), and Hibernate schema generation is set to `validate`.

## 10. Existing APIs

**None.** The target API surface is `/api/v1/**` documented by OpenAPI (springdoc 2.x) — see ARCHITECTURE §6.

## 11. Existing prototype functionality

| Works | Cosmetic only (does nothing) |
|---|---|
| Sidebar navigation and collapse | Login (bypassed; any password) |
| Text search on static tables | Filters, pagination, export, "Add", "Edit", "View" on module pages |
| Warehouse detail tabs | Warehouse detail for anything except Mumbai (**bug**, PROTOTYPE_AUDIT §14) |
| Notifications / profile popovers | Dashboard refresh, date range, warehouse selector |
| Settings toggles (in memory) | Settings save, report run/preview, role permission editing |

## 12. Reusable code

**Keep:** navigation taxonomy, page copy, colour palette, table density, warehouse-detail information architecture, and seed data (converted into a dev-only Flyway seed). **Refactor:** login UX, page header, badges, empty states. **Nothing in the TypeScript layer is reusable as-is.** Full classification: PROTOTYPE_AUDIT §12–§14 and the summary table in §18.

## 13. Technical debt

| ID | Debt | Fix in |
|---|---|---|
| TD-1 | No router; `ngSwitch` navigation | Sprint 2 (shell) |
| TD-2 | `window` event bus, DOM querying, `as any` | Sprint 2 |
| TD-3 | Generic string-keyed `ModuleTable` for 11 domains | Sprints 3–10, per domain |
| TD-4 | `strict: false`, `strictTemplates: false` | Sprint 0 (new workspace starts strict) |
| TD-5 | 49 KB global CSS, 0 tokens, 4 focus rules | Sprint 2 (design system) |
| TD-6 | Template method calls under default change detection, no `trackBy` | Built into the design-system table |
| TD-7 | Free-string statuses, substring tone mapping | Backend enums + state machines |
| TD-8 | Project name `demo`, inverted `main.ts` / `app.module.ts` | Sprint 0 |
| TD-9 | No tests, lint, CI | Sprint 0 |

## 14. Prototype code to archive

When every screen has a verified replacement (tracked in MIGRATION_PLAN §3), move the following to `/archive/prototype/` using `git mv` so history is kept:

`src/**`, `angular.json`, `tsconfig.json`, `tsconfig.app.json`, `package.json`, `package-lock.json`.

To be **removed** outright (no archive value): `.bolt/config.json`, `netlify.toml`.

## 15. Microfrontend migration plan

Strangler approach in a new `/frontend` workspace. Summary:

1. Sprint 0: new Angular 14.3 workspace, strict TS, ESLint, Jest, CI.
2. Sprint 2: **shell + design-system library + core library + one remote (`wms-warehouse`)**, loaded at runtime from a manifest. This proves federation before more remotes are added.
3. Sprints 3–12: one remote per domain, each replacing its prototype screen(s).
4. Archive the prototype when the migration table is fully "superseded".

Details: [MIGRATION_PLAN.md](MIGRATION_PLAN.md), [MICROFRONTEND.md](MICROFRONTEND.md).

## 16. Target architecture

```
Browser
  └─ wms-shell (Angular 14 host)  ── runtime manifest ──▶ remoteEntry.js of each MFE
        ├─ wms-dashboard      ├─ wms-inventory     ├─ wms-fulfillment
        ├─ wms-warehouse      ├─ wms-inbound       ├─ wms-reports
        ├─ wms-catalog        └─ wms-admin
        │
        ▼  HTTPS  /api/v1/**  (JWT access token, refresh cookie)
  Spring Boot 3.5 modular monolith (Java 21), stateless, horizontally scalable
        │   modules: auth · tenant · identity(user/role/permission) · warehouse(location)
        │            catalog(product/supplier/customer) · inventory(transfer)
        │            inbound · fulfillment(order/picking/packing/shipping)
        │            reporting · audit · notification · common
        ▼
  PostgreSQL 16 (Flyway)          Redis — only when a measured need appears (ADR-008)
```

Eight remotes rather than the eleven suggested in the directive. The directive's `products` / `orders` / `outbound` / `operations` split cuts one workflow (order → allocate → pick → pack → ship) across four deployables that would have to share state. The reasoning is in ADR-003. Full picture: [ARCHITECTURE.md](ARCHITECTURE.md).

## 17. Dependency compatibility risks

| Risk | Detail | Mitigation |
|---|---|---|
| **Angular 14 is end-of-life** | Out of Google LTS since Nov 2023; receives no security patches. | Accepted constraint (ADR-001). Strict CSP, no `bypassSecurityTrust*`, `npm audit` in CI, minimal third-party UI deps. Keep an upgrade path open by avoiding deprecated APIs where an Angular 14–compatible alternative exists. |
| **Node 16 is end-of-life** (Sept 2023) | Build-time only. | Pinned via `.nvmrc` + `engines`; used only in the CI build stage and the Docker build stage. The runtime image is nginx. |
| Module Federation plugin | `@angular-architects/module-federation@14.3.13` pins `rxjs ~6.6.3` as a peer and conflicts with RxJS 7.5. **14.3.14** declares `rxjs >=6.6.3`, `@angular/core >=14.1.1`. | Pin **exactly 14.3.14** (with `module-federation-runtime@14.3.14`). |
| Custom builder | Angular 14's builder has no native MF support. | `ngx-build-plus@14.0.0` (peer `@angular-devkit/build-angular >=12`), the builder the MF 14 schematic installs. |
| `@angular/cdk` | Needed for a11y (FocusTrap, LiveAnnouncer), overlay and virtual scroll. | Pin `~14.2.x` to match the framework major. **(verify** exact patch at install) |
| Unit test runner | Jest brings a large dependency tree. | `jest@28` + `jest-preset-angular@12.2.x` are the Angular 14 generation. **(verify** peer ranges at install; fallback is Karma/Jasmine, which the CLI supports natively) |
| E2E runner | Current Playwright releases require Node ≥ 18. | E2E is a black-box job: run it in a **separate CI job on Node 20** against the built containers. The Angular build itself stays on Node 16. |
| ESLint | `@angular-eslint@14.x` targets Angular 14. | Pin 14.x. |
| Spring Boot 3.5 OSS window | See §8. | Sprint 0 gate. |
| Spring Modulith | Used for module-boundary verification and the event publication registry. | Use the version line aligned with Boot 3.5 (1.4.x). **(verify)** |
| Java on PATH is 24 | Builds could silently target 24. | `maven.compiler.release=21` + Maven toolchains / `JAVA_HOME` in `mvnw` docs + CI uses Temurin 21. |

## 18. Performance risks

| Area | Scale question | Risk | Planned control |
|---|---|---|---|
| Inventory list | SKUs × locations can reach millions of balance rows per tenant | Unbounded queries, client filtering | Server-side paging/sort/filter only; composite indexes on `(tenant_id, warehouse_id, product_id)`; keyset pagination for exports |
| Inventory movements | Append-only ledger grows without bound | Table bloat, slow history queries | Index `(tenant_id, product_id, occurred_at DESC)`; monthly range partitioning **when measured** |
| Order search | High-volume, many filters | N+1 on lines/customers | DTO projections, `JOIN FETCH` only on detail endpoints, no entity serialization |
| Dashboard | Aggregates across all orders/inventory | Full scans on every refresh | Pre-aggregated daily snapshots + short TTL cache; no fetch-all |
| Concurrent reservations | Many pickers/orders on the same SKU | Lost updates, negative stock | Conditional atomic `UPDATE … WHERE available >= :qty`, CHECK constraints, idempotency keys (ARCHITECTURE §5) |
| Frontend tables | 10k+ rows | Browser stalls | Server paging by default; CDK virtual scroll only where a long list is justified; `OnPush`; `trackBy` |
| MFE loading | 8 remotes | Waterfall of `remoteEntry.js` requests | Remotes loaded only on route activation; shared Angular singletons; optional hover-prefetch of a remote |

The directive says to measure first, so the baseline is recorded in Sprint 0 (current prototype: **319 kB initial / 79 kB transfer**), and every later optimisation claim must cite a before/after number in PERFORMANCE.md.

## 19. Security risks

| Area | Risk | Control |
|---|---|---|
| Authentication | Prototype has none | JWT access token (short-lived, in memory) + rotating refresh token in an HttpOnly/Secure/SameSite=Strict cookie; hashed refresh tokens with reuse detection (ADR-006) |
| Authorization | Prototype has none | Server-owned permission catalogue; method-level `@PreAuthorize`; UI hides actions but never enforces |
| Tenant isolation | Cross-tenant data leakage | Tenant ID resolved **only** from the authenticated token; Hibernate `@TenantId` discriminator; tenant-leading unique keys and indexes; PostgreSQL RLS as a later defence-in-depth step; automated cross-tenant tests (ADR-007) |
| Inventory integrity | Race conditions, replayed requests | DB constraints + atomic updates + `Idempotency-Key` on state-changing workflow endpoints |
| Input | Injection, mass assignment | Bean Validation on DTOs; no entity binding; parameterized queries only |
| Errors | Stack-trace leakage | RFC 7807 `ProblemDetail` responses with no internals; correlation ID for support |
| Secrets | Hardcoded credentials | Env / secret manager only; `.env` git-ignored; gitleaks in CI |
| Brute force | Login abuse | Rate limiting on auth endpoints (in-process first, shared store when >1 instance — ADR-008) |
| Frontend platform | EOL Angular 14 | CSP, dependency audit, no raw HTML binding |
| Headers | None today | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'` at nginx and Spring |

## 20. Implementation roadmap

Vertical slices. Every sprint ends with: compile, tests run (results recorded), build, review, docs/ADR updates. Story IDs are allocated per epic.

| Sprint | Epic | Scope | Exit criteria (verifiable) |
|---|---|---|---|
| **0** | WMS-100 Foundation | Audit (this), repo layout, `/frontend` workspace (Angular 14.3, strict, ESLint, Jest), `/backend` (Boot 3.5, Java 21, `mvnw`), Postgres via Compose, Flyway `V1`, `/actuator/health`, CI skeleton | `ng build` + `ng test` + `./mvnw verify` green in CI; health endpoint returns UP against Testcontainers Postgres |
| 1 | WMS-200 Identity & Tenancy | tenant, user, role, permission; login/refresh/logout; RBAC; tenant resolution; audit hook | Cross-tenant access tests fail closed; 401/403 tests |
| 2 | WMS-300 Shell & Design System | shell, `@wms/design-system`, `@wms/core`, MF runtime manifest, first remote `wms-warehouse` (read-only list) | Remote deployed/rolled back independently in Compose; axe checks pass on shell |
| 3 | WMS-400 Warehouse & Locations | warehouses, zones, bins; CRUD + status transitions | Paged API, OpenAPI published, UI states (loading/empty/error/403) |
| 4 | WMS-500 Catalog | products/SKUs, UoM, suppliers, customers | Unique SKU per tenant enforced by DB |
| 5 | WMS-600 Inventory | balances, movements ledger, adjustments with reason codes | Concurrency test: N parallel reservations never oversell |
| 6 | WMS-700 Inbound | PO → ASN → receive → QC → putaway | Duplicate receipt rejected via idempotency |
| 7 | WMS-800 Orders | order lifecycle, validation, reservation, allocation | Invalid transitions return 409 |
| 8 | WMS-900 Picking | pick tasks, short-pick handling | |
| 9 | WMS-1000 Packing & Shipping | packages, carriers, dispatch | |
| 10 | WMS-1100 Transfers | request → approve → pick → in-transit → receive | In-transit quantities reconcile at both ends |
| 11 | WMS-1200 Reports & Dashboard | aggregates, async exports | Dashboard has zero hardcoded numbers |
| 12 | WMS-1300 Audit & Notifications | audit viewer, outbox-driven notifications | |
| 13 | WMS-1400 Hardening | k6 load tests, security review, a11y audit | Baseline vs result documented |
| 14 | WMS-1500 Delivery | multi-stage images, env promotion DEV→QA→UAT→PROD | One-click promote, rollback per MFE |
| 15 | WMS-1600 Production readiness | checklist §45 of the directive, backup/restore drill | Restore drill timed and documented |

### Sprint 0 stories

| ID | Story | Acceptance criteria |
|---|---|---|
| WMS-101 | Project audit & architecture docs | This document set merged |
| WMS-102 | Repository layout & tooling pins | `/frontend`, `/backend`, `/infra`, `/docs`; `.nvmrc`=16.20.2; `engines` set; `.editorconfig` |
| WMS-103 | Angular 14 workspace | `ng new` equivalent at 14.3; `strict: true`, `strictTemplates: true`; ESLint 14; Jest; one passing smoke test |
| WMS-104 | Spring Boot foundation | Boot 3.5.x, Java 21 release target, `mvnw`, package-per-module layout, Spring Modulith verification test |
| WMS-105 | Database foundation | Compose Postgres 16; Flyway `V1__baseline.sql` (tenant table + audit columns convention); `ddl-auto=validate` |
| WMS-106 | Health & observability baseline | Actuator liveness/readiness, structured JSON logs, `X-Correlation-Id` filter |
| WMS-107 | CI skeleton | GitHub Actions: frontend (lint, test, build), backend (verify with Testcontainers), gitleaks |
| WMS-108 | Performance baseline | Prototype bundle numbers recorded in PERFORMANCE.md |

Branching: `feature/WMS-1xx-short-name` off `main`; Conventional Commits (`feat(inventory): …`); PR per story.
