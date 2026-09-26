# ADR-007 — Shared-schema multi-tenancy

**Status:** Proposed · **Date:** 2026-09-25

## Context
Multiple organisations share the platform; cross-tenant access must be impossible, not merely filtered in the UI.

## Decision
- **Shared database, shared schema, `tenant_id` on every tenant-owned table.**
- Tenant is resolved **only** from the authenticated token (`tid`), never from a client header or parameter.
- Hibernate 6 `@TenantId` on entities plus `CurrentTenantIdentifierResolver` apply the discriminator to all JPQL and Criteria queries.
- Native SQL is allowed only in `infrastructure` packages and must bind `tenant_id` (ArchUnit rule + review checklist).
- Unique constraints are tenant-scoped: `UNIQUE (tenant_id, sku)`, `UNIQUE (tenant_id, code)`.
- A dedicated integration suite creates two tenants and asserts that every endpoint returns 404 (not 403, to avoid leaking existence) for the other tenant's IDs.
- Hardening (Sprint 13): PostgreSQL row-level security policies keyed on `current_setting('app.tenant_id')`, set with `SET LOCAL` per transaction.

## Alternatives considered
- *Schema per tenant:* stronger isolation, but migrations run N times and connection pools multiply. Kept as an option for a customer who contractually requires it.
- *Database per tenant:* highest isolation and cost; reserved for dedicated deployments.

## Consequences
- Every index intended for tenant queries leads with `tenant_id`.
- Background jobs must set the tenant context explicitly; a job without a tenant context fails closed.
