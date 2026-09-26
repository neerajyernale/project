# WMS360 — Target Architecture

Status: **Proposed** (Sprint 0). Decisions referenced here are recorded in [ADR/](ADR/README.md). Current-state findings are in [PROJECT_AUDIT.md](PROJECT_AUDIT.md).

## 1. Principles

1. **Business rules live in the backend.** The UI can hide an action, but only the server decides whether it is allowed.
2. **Inventory correctness beats throughput.** Every stock change is a ledger entry inside a transaction, protected by database constraints.
3. **Tenant isolation is structural, not a filter someone has to remember.**
4. **Modular monolith first.** Module boundaries are enforced in code, so a module can be extracted later if a measured need appears.
5. **Microfrontends follow business domains**, not pages.
6. **Build once, configure per environment.** No environment values are compiled into any artefact.
7. **Measure, then optimise.**

## 2. Repository layout

```
/
├── frontend/                     Angular 14 workspace (Node 16 toolchain)
│   ├── projects/
│   │   ├── shell/                host application
│   │   ├── mfe-dashboard/  mfe-warehouse/  mfe-catalog/  mfe-inventory/
│   │   ├── mfe-inbound/    mfe-fulfillment/  mfe-reports/  mfe-admin/
│   │   ├── design-system/        @wms/design-system  (library)
│   │   ├── core/                 @wms/core  (auth session, http, config, telemetry contracts)
│   │   └── contracts/            @wms/contracts (DTO types generated from OpenAPI)
│   └── angular.json, package.json, .nvmrc
├── backend/                      Spring Boot modular monolith (Java 21, Maven Wrapper)
│   └── src/main/java/com/wms360/<module>/...
├── infra/
│   ├── docker/                   Dockerfiles, nginx config
│   ├── compose/                  local + CI compose files
│   └── config/                   per-environment config templates (no secrets)
├── perf/                         k6 scenarios
├── docs/                         architecture, ADRs, runbooks
├── archive/prototype/            (created at end of migration)
└── .github/workflows/
```

## 3. Frontend architecture

### 3.1 Applications and libraries

| Unit | Kind | Owns |
|---|---|---|
| `shell` | Host app | Bootstrap, layout, auth session, top navigation, route composition, global error handler, toasts, runtime config, remote loading |
| `mfe-*` | Remote apps | Domain routes, pages, domain state and services |
| `@wms/design-system` | Library, shared singleton | Tokens, components, a11y primitives |
| `@wms/core` | Library, shared singleton | `AuthSession` (read-only to remotes), `ApiClient` base, interceptors, `AppConfig`, `Telemetry` abstraction, permission directive |
| `@wms/contracts` | Library, compile-time | TypeScript DTOs generated from the backend OpenAPI document |

Remotes **never** import from another remote. Cross-domain navigation uses URLs (`/inventory?sku=SKU-10045`), not component references.

### 3.2 Internal structure of each remote

```
projects/mfe-inventory/src/app/
├── inventory.routes.ts          exposed entry (Routes)
├── pages/                       routed, container components (smart)
├── components/                  presentational, OnPush, inputs/outputs only
├── services/                    API access (HttpClient) — one per resource
├── state/                       per-feature store: BehaviorSubject + selectors (no NgRx until justified)
├── models/                      view models; DTOs come from @wms/contracts
├── guards/  resolvers/  validators/  utils/
```

Rules:
- All components are `ChangeDetectionStrategy.OnPush`. Templates bind to observables (`async`) or precomputed view models, never to methods that compute.
- Every `*ngFor` has a `trackBy`.
- Search inputs use `debounceTime` + `distinctUntilChanged` + `switchMap`, so a newer query cancels the older request.
- No nested `subscribe`. Component subscriptions end via `takeUntil(destroy$)` or `async`.
- Forms are Reactive Forms (typed forms are available in Angular 14). Server `422` field errors are mapped onto controls by a shared helper.

### 3.3 Page state contract

Every data page renders exactly one of: `loading` (skeleton) · `ready` · `empty` (with a next action) · `no-results` (with "clear filters") · `error` (with retry) · `forbidden` · `offline`. A shared `ResourceState<T>` type and `<wms-state-view>` component in the design system enforce this, so pages cannot forget a state.

### 3.4 HTTP pipeline (interceptors, in order)

1. **Correlation**: adds `X-Correlation-Id` (UUID per user action) and forwards it to telemetry.
2. **Auth**: attaches the in-memory access token. On `401` it performs a single-flight refresh (concurrent 401s wait for the same refresh) and retries once.
3. **Tenant/warehouse context**: adds `X-Warehouse-Id` for warehouse-scoped endpoints. **Tenant is never sent by the client**; it comes from the token.
4. **Error mapping**: converts `ProblemDetail` to a typed `ApiError`; `403` → forbidden state; `409` → conflict toast with a reload action; `429` → retry-after; `5xx`/network → retry banner.
5. **Retry**: only idempotent `GET`s, with backoff, max 2.

## 4. Backend architecture

### 4.1 Modules

Spring Boot 3.5 / Java 21, one deployable. Each top-level package is a module; **Spring Modulith** verifies in a unit test that modules only use each other's published API (`<module>/api` package) or domain events.

| Module | Responsibility | Depends on |
|---|---|---|
| `common` | Error model, paging, ID types, clock, idempotency store | — |
| `tenant` | Tenant lifecycle, tenant context resolution | common |
| `identity` | Users, roles, permissions, password hashing | tenant |
| `auth` | Login, token issue/refresh/revoke | identity |
| `warehouse` | Warehouses, zones, locations/bins, capacity | tenant |
| `catalog` | Products/SKUs, UoM, suppliers, customers | tenant |
| `inventory` | Balances, movement ledger, reservations, adjustments, transfers | warehouse, catalog |
| `inbound` | Purchase orders, ASNs, receiving, QC, putaway | inventory (API), catalog |
| `fulfillment` | Orders, allocation, picking, packing, shipping | inventory (API), catalog, warehouse |
| `reporting` | Read models, aggregates, export jobs | events from all |
| `audit` | Append-only audit trail | events from all |
| `notification` | In-app / email notifications via outbox | events from all |

The directive lists `user`, `role`, `permission`, `location`, `supplier`, `customer`, `order`, `outbound`, `picking`, `packing`, `shipping` and `transfer` as separate modules. Here they are **sub-packages** of the modules above. That keeps each transaction boundary inside one module: for example, allocating an order and reserving its stock are one fulfillment → inventory API call, not a chain of calls through five modules.

### 4.2 Layering inside a module

```
<module>/
├── api/            ← the only package other modules may import (facades, DTOs, events)
├── web/            ← @RestController, request/response DTOs, mappers (MapStruct)
├── application/    ← use-case services, @Transactional boundaries, authorization checks
├── domain/         ← entities, value objects, state machines, domain rules (no Spring)
└── infrastructure/ ← Spring Data repositories, projections, external adapters
```

- Controllers never return entities; MapStruct maps entity ⇄ DTO.
- `@Transactional` lives on application services only.
- State transitions are methods on the aggregate (`order.allocate()`), which throw `InvalidStateTransitionException` → HTTP 409.

## 5. Domain model highlights

### 5.1 Inventory

`inventory_balance` — one row per `(tenant, warehouse, location, product, lot?)`:

| Column | Meaning |
|---|---|
| `on_hand` | Physically present |
| `reserved` | Promised to orders/transfers, not yet picked |
| `damaged` | Present but unsellable |
| `blocked` | Quality or admin hold |
| `available` | **Generated column**: `on_hand − reserved − damaged − blocked` |
| `version` | Optimistic lock |

Constraints: every bucket `>= 0`; `reserved + damaged + blocked <= on_hand`. In-transit stock is tracked on the transfer, not in the balance, so it is never counted as on hand in two warehouses at once.

`inventory_movement` — append-only ledger (`RECEIPT`, `PUTAWAY`, `RESERVE`, `RELEASE`, `PICK`, `ADJUST`, `TRANSFER_OUT`, `TRANSFER_IN`, `DAMAGE`, …) with `(tenant_id, idempotency_key)` unique. The balance must always equal the sum of its movements; a scheduled reconciliation job checks this and raises an alert on drift.

**Concurrency:** hot-path reservations use a single conditional statement:

```sql
UPDATE inventory_balance
   SET reserved = reserved + :qty, version = version + 1
 WHERE id = :id AND tenant_id = :tenant AND available >= :qty;
-- 0 rows → InsufficientStock (409); never read-modify-write in Java
```

Aggregate edits made through the UI (for example, adjustment approvals) use `@Version` optimistic locking and return 409 on conflict.

### 5.2 State machines (enforced in `domain`)

```
Order:     CREATED → CONFIRMED → ALLOCATED → PICKING → PICKED → PACKING → PACKED → SHIPPED → DELIVERED
           CREATED|CONFIRMED|ALLOCATED → CANCELLED (releases reservations)
           ALLOCATED|PICKING → ON_HOLD → (back to prior state)      PICKING → SHORT_PICKED → ALLOCATED (re-allocate)
Inbound:   PO_OPEN → ASN_EXPECTED → RECEIVING → QC → PUTAWAY → COMPLETED ; RECEIVING → DISCREPANCY → QC
Transfer:  REQUESTED → APPROVED → PICKING → IN_TRANSIT → RECEIVING → COMPLETED ; REQUESTED → REJECTED ; APPROVED → CANCELLED
Pick task: PENDING → ASSIGNED → IN_PROGRESS → COMPLETED | SHORT | FAILED
```

Transitions are exposed as **commands**, not as status writes: `POST /api/v1/orders/{id}/allocate`, not `PATCH {status: "ALLOCATED"}`.

## 6. API conventions

- Base path `/api/v1`. Resources are plural nouns; workflow commands are sub-resources (`/orders/{id}/cancel`).
- Paging: `?page=0&size=25&sort=createdAt,desc`; `size` max 200; the response envelope is `{ content, page, size, totalElements, totalPages }`. Large exports use async jobs, never an unbounded GET.
- Filtering: explicit query params (`status`, `warehouseId`, `from`, `to`, `q`).
- Errors: RFC 7807 `application/problem+json` with `type`, `title`, `status`, `detail`, `correlationId` and, for 422, `errors[{field, code, message}]`. Status codes used: 400, 401, 403, 404, 409, 422, 429, 500.
- `Idempotency-Key` header is **required** on workflow commands that move stock (receive, reserve, pick-confirm, transfer-complete).
- `ETag` / `If-Match` on editable master data (warehouses, products) maps to the entity version.
- OpenAPI 3 from springdoc; the spec is published as a CI artefact and generates `@wms/contracts`.

## 7. Data and multi-tenancy

- **Shared schema with a `tenant_id` column** on every tenant-owned table (ADR-007). Hibernate 6 `@TenantId` injects the discriminator automatically; `CurrentTenantIdentifierResolver` reads it from the security context.
- Unique keys and leading index columns start with `tenant_id` (e.g. `UNIQUE (tenant_id, sku)`).
- Native queries bypass `@TenantId`. They are allowed only inside `infrastructure` and must include `tenant_id`; an ArchUnit rule plus the cross-tenant integration suite guard this.
- Defence in depth (Sprint 13): PostgreSQL row-level security using `SET LOCAL app.tenant_id` per transaction.
- Every table has `created_at`, `created_by`, `updated_at`, `updated_by`, `version`.
- Flyway naming: `V{n}__{module}_{description}.sql`. Dev/QA seed data lives in `db/seed` and loads only with the `seed` profile. It uses the prototype's realistic data (Mumbai Central, Pune, Bengaluru …).

## 8. Security

See ADR-006 and SECURITY.md (Sprint 1). Summary:
- Access token: JWT, 15 min, signed (RS256, key from secret store), claims `sub`, `tid`, `perms` hash, `jti`.
- Refresh token: opaque, 8 h sliding / 7 d max, HttpOnly + Secure + SameSite=Strict cookie scoped to `/api/v1/auth`. Stored as a hash, rotated on every use; reuse of an old token revokes the whole token family.
- Passwords: BCrypt (cost tuned so hashing takes ~250 ms on production hardware, **measured**) or Argon2id.
- Authorization: permission strings (`inventory:adjust`, `order:cancel`, `role:manage`) checked with `@PreAuthorize` on application services; roles are tenant-defined bundles of permissions.
- Warehouse scoping: a user may be limited to a set of warehouses; enforced in queries, not only in the UI.

## 9. Caching (ADR-008)

| Data | Cache | Invalidation |
|---|---|---|
| Permission set per user | Caffeine, 5 min | Evict on role/assignment change event |
| Warehouse / location reference data | Caffeine, 10 min | Evict on write in the owning module |
| Dashboard aggregates | Caffeine, 30–60 s | TTL only; data is labelled "as of hh:mm" in the UI |
| Inventory balances | **Never cached** | — |

Redis is introduced only when a second backend instance makes in-process state incorrect. The first expected case is shared rate-limit buckets and token revocation. That trigger is written into ADR-008.

## 10. Asynchronous processing (ADR-009)

A transactional outbox (Spring Modulith event publication registry, backed by PostgreSQL) holds events. Listeners run after commit, with retries and a failed-events table as the dead-letter store. Uses: audit enrichment, notifications, report/export jobs, read-model refresh. **No Kafka** until there is a consumer outside the monolith.

## 11. Observability

- Actuator: `/actuator/health/liveness`, `/actuator/health/readiness` (DB check), `/actuator/prometheus` (internal network only).
- Structured JSON logs (Spring Boot built-in structured logging). Every line carries `correlationId`, `tenantId`, `userId`, `traceId`. Log filters strip tokens, passwords and `Authorization` headers.
- Micrometer timers on every HTTP endpoint and on inventory commands; Micrometer Tracing with the OpenTelemetry bridge is present but exporter-less until a collector exists.
- Frontend: a global `ErrorHandler` and the error interceptor report to a `Telemetry` interface (console in dev, backend `/api/v1/client-events` later), tagged with the correlation ID.

## 12. Configuration and environments

| Environment | Purpose | Config source |
|---|---|---|
| LOCAL | Developer machine | `.env` (git-ignored) + Compose |
| DEV | Integration of `main` | Env vars / secret store |
| QA | Test cycles, seed data | Env vars / secret store |
| UAT | Business acceptance | Env vars / secret store |
| PROD | Production | Env vars / secret store; no seed profile |

- Backend: `application.yml` holds defaults only; everything environment-specific comes from `${ENV_VAR}` values. Profiles: `local`, `seed`, `prod`.
- Frontend: the shell fetches `/config/app-config.json` and `/config/mf.manifest.json` **before bootstrap**. nginx renders both from environment variables at container start, so the same image moves DEV → PROD unchanged.

## 13. Deployment topology

```
            ┌──────────── ingress / reverse proxy (TLS, security headers) ────────────┐
            │  /            → shell (nginx)                                            │
            │  /mfe/<name>/ → mfe-<name> (nginx, one container per remote)             │
            │  /api/        → backend (Spring Boot, N stateless replicas)             │
            └───────────────────────────────────────────────────────────────────────────┘
                                          │
                                   PostgreSQL 16 (managed, PITR backups)
```

Every frontend unit is its own image and can be versioned, deployed and rolled back on its own. Rolling back a remote means pointing its manifest entry at the previous version's URL.

## 14. Testing strategy (summary; detail in TESTING.md)

| Layer | Tooling | Focus |
|---|---|---|
| Domain | JUnit 5 | State machines, inventory rules — no Spring context |
| Application | JUnit 5 + Mockito | Authorization, orchestration |
| Web | `@WebMvcTest` + Spring Security test | Status codes, validation, ProblemDetail shape |
| Persistence / integration | `@SpringBootTest` + Testcontainers PostgreSQL 16 | Constraints, migrations, tenant isolation, concurrency (parallel reservations) |
| Architecture | Spring Modulith + ArchUnit | Module boundaries, no entity in `web`, no native query outside `infrastructure` |
| Frontend unit | Jest + Angular TestBed | Services, interceptors, guards, forms, state |
| E2E | Playwright (separate Node 20 job) | Login → receive → reserve → pick → ship |
| Load | k6 | Inventory search, order search, concurrent reservations, dashboard |
