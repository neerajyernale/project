# ADR-002 — Spring Boot 3.5 / Java 21 modular monolith

**Status:** Proposed · **Date:** 2026-09-25

## Context
There is no backend. WMS workflows (receive → reserve → pick → ship) need ACID transactions across what would otherwise be separate services. Team size and current load don't justify distributed operations. Tooling on the dev machine: JDK 21 and JDK 24 (24 on PATH), no Maven.

Spring Boot lines on Maven Central (checked 2026-09-25): 3.4.13 (releases stopped), **3.5.16 (still receiving patches)**, 4.0.8, 4.1.1 (newest).

## Decision
- **One deployable Spring Boot 3.5.x application on Java 21 (LTS).**
- Modules as top-level packages with a public `api` package; boundaries verified by **Spring Modulith** tests and ArchUnit.
- Maven Wrapper (`mvnw`) committed; `maven.compiler.release=21`; CI and containers use Temurin 21.
- Boot-managed versions for Hibernate, Flyway, Jackson, Testcontainers. Explicit versions only for springdoc 2.x and MapStruct.

**Gate (Sprint 0, WMS-104):** confirm the 3.5 OSS support end date on spring.io. If it ends before the planned production release, adopt **4.0.x** instead, before domain code exists.

## Alternatives considered
- *Microservices per domain:* rejected. Distributed transactions for inventory, and much more operational load, with no measured scaling need.
- *Spring Boot 4.1:* newest line; excluded by the "no blind newest" rule until the ecosystem (springdoc, Modulith) has settled.
- *Java 24:* non-LTS and out of support.

## Consequences
- Any module can be extracted later along its `api` package and events.
- Stateless instances scale horizontally behind a load balancer; session state lives only in tokens and PostgreSQL.
