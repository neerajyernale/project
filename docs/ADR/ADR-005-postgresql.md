# ADR-005 — PostgreSQL 16 with Flyway

**Status:** Proposed · **Date:** 2026-09-25

## Context
Inventory needs transactional integrity, CHECK constraints, generated columns and reliable row locking. PostgreSQL 18 is installed locally, but dev/CI/prod parity requires one pinned version.

## Decision
- **PostgreSQL 16** (image `postgres:16-alpine`) for local Compose, Testcontainers and production.
- Flyway (Boot-managed version) owns the schema; `spring.jpa.hibernate.ddl-auto=validate` in every profile.
- Normalised schema; FKs, unique and CHECK constraints; audit columns and `version` on every table. Indexes are added for known query patterns and reviewed with `EXPLAIN ANALYZE`, not by default.
- Migrations are forward-only; destructive changes use expand/contract across two releases.

## Alternatives considered
- *PostgreSQL 17/18:* reasonable, but 16 has the widest managed-service and Flyway support today. Upgrading later is a routine operation.
- *Hibernate auto-DDL:* rejected for anything beyond throwaway spikes.

## Consequences
- The local PostgreSQL 18 install is not used; developers run the Compose database.
- Backup: managed PITR in production; a restore drill is part of Sprint 15.
