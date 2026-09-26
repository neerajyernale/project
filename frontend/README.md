# WMS360 — Frontend

Angular 14.3 application for WMS360. It replaces the Bolt prototype at the repository root, which stays untouched as the UX reference (see `docs/MIGRATION_PLAN.md`).

## Run it

Requires Node 16.20 (`.nvmrc`).

```bash
cd frontend
npm install
npm start            # http://localhost:4200
npm test             # Jest unit tests
npm run build        # production build → dist/shell
```

Until the Spring Boot API exists, the app runs against an **in-browser mock of `/api/v1`** (see below). Sign in with any demo account; the password for all of them is `Wms360-Demo!`. The login page lists them.

| Account | Role | Warehouses |
|---|---|---|
| admin@wms360.com | Admin | all |
| rajesh.kumar@wms360.com | Warehouse Manager | Mumbai |
| amit.sharma@wms360.com | Supervisor | Mumbai, Pune |
| priya.menon@wms360.com | Inventory Manager | Pune |
| rohit.verma@wms360.com | Picker | Mumbai |
| sneha.iyer@wms360.com | Packer | Mumbai |

Data changes persist in the browser's localStorage. **Sidebar → Demo data → Reset** restores the seed.

## What's in it

| Area | Screens | Workflows |
|---|---|---|
| Shell | Login, sidebar, top bar, 403/404/unavailable pages | Sign in/out, session resume, warehouse switcher, global search (Ctrl/⌘ K), notifications, change password |
| Dashboard | KPIs, stock by warehouse, capacity, orders over 7 days, orders by status, activity, alerts, top products | All figures computed from data; each KPI links to its filtered list |
| Warehouses | List, detail with 7 tabs (overview, zones, bins, inventory, orders, activity, performance) | Create/edit, activate/deactivate, add zones and bins, block/unblock bins |
| Catalog | Products, Suppliers, Customers | Create/edit, discontinue/reactivate, CSV export |
| Inventory | Stock per warehouse, stock by bin, movement ledger | Count corrections, damage write-offs (with reasons) |
| Transfers | List, detail with progress | Request → approve (reserves stock) / reject → dispatch → receive; cancel releases stock |
| Inbound | List, detail | Schedule ASN → start receiving → count received/damaged → put away into bins (capacity-aware suggestions) |
| Fulfillment | Orders, Outbound, order detail, Picking, Packing, Shipping | Create → allocate (all-or-nothing) → release to picking → assign/start/confirm picks (short picks) → pack → dispatch → deliver or report exception |
| Reports | 13 reports in 4 groups | Run with warehouse/date filters, preview, CSV export, print |
| Admin | Users, Roles & permissions, Settings | Invite/edit/disable users, warehouse scoping, per-role permission matrix, custom roles, settings with conflict detection and unsaved-changes guard |

Every data page renders one of the seven page states: loading, ready, empty, no results, error, forbidden or offline (`ARCHITECTURE.md` §3.3).

## Structure

```
src/app/
├── core/         @wms/core equivalent: auth session, guards, HTTP interceptors, API clients,
│                 warehouse context, list/page-state controller, toasts, typed models (contracts)
├── shared/       @wms/design-system equivalent: icons, status badges, state views, paginator,
│                 dialogs (CDK), charts, form helpers, pipes, directives
├── layout/       shell, sidebar, top bar, status pages
├── features/     one lazy NgModule per future microfrontend remote:
│                 dashboard · warehouse · catalog · inventory · inbound · fulfillment · reports · admin
└── mock-api/     in-browser /api/v1 (dev only, lazy chunk)
```

Each feature module matches one remote from `docs/MICROFRONTEND.md` §2 and owns its URLs (`/products`, `/picking`, …). Features don't import each other; they navigate by URL. That keeps the Module Federation split (Sprint 2) a packaging change rather than a rewrite.

## The mock API

`src/app/mock-api` implements the `/api/v1` contract in the browser. It enforces the domain rules the Spring Boot backend must also enforce:

- **Stock ledger.** Every balance equals the sum of its movements (a unit test checks this after the full seed).
- **Reservations never oversell.** Allocation checks all lines first; if any line is short, nothing is reserved and the API returns `409`.
- **State machines.** Transitions are commands (`POST /orders/{id}/allocate`, …); an invalid transition returns `409`.
- **Server-side authorization.** Permission checks on every route, plus warehouse scoping: scoped users get `403` or `404` outside their warehouses.
- **Protocol behaviours.** RFC 7807 errors with field errors (`422`), `Idempotency-Key` replay on stock commands, optimistic version checks (`409` on stale edits), and a refresh token held outside app code (standing in for the HttpOnly cookie).

The seed is the prototype's data, replayed through the API at past timestamps, so history is consistent. Two prototype inconsistencies were fixed on the way: ORD-10432 is cancelled with no shipment, and inbound shipments use `ASN-*` numbers.

**Switching to the real API:** set `"useMockApi": false` (and `apiBaseUrl`) in `src/assets/config/app-config.json`. That file is read at startup, so one build can be promoted between environments. The mock chunk is then never downloaded.

## Tests

```bash
npm test
```

- `mock-api/mock-server.spec.ts` covers:
  - seed integrity and ledger reconciliation
  - reserved stock equal to open allocations
  - no overselling and a full order lifecycle
  - 409s, permissions, warehouse scoping and account enumeration
  - idempotency, stale edits, and dashboard figures being computed from data
- `core/state/list-controller.spec.ts` covers the page states, search debounce and cancellation of stale requests, and sorting.
- `shared/status/status-tones.spec.ts` covers the explicit status-to-tone map (it fixes the prototype's `OVERSTOCK` → success bug).

## Not done yet

- **Module Federation split** into separate remotes (planned for Sprint 2; the module boundaries are already in place).
- **Spring Boot backend:** replace the mock API.
- **ESLint:** a local tooling hook blocks creating `.eslintrc.json`. Add the config once that hook allows it.
- **Enforced by the server later:** idle session timeout, 2FA, the IP allowlist, email invitations and the daily summary email. The settings are stored and editable today, but nothing acts on them yet.
- **E2E suite (Playwright):** the order and inbound workflows have been driven through the UI by script, but not yet as a committed test suite.
