# WMS360 — Microfrontend Architecture

Status: **Proposed** (Sprint 0; built in Sprint 2). Decisions: [ADR-003](ADR/ADR-003-microfrontend-boundaries.md), [ADR-004](ADR/ADR-004-module-federation.md).

## 1. Toolchain (verified 2026-09-25)

| Piece | Version | Why this version |
|---|---|---|
| Angular | 14.3.0 | Locked (ADR-001) |
| webpack | 5.76.1 | Bundled by `@angular-devkit/build-angular` 14.2.13; Module Federation is a webpack 5 core feature |
| `@angular-architects/module-federation` | **14.3.14 (exact)** | Last 14.x release. 14.3.13 declares peer `rxjs ~6.6.3` and conflicts with our RxJS 7.5; 14.3.14 relaxed this to `rxjs >=6.6.3`, `@angular/core >=14.1.1` |
| `@angular-architects/module-federation-runtime` | 14.3.14 (exact) | Pulled by the above; must match |
| `ngx-build-plus` | 14.0.0 | Custom builder that lets Angular 14 CLI accept a `webpack.config.js`; peer `@angular-devkit/build-angular >=12` |

Newer lines (15+ of the plugin, Native Federation) target newer Angular and are **not** used.

## 2. Domain boundaries

| Remote | Routes (from prototype nav) | Backend modules | Why it is one unit |
|---|---|---|---|
| `wms-dashboard` | `/dashboard` | reporting (read) | Read-only operational overview |
| `wms-warehouse` | `/warehouses`, `/warehouses/:id/{overview,zones,locations,…}` | warehouse | Facility configuration; changes rarely; owned by ops admins |
| `wms-catalog` | `/products`, `/suppliers`, `/customers` | catalog | Master data with the same list/edit/import patterns |
| `wms-inventory` | `/inventory`, `/inventory/movements`, `/inventory/adjustments`, `/transfers` | inventory | Stock truth. Transfers move stock between balances, so they belong with stock |
| `wms-inbound` | `/inbound`, `/inbound/:id/receive`, `/putaway` | inbound | Receiving is its own flow, with handheld-first screens |
| `wms-fulfillment` | `/orders`, `/picking`, `/packing`, `/shipping` (prototype "Outbound" becomes a filtered orders view) | fulfillment | One order lifecycle. Splitting it would make four apps share order state |
| `wms-reports` | `/reports`, `/reports/:id` | reporting | Heavy (charts, exports); loaded rarely |
| `wms-admin` | `/admin/users`, `/admin/roles`, `/admin/audit`, `/settings` | identity, tenant, audit | Security-sensitive; different release cadence and reviewers |

The shell owns `/login`, `/forbidden`, `/not-found`, `/unavailable`, and the layout.

### Why eight and not eleven

The directive suggests `wms-products`, `wms-orders`, `wms-outbound` and `wms-operations` as separate remotes. Picking, packing and shipping have no meaning without their order, and "outbound" in the prototype is the same order table filtered by stage. Four remotes there would mean four deployables sharing one aggregate, which is the tight coupling the directive tells us to avoid. If fulfillment's handheld operator screens later need a different release cadence, `wms-operations` can be split out of `wms-fulfillment`, because its routes are already grouped under their own lazy module.

## 3. How loading works

```
index.html
  └─ main.ts
       ├─ fetch /config/app-config.json     (API URL, env name, feature flags)
       ├─ loadManifest('/config/mf.manifest.json')
       └─ import('./bootstrap')              ← Angular bootstraps only after config is known
shell router
  { path: 'inventory',
    loadChildren: () => loadRemoteModule({ type: 'manifest', remoteName: 'inventory', exposedModule: './Module' })
                          .then(m => m.InventoryModule),
    canLoad: [AuthGuard, PermissionGuard('inventory:view')] }
```

- Each remote exposes **one NgModule** (`./Module`) with `RouterModule.forChild(...)`. Standalone components and route-array exposure were developer preview in Angular 14, so they are not used as the federation contract.
- A remote's `remoteEntry.js` is fetched only when its route is first activated, so no remote code is on the critical path of the login page or the dashboard.
- If a remote fails to load (network error or missing manifest entry), a route-level error handler shows `/unavailable?module=inventory` with Retry. The shell and the other remotes keep working.

### Runtime manifest (no hardcoded URLs)

`/config/mf.manifest.json` is rendered at container start from environment variables:

```json
{
  "dashboard":   "https://app.example.com/mfe/dashboard/1.4.0/remoteEntry.js",
  "warehouse":   "https://app.example.com/mfe/warehouse/1.2.3/remoteEntry.js",
  "inventory":   "https://app.example.com/mfe/inventory/2.0.1/remoteEntry.js"
}
```

Putting the version in the path makes rollback a manifest change. `remoteEntry.js` is served `Cache-Control: no-cache`; hashed chunks are served `immutable`.

## 4. Shared dependencies

Runtime stability comes before bundle savings (directive §7), so the list is explicit rather than `shareAll()`.

| Package | singleton | strictVersion | Reason |
|---|:-:|:-:|---|
| `@angular/core`, `common`, `common/http`, `router`, `forms`, `platform-browser`, `animations` | ✔ | ✔ | Two copies of Angular mean two injectors and two zones, which breaks DI, change detection and routing. A version mismatch must fail loudly at load time, not misbehave later |
| `@angular/cdk` | ✔ | ✔ | Overlay containers and FocusTrap stacks must be global; otherwise dialogs from two remotes overlap wrongly |
| `rxjs` | ✔ | ✘ (`requiredVersion: ^7.5.0`) | Observables cross the shell/remote boundary (`AuthSession.user$`). Sharing avoids duplicate code; any 7.x is interoperable, so strict pinning is not needed |
| `@wms/core` (workspace lib, via `sharedMappings`) | ✔ | ✔ | Holds the **one** `AuthSession`, `AppConfig` and `Telemetry` instance. A second copy would give a remote an empty session |
| `@wms/design-system` (workspace lib, via `sharedMappings`) | ✔ | ✘ | One copy of tokens and components. Kept backward-compatible within a major (additive changes only), so a remote built against 1.3 runs against shell 1.5 |
| `@wms/contracts` | — | — | Types only; erased at compile time |
| Charting library (if adopted) | ✘ | — | Used only by dashboard/reports; not shared, so other remotes don't pay for it |

`zone.js` is loaded once, by the shell's polyfills only. Remotes must not include it.

## 5. Contracts between shell and remotes

Remotes may depend on:

1. **URLs.** Navigate with `router.navigate(['/inventory'], { queryParams: { sku } })`.
2. **`@wms/core` public API**, versioned:
   - `AuthSession`: `user$`, `hasPermission(p)`, `activeWarehouse$`. Read-only to remotes; only the shell can log in or out.
   - `AppConfig`: `apiBaseUrl`, `environment`, feature flags.
   - `NotificationService`: toasts rendered by the shell.
   - `Telemetry`: `trackError`, `trackEvent`.
   - `ShellEvents`: typed stream for the few cross-cutting signals (`warehouseChanged`, `sessionExpired`).
3. **`@wms/design-system` components.**

Remotes must **not**: import another remote; read `window`/`localStorage` for session data; dispatch `window` CustomEvents (the prototype's pattern); ship global CSS; register root-level providers that `@wms/core` already provides.

The shell provides `HttpClient` and its interceptors once, at the root injector. Remotes import `HttpClientModule` nowhere. That means every call gets auth, correlation and error handling, with no need for each team to remember it.

## 6. Styling isolation

- Design tokens are CSS custom properties defined once by the shell (`--wms-color-*`, `--wms-space-*`, `--wms-radius-*`, `--wms-font-*`).
- Remotes use component-scoped styles (emulated encapsulation) and tokens only; no global selectors, no literal hex values (enforced by stylelint).

## 7. Independent lifecycle

| Concern | How |
|---|---|
| Build | `ng build mfe-inventory` builds one project; CI uses path filters so changing `projects/mfe-inventory/**` builds and tests only that remote (plus the shell smoke test) |
| Test | Each remote has a standalone dev bootstrap (`ng serve mfe-inventory`) with a mocked `AuthSession`, so it runs without the shell |
| Version | Each project has its own `package.json` version; the container tag = that version |
| Deploy | One image per remote, published under `/mfe/<name>/<version>/` |
| Roll back | Point the manifest entry back at the previous version; no rebuild |
| Break-glass | Shared libs changing incompatibly (major) require a coordinated release; this is documented and rare by design |

## 8. Local development ports

| Project | Port |
|---|---|
| shell | 4200 |
| mfe-dashboard | 4201 |
| mfe-warehouse | 4202 |
| mfe-catalog | 4203 |
| mfe-inventory | 4204 |
| mfe-inbound | 4205 |
| mfe-fulfillment | 4206 |
| mfe-reports | 4207 |
| mfe-admin | 4208 |

`npm start` starts the shell and all remotes, or the shell and the remotes you list (`npm start -- inventory admin`); unlisted remotes show as unavailable. Once a shared DEV environment exists, the local manifest can point unlisted remotes at it. Remote dev servers run with live reload off: their reload client, loaded into the shell page, would reload the whole app each time a remote loads.

Implementation notes (built 2026-09-26): the shell uses its own loader (`src/app/federation/remote-loader.ts`) because `loadRemoteModule()` in module-federation-runtime 14.3.14 does not await the container's `init()`; the shared list is written against webpack's `ModuleFederationPlugin` directly (`frontend/federation.webpack.js`) because the `withModuleFederationPlugin()` helper overwrites the singleton settings of path-mapped libraries.

## 9. Rollout order

1. Sprint 2: shell, `@wms/core`, `@wms/design-system`, **`wms-warehouse`**. This proves the loader, manifest, shared singletons, auth propagation, independent deploy and rollback before more remotes exist.
2. Then one remote per domain sprint, in the order of [PROJECT_AUDIT.md §20](PROJECT_AUDIT.md#20-implementation-roadmap).
