# WMS360 — Frontend

Angular 14.3 application for WMS360. It replaces the Bolt prototype at the repository root, which stays untouched as the UX reference (see `docs/MIGRATION_PLAN.md`).

## Run it

Requires Node 16.20 (`.nvmrc`).

```bash
cd frontend
npm install
npm start            # shell on :4200 + the 8 remotes on :4201–4208 → open http://localhost:4200
npm test             # Jest unit tests
npm run build        # production builds of the shell and all remotes → dist/<project>
npm run serve:dist   # serves those builds the way they are deployed → http://localhost:8080
```

`npm start` refuses to start if a port is taken (the old prototype at the repository root also uses 4200). Stop it, or run the shell elsewhere with `SHELL_PORT=4210 npm start` (PowerShell: `$env:SHELL_PORT=4210; npm start`).

| Command | What it does |
|---|---|
| `npm start -- inventory admin` | Shell plus only the listed remotes. The others show "This part of WMS360 couldn't load". |
| `npm run start:shell` | Shell alone. |
| `npx ng serve mfe-inventory` | One remote on its own port (here :4204), with the shell's sign-in and layout around it. |
| `npm run build -- inventory` | Build one remote: an independent release. |

Remote dev servers rebuild on save but don't live-reload the browser (their reload client would reload the whole shell every time a remote loads), so refresh after changing remote code. The shell does live-reload.

Until the Spring Boot API exists, the app runs against an **in-browser mock of `/api/v1`** (see below). Sign in with any demo account; the password for all of them is `Wms360-Demo!`. The login page lists them.

| Account | Role | Warehouses |
|---|---|---|
| admin@wms360.com | Admin | all |
| rajesh.kumar@wms360.com | Warehouse Manager | Mumbai |
| amit.sharma@wms360.com | Supervisor | Mumbai, Pune |
| rohit.verma@wms360.com | Picker | Mumbai |
| sneha.iyer@wms360.com | Packer | Mumbai |
| priya.menon@wms360.com | Inventory Manager | Pune |
| meera.joshi@wms360.com | Seller | all |
| vivek.nair@wms360.com | Viewer (read only) | all |

Data changes persist in the browser's localStorage. **Sidebar → Demo data → Reset** restores the seed.

## What's in it

| Area | Screens | Workflows |
|---|---|---|
| Shell | Login, sidebar, top bar, 403/404/unavailable pages | Sign in/out, session resume, warehouse switcher, global search (Ctrl/⌘ K), notifications, change password |
| Dashboard | KPIs, stock by warehouse, capacity, orders over 7 days, orders by status, activity, alerts, top products | All figures computed from data; each KPI links to its filtered list |
| Warehouses | List, detail with 7 tabs (overview, zones, bins, inventory, orders, activity, performance) | Create/edit, activate/deactivate, add zones and bins, block/unblock bins |
| Catalog | Products, Suppliers, Customers | Create/edit, discontinue/reactivate, CSV export |
| Inventory | Stock per warehouse, stock by bin, movement ledger | Bin-to-bin moves (e.g. dock → storage), count corrections, damage write-offs (with reasons) |
| Transfers | List, detail with progress | Request → approve (reserves stock) / reject → dispatch → receive; cancel releases stock. The source warehouse approves/dispatches, only the destination receives |
| Inbound | List, detail | Schedule ASN → start receiving → count received/damaged → put away into bins (capacity-aware suggestions) |
| Fulfillment | Orders, Outbound, order detail, Picking, Packing, Shipping | Create → allocate (all-or-nothing) → release to picking → assign/start/confirm picks (short picks) → pack → dispatch → deliver or report exception |
| Reports | 13 reports in 4 groups | Run with warehouse/date filters, preview, CSV export, print |
| Admin | Users, Roles & permissions, Settings | Invite/edit/disable users, warehouse scoping, per-role permission matrix, custom roles, settings with conflict detection and unsaved-changes guard |

Every data page renders one of the seven page states: loading, ready, empty, no results, error, forbidden or offline (`ARCHITECTURE.md` §3.3).

## Deploy (Vercel)

The build runs on your machine with Node 16; Vercel only serves the files (it no longer offers Node 16 for builds).

```bash
npm run build           # builds shell + 8 remotes and assembles dist/deploy
npm run serve:dist      # optional: check it at http://localhost:8080 with the same rules Vercel uses
npm run deploy:vercel   # uploads dist/deploy (Vercel CLI 28, the last line that runs on Node 16)
```

The first deploy asks you to log in and to create or link a Vercel project; the link is kept in `dist/deploy/.vercel`. `dist/deploy` contains the shell at `/`, each remote at `/mfe/<name>/`, the remote manifest, and a `vercel.json` with the SPA fallback and security headers. The deployed app runs on the in-browser mock API (`assets/config/app-config.json`) until the backend exists.

## Structure

```
frontend/
├── federation.remotes.json   the 8 remotes: name, dev port, URL roots, exposed NgModule
├── federation.webpack.js     Module Federation config shared by every project (shared-dependency list)
├── webpack.config.js         the shell's federation config
├── projects/mfe-<name>/      one per remote: webpack config + standalone dev bootstrap
├── scripts/                  dev.mjs (npm start), build-all.mjs, serve-dist.mjs
└── src/
    ├── main.ts               reads the remote manifest, then bootstraps (bootstrap.ts)
    ├── assets/config/        app-config.json (API, mock switch) · mf.manifest.json (remote URLs)
    └── app/
        ├── core/             @wms/core: auth session, guards, HTTP interceptors, API clients,
        │                     warehouse context, list/page-state controller, toasts, typed models
        ├── shared/           @wms/design-system: icons, badges, state views, paginator,
        │                     dialogs (CDK), charts, form helpers, pipes, directives
        ├── layout/           shell, sidebar, top bar, status pages
        ├── federation/       remote loader and one route per remote
        ├── features/         one NgModule per remote:
        │                     dashboard · warehouse · catalog · inventory · inbound · fulfillment · reports · admin
        └── mock-api/         in-browser /api/v1 (dev only, lazy chunk of the shell)
```

## Microfrontends

The shell and the 8 remotes from `docs/MICROFRONTEND.md` §2 are separate Angular projects built with Module Federation (`@angular-architects/module-federation` 14.3.14, `ngx-build-plus` 14.0.0).

- **Loading.** `main.ts` reads `assets/config/mf.manifest.json` (remote name → `remoteEntry.js` URL) before Angular starts. A remote is downloaded the first time one of its URLs is opened; the sign-in page loads no remote code. The manifest is per environment, so a remote can be moved or rolled back without rebuilding the shell.
- **One Angular, one session.** Angular, CDK, RxJS, `@wms/core` and `@wms/design-system` are shared singletons; Angular and `@wms/core` with strict versions, so a mismatch fails loudly. Code outside `core/` and `shared/` imports them only as `@wms/core` / `@wms/design-system`: a deep import would give a remote its own copy, and with it an empty session. `npm run build` checks that every build shares both libraries.
- **Failure isolation.** If a remote can't load, its pages show "This part of WMS360 couldn't load" with a Reload button; the shell and the other remotes keep working.
- **Boundaries.** Features don't import each other or the shell; they navigate by URL. The shell provides the one `HttpClient` and its interceptors.
- **Own loader.** `src/app/federation/remote-loader.ts` replaces `loadRemoteModule()` from the runtime package, which doesn't wait for a remote's shared-scope setup and could start a second Angular on the first load.

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
npm test          # 42 unit tests (Jest)
npm start         # (or: npm run build && npm run serve:dist) then, in another terminal:
npm run e2e       # browser suites (needs Chrome; set CHROME_PATH / WMS_URL if not default)
```

For the production builds: `WMS_URL=http://localhost:8080 npm run e2e` (PowerShell: `$env:WMS_URL='http://localhost:8080'; npm run e2e`).

Browser suites (`e2e/`, driven by puppeteer-core):

- `federation.mjs`: no remote code on the sign-in page; each remote is fetched only when its route opens and renders; no remote downloads its own copy of Angular; with one remote blocked, its pages show "unavailable" while the sidebar and other remotes keep working.
- `a11y.mjs`: axe-core with the WCAG 2.1 A and AA rules on the sign-in page, all 25 screens, an order detail and the new-order dialog.
- `role-matrix.mjs`: all 8 roles × 20 screens, 446 checks. The sidebar shows exactly the permitted items, every allowed page loads with no error state, forbidden pages redirect, and create buttons appear only with the matching permission.
- `role-workflows.mjs`: 20 scenarios in which each role does its real job on one shared database:
  - picker confirms picks
  - packer packs, dispatches, delivers and reports problems
  - Mumbai dispatches a transfer that only Hyderabad can receive, then moves it out of the dock
  - inventory manager receives and puts away, adjusts, and transfers
  - supervisor releases orders
  - seller creates orders but can't allocate
  - viewer is read-only
  - admin creates warehouses, zones and bins, searches, runs reports and disables users
- `order-inbound-flow.mjs`: an order from creation to shipment (including a short pick), and inbound receiving with a discrepancy through to putaway and the ledger.

Unit suites:

- `mock-api/mock-server.spec.ts` covers:
  - seed integrity and ledger reconciliation
  - reserved stock equal to open allocations
  - no overselling and a full order lifecycle
  - 409s, permissions, warehouse scoping and account enumeration
  - idempotency, stale edits, and dashboard figures being computed from data
- `core/state/list-controller.spec.ts` covers the page states, search debounce and cancellation of stale requests, and sorting.
- `shared/status/status-tones.spec.ts` covers the explicit status-to-tone map (it fixes the prototype's `OVERSTOCK` → success bug).
- `core/http/interceptors.spec.ts` covers the HTTP pipeline:
  - token and correlation id on every call
  - one refresh for concurrent 401s
  - sign-out when the refresh fails
  - problem-detail mapping
  - permission reload after a 403
  - GET-only retries
- `mock-server.spec.ts` also covers the audit fixes:
  - refresh-token reuse detection, with a grace period for two tabs
  - idle timeout
  - notifications scoped per warehouse and permission, with per-user read state
  - alert de-duplication and capacity alerts
  - dock-to-storage moves, and inactive zones
  - transfer source/destination rules
  - report scoping, admin-activity privacy and alert links
  - picker assignment rules
  - network-wide transfer destinations
  - count endpoints, discontinued products and past dates

## Not done yet

- **Spring Boot backend:** replace the mock API.
- **ESLint config:** ESLint 8 and `@angular-eslint` 14.4 are installed, but a local tooling hook (config protection) blocks creating `.eslintrc.json`. The intended config (module-boundary import rules, OnPush, template accessibility rules) passes on the current code; add it once that hook allows it.
- **Playwright:** the browser suites use puppeteer-core, which runs on Node 16. Playwright needs Node 18+, so moving to it means a separate Node 20 CI job (`docs/PROJECT_AUDIT.md` §17).
- **Deployment:** containers per remote and rendering `mf.manifest.json` from environment variables at container start. `npm run serve:dist` shows the target layout (`/mfe/<name>/`, no-cache `remoteEntry.js`, immutable hashed files).
- **Enforced by the server later:** 2FA, the IP allowlist, email invitations and the daily summary email. They are stored as settings, but nothing acts on them yet. The idle session timeout, password minimum length, capacity alerts and the other notification switches *are* enforced.
