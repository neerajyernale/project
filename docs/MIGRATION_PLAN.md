# WMS360 — Prototype Migration Plan

Approach: **strangler**. The new system is built in `/frontend` and `/backend`. The prototype stays at the repository root, untouched and runnable (`npm start` at root), as a side-by-side UX reference until everything below is superseded.

## 1. Rules

1. Do not edit prototype files. Bugs found in the prototype are fixed only in the replacement.
2. A prototype screen is **superseded** only when its replacement:
   - is served by the shell through Module Federation,
   - reads and writes through `/api/v1` (no constants),
   - implements every page state (loading / empty / no-results / error / forbidden / offline),
   - has passing unit tests and is covered by at least one E2E path,
   - has been reviewed side by side against the prototype for UX regressions.
3. Seed data is migrated once, into `backend/src/main/resources/db/seed/`, and loaded only under the `seed` profile.

## 2. Phases

| Phase | When | Outcome |
|---|---|---|
| P0 — Coexist | Sprint 0 | New workspaces added next to the prototype; root `package.json` unchanged |
| P1 — Prove | Sprint 2 | Shell + `wms-warehouse` live; the prototype is still the reference for everything else |
| P2 — Replace | Sprints 3–12 | One domain per sprint moves to "superseded" in §3 |
| P3 — Archive | After the last row is superseded | `git mv` prototype files to `/archive/prototype/`; delete `.bolt/` and `netlify.toml`; root becomes a thin workspace README |
| P4 — Remove | One release after P3 | Delete `/archive/prototype/` in a tracked story (history remains in git) |

## 3. Screen migration table

| Prototype screen | Replacement | Sprint | Status |
|---|---|---|---|
| Login | shell `/login` + `auth` module | 1–2 | Built on mock API |
| App shell / nav / popovers | `shell` | 2 | Built on mock API |
| Warehouses list | `wms-warehouse` | 2–3 | Built on mock API |
| Warehouse detail (7 tabs) | `wms-warehouse` (+ links to inventory/fulfillment) | 3 | Built on mock API |
| Products, Suppliers, Customers | `wms-catalog` | 4 | Built on mock API |
| Inventory | `wms-inventory` | 5 | Built on mock API |
| Stock Transfers | `wms-inventory` | 10 | Built on mock API |
| Inbound | `wms-inbound` | 6 | Built on mock API |
| Orders, Outbound | `wms-fulfillment` | 7 | Built on mock API |
| Picking | `wms-fulfillment` | 8 | Built on mock API |
| Packing, Shipping | `wms-fulfillment` | 9 | Built on mock API |
| Reports | `wms-reports` | 11 | Built on mock API |
| Dashboard | `wms-dashboard` | 11 | Built on mock API |
| Users & Roles | `wms-admin` | 1 (API) / 12 (UI) | Built on mock API |
| Settings | `wms-admin` | 12 | Built on mock API |
| Notifications popover | shell + `notification` module | 12 | Built on mock API |

Status 2026-09-26: every screen is built in `/frontend` against the in-browser mock of `/api/v1` (see `frontend/README.md`), served by the shell through Module Federation from the 8 remotes, and covered by browser suites (workflows, role matrix, federation, accessibility). None is **superseded** yet: the rule in §1 also requires the real API.

## 4. Seed data conversion

| Prototype constant | Target | Corrections needed |
|---|---|---|
| `WAREHOUSES` + zones | `warehouse`, `zone` rows; bins generated per zone | Capacity as numeric m² plus unit; status as enum |
| `PAGE_DATA.Products` | `product` | Brand/category become reference tables |
| `PAGE_DATA.Inventory` + detail `invData` | `inventory_balance` **built from** `inventory_movement` seed rows | Add `on_hand`; make reserved/damaged reconcile |
| Orders / Picking / Packing / Shipping | orders with lines, and derived tasks | Fix `ORD-10432` (cancelled but shipped); separate inbound `ASN-*` from outbound `SHP-*` IDs |
| Suppliers, Customers | `supplier`, `customer` | — |
| `USERS`, `ROLES`, `PERMISSION_MATRIX` | seed tenant roles and a permission catalogue | Per-role matrices (prototype has one matrix for all roles) |

Dashboard KPIs, trends and sparklines are **not** migrated. They are computed from the seeded transactions.

## 5. Visual reference

The directive refers to a supplied screenshot. None is attached to this conversation, and there is none in the repository. Until it is added (proposed location: `docs/reference/dashboard-reference.png`), the running prototype is the visual reference. The design system keeps the prototype's palette, density and navigation structure, and drops the patterns listed in PROTOTYPE_AUDIT §1 that make it read as generated.
