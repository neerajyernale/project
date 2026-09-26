# ADR-009 — Transactional outbox, no message broker

**Status:** Proposed · **Date:** 2026-09-25

## Context
Notifications, audit enrichment, report/export generation, read-model refresh and future carrier callbacks should not add latency to, or break, the transaction that triggered them. Every consumer runs inside the monolith today.

## Decision
- Domain events are published in the same transaction as the state change and recorded by the **Spring Modulith event publication registry** (PostgreSQL-backed outbox).
- Listeners are `@ApplicationModuleListener` (async, after commit). Incomplete publications are retried on restart and on a schedule; after N failures they stay in the registry as a queryable dead-letter set, with an alert.
- Every listener is **idempotent**, keyed by event ID, because at-least-once delivery means duplicates.
- Long jobs (exports, scheduled reports) use a `job` table with status, progress, and a result file in object storage.

**Broker trigger:** introduce Kafka (or similar) only when a consumer runs outside this deployable, or measured event volume exceeds what the outbox can handle. That ADR must define event schemas and versioning, the idempotency key, the retry and DLQ policy, and the tracing.

## Alternatives considered
- *Kafka now:* no external consumers; adds a cluster to operate.
- *Plain `@Async` without outbox:* events are lost when the process crashes between commit and dispatch.

## Consequences
- Event payloads are versioned DTOs in each module's `api` package; they become the contract if a module is extracted.
