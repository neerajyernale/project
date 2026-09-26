# WMS360 — Prototype Audit

| | |
|---|---|
| Audit ID | WMS-100 |
| Date | 2026-09-25 |
| Scope | Everything tracked in git at commit `ed583e3` ("first commit") |
| Method | Every source file was read in full; production build was executed; installed package versions were read from `node_modules` |

This document inventories the Bolt-generated prototype and classifies each part as **KEEP**, **REFACTOR**, **REBUILD** or **REMOVE**. Nothing in the prototype is deleted by this audit. The prototype remains runnable at the repository root until each replacement is verified, then moves to `/archive/prototype/` (see [MIGRATION_PLAN.md](MIGRATION_PLAN.md)).

---

## 1. Existing UI

A single-page, client-only mock of a WMS back office:

| Screen | Component | What it actually does |
|---|---|---|
| Login | `Login` | Validates email format and `password.length >= 6`, waits 1.2 s, dispatches a `window` event. Any password works. Screen is **never shown** because `loggedIn = true` on start. |
| App shell | `App` (in `src/main.ts`) | Dark sidebar (Workspace + Manage groups), top bar with search, help, notifications popover, profile menu. |
| Dashboard | `Dashboard` | 6 KPI cards with sparklines, stacked bar chart, capacity donut, orders line chart (hand-drawn SVG path), order-status donut, activity feed, alerts list, top-products table. All values are literals. |
| Warehouses | `Warehouses` | KPI strip, searchable table, "Add warehouse" modal that saves nothing. |
| Warehouse detail | `WarehouseDetail` | 7 tabs: Overview, Inventory, Zones, Bins, Orders, Activity, Performance. |
| Inventory, Products, Inbound, Outbound, Orders, Picking, Packing, Shipping, Stock Transfers, Suppliers, Customers | `ModuleTable` (one generic component) | Header, optional KPI strip, client-side text search over a static array, decorative filter chips and pagination. |
| Reports | `Reports` | Catalog of report cards with Preview/Run buttons that do nothing. |
| Users & Roles | `UsersRoles` | User table and a read-only permission matrix (same matrix for every role). |
| Settings | `Settings` | 5 sections of settings fields; only toggles change in-memory state; Save/Reset do nothing. |

**Visual character (the part worth preserving):** dark navy navigation (`#081525`), light content ground (`#f6f8fb`), restrained blue primary (`#287bd4`), dense tables, status badges, warehouse context switcher, Indian enterprise seed data.

**What makes it read as generated:** unicode glyphs as icons (`⌂ ▦ ◫ ♟ ⚒`), every KPI with a trend arrow and "vs last month", a sparkline under every number, two display fonts (DM Sans + Space Grotesk), decorative blurred circles on the login panel, "All systems operational" status that is not wired to anything, `⌘ K` hint with no handler.

## 2. Existing Angular structure

```
src/
├── index.html
├── main.ts                 ← contains the ROOT COMPONENT (App), not the bootstrap
├── app.module.ts           ← contains NgModule AND platformBrowserDynamic().bootstrapModule()
├── app-shell.component.html
├── global_styles.css       ← 540 lines, ~49 KB, all styles for all screens
└── app/
    ├── data.ts             ← ~35 KB, every type, constant and "API response"
    ├── *.component.ts/html ← 9 components, flat, no feature folders
```

- `angular.json` project is named **`demo`**; `main` points at `src/app.module.ts` (the file roles are inverted).
- One eagerly loaded `NgModule` declares everything. No feature modules, no lazy loading.
- **No `RouterModule`** even though `@angular/router` is installed. Navigation is `activePage: PageKey` + `[ngSwitch]`. Consequences: no URLs, no deep links, no browser back button, no route guards, a refresh always returns to Dashboard.
- `tsconfig.json`: `strict: false`, `strictTemplates: false`.
- No `environments/`, no `assets/`, no `test.ts`, no Karma/Jest config, no ESLint.

## 3. Existing components

| Component | Selector | Notes |
|---|---|---|
| `App` | `app-root` | Owns navigation state, listens to `window` CustomEvents, calls `document.querySelector('app-warehouse-detail')` and invokes a method on the DOM node via `as any`. |
| `Login` | `app-login` | Template-driven by hand (`[value]` + `(input)`), not Angular forms. Emits a global `window` event on "success". |
| `Dashboard` | `app-dashboard` | Pure presentation of constants. `donutGradient()` is recomputed on every change-detection cycle. |
| `Warehouses` | `app-warehouses` | Inline modal duplicated from `Modal`. Communicates "view" via `window.dispatchEvent`. |
| `WarehouseDetail` | `app-warehouse-detail` | Bins, inventory and orders are hardcoded **inside the component** and are the same for every warehouse. |
| `ModuleTable` | `app-module-table` | Generic table keyed by string headings. `@Output() addClick` / `viewClick` are **never bound** by the shell, so "Add …" and "View" do nothing on 11 pages. |
| `Reports` | `app-reports` | Static list. |
| `UsersRoles` | `app-users-roles` | Selecting a role does not change the matrix. |
| `Settings` | `app-settings` | Text inputs use one-way `[value]`; edits are lost. |
| `Modal` | `app-modal` | **Dead code** (declared, never used). Uses `[innerHTML]`. No `role="dialog"`, no focus trap, no Escape handling. |

## 4. Existing services

**None.** There is no `@Injectable` in the codebase. All state lives in component fields or module-level constants, and components talk to each other through `window` events.

## 5. Existing routes

**None.** See section 2. The 16 `PageKey` values in `data.ts` are the de facto route list and are reused as the target route map in [MICROFRONTEND.md](MICROFRONTEND.md).

## 6. Existing mock data (`src/app/data.ts`)

| Constant | Content | Reuse value |
|---|---|---|
| `WAREHOUSES` | 5 warehouses (Mumbai, Pune, Hyderabad, Delhi, Bengaluru) with 6 zones each | **High** — becomes Flyway dev seed |
| `PAGE_DATA.Inventory` / `Products` | 8 SKUs with realistic names, brands, reorder levels | **High** — dev seed |
| `PAGE_DATA.Orders/Outbound/Picking/Packing/Shipping` | Linked IDs (`ORD-10482` → `PCK-8021` → …) | **High** — seed and workflow test fixtures |
| `PAGE_DATA.Inbound`, `Stock Transfers`, `Suppliers`, `Customers` | Realistic Indian suppliers, customers and carriers | **High** — dev seed |
| `USERS`, `ROLES`, `PERMISSION_MODULES`, `PERMISSION_MATRIX` | 8 users, 8 roles, 9 modules × 5 actions | **Medium** — starting point for the RBAC permission catalogue |
| `SETTINGS_SECTIONS` | Settings catalogue | **Medium** — informs the tenant/warehouse settings model |
| `KPIS`, `ORDER_STATUS_DATA`, sparklines, trends | Invented numbers | **None** — must come from aggregates |
| `statusClass()` | Maps status → tone via `includes()` substring matching | **Replace** — substring matching gives wrong tones: `OVERSTOCK` contains `stock` → *success*; `AT CAPACITY` matches nothing → *info*. Correctness depends on rule order, not meaning |

Data inconsistencies to fix when converting to seed: `SKU-10001` and `SKU-10045` both have exactly 2,450 units; the Inventory table has `AVAILABLE` but no `ON HAND`, so reserved/damaged cannot be reconciled; order `ORD-10432` is `CANCELLED` in Orders but has shipment `SHP-2046` in Shipping; `SHP-*` IDs are used for both inbound and outbound shipments.

## 7. Existing APIs

**None.** No `HttpClient`, no API base URL, no interceptors, no contracts.

## 8. Existing backend

**None.** No Java, Spring, Maven or any server code.

## 9. Existing dependencies (installed, verified)

| Package | Declared | Installed | Notes |
|---|---|---|---|
| `@angular/*` | `^14.2.0` | **14.3.0** | Last Angular 14 minor. Out of Google LTS since Nov 2023 — see risks. |
| `@angular/cli`, `@angular-devkit/build-angular` | `^14.2.0` | 14.2.13 | Ships **webpack 5.76.1**. |
| `typescript` | `~4.7.2` | 4.7.4 | Angular 14.2+ accepts `>=4.6 <4.9`. |
| `rxjs` | `~7.5.0` | 7.5.7 | Within `@angular/core` peer range `^6.5.3 \|\| ^7.4.0`. |
| `zone.js` | `^0.12.0` | 0.12.0 | Within peer range `~0.11.4 \|\| ~0.12.0`. |
| `@types/node` | `^16.18.126` | 16.18.126 | Matches Node 16. |
| `@angular/router`, `@angular/animations` | installed | — | Installed but unused. |

Runtime toolchain on the dev machine: Node **16.20.2**, npm 8.19.4, JDK 21 and JDK 24 present (`java` on PATH is 24), **no Maven**, Docker present, PostgreSQL 18 present.

`npm ls` reports an extraneous `__ngcc_entry_points__.json` (an ngcc artefact; harmless).

## 10. Existing database

**None.**

## 11. Existing design system

There is no design system, only one global stylesheet:

- 540 mostly one-line rules, ~49 KB source / 43.5 KB built.
- **0 CSS custom properties.** Every colour is a literal hex repeated across rules.
- 87 `border-radius` declarations with many different values; 12 box-shadows; 2 gradients; 3 keyframe animations.
- Only **4 `:focus` rules** — most interactive elements have no visible focus state.
- 10 `@media` blocks at 450/600/760/800/900/1200 px, defined per screen, not per system breakpoint. On phones the sidebar becomes a 62 px icon rail: the desktop layout shrunk, not a handheld design.
- Fonts loaded through `@import` from Google Fonts: render-blocking, external dependency, and two display families.

The **palette** (`#081525` nav, `#287bd4` primary, `#16855c` success, `#e8a453` warning, `#c53b46` danger, `#f6f8fb` ground) is sound and becomes the seed for design tokens.

## 12. Reusable code

| Item | Classification | Reason |
|---|---|---|
| Navigation taxonomy (Workspace vs Manage, 16 destinations) | **KEEP** | Correct domain grouping; maps cleanly to MFE boundaries. |
| Page descriptions (`PAGE_DESCRIPTIONS`) | **KEEP** | Good product copy. |
| Seed-quality business data | **KEEP → migrate** | Becomes `V900__dev_seed.sql` (dev/QA profiles only). |
| Colour palette, table density, status-badge concept, page-header pattern | **KEEP → tokenize** | Becomes `@wms/design-system` tokens. |
| Warehouse detail tab structure (Overview/Inventory/Zones/Bins/Orders/Activity/Performance) | **KEEP (as UX)** | Right information architecture for a facility page. |
| Permission matrix shape (module × view/create/edit/delete/approve) | **REFACTOR** | Right idea; becomes a server-owned permission catalogue (`inventory:adjust`, `order:cancel`, …). |
| Status → tone mapping | **REBUILD** | Replace substring matching with explicit enum → tone maps per domain. |

## 13. Code that should be refactored

Refactoring is only worthwhile where the idea is right and the implementation can be moved forward in steps:

- **Page header, KPI strip, table controls, status badge, empty state markup** → extract into design-system components with inputs and a11y.
- **`Login` form UX** (error banner, show-password, inline validation) → rebuild with Reactive Forms against the real `/api/v1/auth/login`, keep the layout.
- **Warehouse table/search** → keep columns; move search/sort/paging to the server.

## 14. Code that should be retired

| Item | Classification | Reason |
|---|---|---|
| `src/main.ts` / `src/app.module.ts` role inversion, eager `NgModule` | **REBUILD** | Replaced by the shell application. |
| `activePage` + `ngSwitch` navigation | **REMOVE** | Replaced by the Router and federated routes. |
| `window` CustomEvents + `document.querySelector` + `as any` method calls | **REMOVE** | Not testable, leaks listeners, and is **currently broken** (see below). |
| `ModuleTable` (one table for 11 domains) | **REBUILD** | Every domain has different columns, actions, filters and workflows. A generic string-keyed table cannot express "Allocate", "Start pick" or "Confirm receipt". |
| `Dashboard` literals, SVG path, inline bar heights | **REBUILD** | Must be driven by `/api/v1/dashboard/*` aggregates. |
| `Modal` | **REMOVE** | Dead code; replaced by a CDK-based accessible dialog. |
| `global_styles.css` | **REBUILD** | Replaced by tokens + component styles; kept in archive as visual reference. |
| `.bolt/config.json` | **REMOVE** | Generator metadata. |
| `netlify.toml` | **REMOVE** | Wrong output path (see section 15); deployment moves to containers. |

**Confirmed defect (code reading):** clicking **View** on any warehouse opens Mumbai. `App` sets `detailWarehouseCode` and immediately calls `document.querySelector('app-warehouse-detail')`, but that element is created by `*ngIf` only on the *next* change-detection pass, so the query returns `null`, `setWarehouseCode` is never called, and the component keeps its default `'WH-MUM-001'`.

## 15. Security issues

| # | Issue | Severity in a real deployment |
|---|---|---|
| S1 | Authentication is cosmetic: `loggedIn = true` at start, login accepts any password ≥ 6 chars, and the page advertises "Demo credentials: any password". | Critical |
| S2 | No authorization. Every screen, including Users & Roles and Security settings, is reachable by anyone. | Critical |
| S3 | Security policy (2FA, session timeout, IP allowlist) is configured in client-side constants. Security policy must be server-owned. | High |
| S4 | `Modal` binds `[innerHTML]`. Angular sanitizes it, but it invites future XSS if fed server data or `bypassSecurityTrust*`. | Low (dead code) |
| S5 | Google Fonts `@import`: third-party request on every page load; blocks a strict CSP. | Low |
| S6 | Angular 14 and Node 16 no longer receive security fixes (see PROJECT_AUDIT §17). | Medium, structural |
| S7 | No security headers (CSP, HSTS, X-Content-Type-Options, frame-ancestors) — Netlify config sets none. | Medium |
| S8 | `netlify.toml` publishes `dist/demo/browser`, but the Angular 14 browser builder writes to `dist/demo` (verified after build). The configured deployment would serve nothing. | Operational |

No secrets, tokens or credentials were found in the repository.

## 16. Performance issues

Measured production build (`ng build`, 2026-09-25):

| Chunk | Raw | Transfer (est.) |
|---|---|---|
| main | 229.63 kB | 57.11 kB |
| polyfills | 45.08 kB | 13.84 kB |
| styles | 43.48 kB | 7.82 kB |
| runtime | 0.9 kB | 0.5 kB |
| **Initial total** | **319.07 kB** | **79.27 kB** |

The bundle is small today because there is no real code. The problems are structural, and they grow with data volume:

- **Methods called from templates under default change detection.** `ModuleTable.filteredRows()` runs a full filter and is called 3+ times per cycle; `headings()` is called once per row *and* per cell. With 20 real rows × 8 columns that is hundreds of calls per keystroke or mouse move.
- **No `trackBy`** on any `*ngFor`; any data refresh re-creates every row.
- **Everything eagerly loaded** in one module: all 11 pages ship on first paint.
- **Client-side search over the full dataset**, fake pagination, no server paging. Unusable at 10,000 SKUs.
- **Render-blocking font `@import`** inside the global CSS.

## 17. Architecture issues

1. No separation between presentation, state, domain logic and data access.
2. No routing; application state is invisible in the URL.
3. Global event bus via `window` in place of DI and contracts.
4. One generic table for every domain; workflows cannot be expressed.
5. No environment configuration; nothing is externalizable.
6. `strict: false` hides nullability bugs (e.g. `warehouse?.name` everywhere).
7. No tests, lint, CI or build per environment.
8. Status values are free strings (`'IN PROGRESS'`, `'In Stock'`, `'Active'`, `'ACTIVE'` all appear); there is no state model.

## 18. Microfrontend migration strategy (summary)

The full plan is in [MIGRATION_PLAN.md](MIGRATION_PLAN.md) and [MICROFRONTEND.md](MICROFRONTEND.md). In short:

1. **Strangler, not a rewrite-in-place.** Build a new Angular 14 workspace at `/frontend` alongside the prototype. The prototype stays at the repo root and stays runnable for side-by-side UX comparison.
2. **Shell first, then one remote** (`wms-warehouse`) to prove Module Federation, runtime manifest, auth and the design system end to end.
3. **One domain at a time.** Each prototype screen is replaced by an API-backed remote; its prototype counterpart is marked *superseded* in the migration table.
4. **Archive when all screens are superseded:** `git mv` the prototype to `/archive/prototype/`, keeping it buildable for one release, then delete it in a tracked story.

### Classification summary

| Area | KEEP | REFACTOR | REBUILD | REMOVE |
|---|:-:|:-:|:-:|:-:|
| Navigation taxonomy & copy | ● | | | |
| Visual palette & density | ● | | | |
| Seed data | ● (as SQL seed) | | | |
| Login screen | | ● | | |
| Page header / badges / empty states | | ● | | |
| Shell & navigation mechanics | | | ● | |
| Dashboard | | | ● | |
| Warehouse list/detail | | | ● | |
| ModuleTable & 11 module pages | | | ● | |
| Users & Roles, Settings | | | ● | |
| Global stylesheet | | | ● | |
| `Modal`, window events, `.bolt`, `netlify.toml` | | | | ● |
