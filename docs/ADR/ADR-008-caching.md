# ADR-008 — In-process caching first, Redis on a defined trigger

**Status:** Proposed · **Date:** 2026-09-25

## Context
Some data is read on almost every request (permissions, warehouse configuration); other data must never be stale (inventory balances).

## Decision
- Spring Cache with **Caffeine** (in-process) for: permission sets (5 min, evicted on role events), warehouse/location reference data (10 min, evicted on write), dashboard aggregates (30–60 s TTL, shown as "as of hh:mm").
- **Inventory balances, reservations and order state are never cached.**
- Every cache has a named owner module, a TTL, an eviction event and a metric (hit ratio via Micrometer).

**Redis trigger:** add Redis when the backend runs more than one instance **and** a feature needs shared ephemeral state that PostgreSQL handles poorly. The expected first cases are rate-limit buckets and access-token deny-lists. The ADR that introduces it must cite the measurement.

## Alternatives considered
- *Redis from day one:* one more stateful component to secure, back up and monitor, before any measured need.

## Consequences
- With multiple instances, in-process caches can diverge until TTL or eviction. That is acceptable for the data listed above; eviction events go through the outbox (ADR-009), so every instance receives them.
