# ADR-003 — Microfrontend boundaries

**Status:** Proposed · **Date:** 2026-09-25

## Context
The directive suggests 11 remotes (dashboard, warehouse, inventory, products, orders, inbound, outbound, operations, reports, admin + shell). The prototype's navigation shows how the screens relate: Outbound is the Orders table filtered by stage; Picking, Packing and Shipping are stages of one order lifecycle; Transfers move stock between inventory balances.

## Decision
Shell plus **eight** remotes: `dashboard`, `warehouse`, `catalog` (products, suppliers, customers), `inventory` (incl. movements, adjustments, transfers), `inbound`, `fulfillment` (orders, outbound, picking, packing, shipping), `reports`, `admin` (users, roles, permissions, settings, audit). Mapping and rationale: [MICROFRONTEND.md §2](../MICROFRONTEND.md#2-domain-boundaries).

## Alternatives considered
- *Directive's 11-remote split:* rejected for fulfillment. Four deployables would share one order aggregate and have to coordinate releases. That defeats independent deployment.
- *One remote per page (16):* rejected; the directive explicitly forbids feature-sized MFEs.
- *Fewer, larger remotes (e.g. "operations" = inbound + fulfillment):* rejected. Inbound and outbound have different users, and different handheld flows.

## Consequences
- Each remote maps to one backend module, so a team owns one vertical slice.
- `wms-operations` can be split out of `wms-fulfillment` later if handheld operator screens need their own cadence. Routes are grouped to allow that.
