# ADR-002: Database — PostgreSQL 16 + Prisma 7 + PrismaPg

**Status:** Accepted
**Date:** 2026
**Area:** Persistence

---

## Context

The platform needs a database that supports:

- Complex relational data (Complex → Field → Schedule → Booking → Payment → Refund)
- Geographic searches (complexes by proximity using lat/lng coordinates and GeoJSON)
- ACID transactions to guarantee consistency in concurrent bookings
- Decimal precision for financial amounts
- Timestamps with timezone (`Timestamptz`) for correct UTC handling
- JSONB for storing semi-structured data (priceBreakdown, processorResponse)
- ORM with type safety and managed migrations

Alternatives evaluated: **MySQL**, **SQLite**, **MongoDB**, **PlanetScale**.

---

## Decision

Use **PostgreSQL 16** as the database, **Prisma 7** as the ORM, and **PrismaPg** as the native driver adapter.

---

## Why It's the Right Choice

### PostgreSQL

**1. Native Timestamptz**
PostgreSQL stores `TIMESTAMPTZ` internally in UTC and converts at the presentation layer. Critical for the booking system where timestamps must be absolute moments independent of the complex's timezone. MySQL has limited support for timezone-aware timestamps.

**2. JSONB with indexing**
`priceBreakdown` and `processorResponse` are stored as JSONB. Unlike JSON, JSONB is indexed and allows queries within the field. Useful for financial auditing without needing an additional table.

**3. Robust ACID transactions**
Booking conflict detection uses `$transaction` with the default isolation level. PostgreSQL has one of the best MVCC (Multi-Version Concurrency Control) implementations among open-source databases.

**4. Native `Decimal(10,2)`**
PostgreSQL supports the `NUMERIC`/`DECIMAL` type without floating-point errors. Essential for financial calculations (`baseAmount * taxRate`).

**5. Composite and partial indexes**
Domain query patterns require complex composite indexes (e.g., `[fieldId, status, startDateTime, endDateTime]` for availability). PostgreSQL has the most advanced query optimizer among open-source options.

### Prisma 7

**1. Type safety generated from the schema**
The `.prisma` schema is the source of truth. Prisma generates TypeScript types used throughout the application. Changing the schema and forgetting to update a query is a compile error, not a runtime one.

**2. Declarative migrations**
`pnpm db:migrate` generates migration SQL from schema diffs. The migration history in `prisma/migrations/` is audited in git.

**3. Prisma Studio**
Visual interface for exploring and editing data in development (`pnpm db:studio`). Useful for debugging without needing an external SQL client.

**4. Typed relations and selects**
Prisma's nested `select` (e.g., `field.complex.timezone`) are fully typed. The inferred result excludes non-selected fields, preventing accidental access to `undefined`.

### PrismaPg (Native Driver)

Prisma supports two connection modes: the classic JavaScript client (based on libSQL) and PrismaPg (native PostgreSQL driver via `pg`). PrismaPg was chosen for:

- **Performance**: The native driver is significantly faster for workloads with many concurrent queries
- **Connection pooling**: Better connection management in SSR environments (multiple simultaneous requests)
- **Full PostgreSQL type compatibility**: `Timestamptz`, native arrays, geometric types

---

## Accepted Trade-offs

| Aspect                                              | Impact                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| No advanced full-text search                        | Complex name search uses `ILIKE`. If it scales, add Elasticsearch                                           |
| Geographic search without PostGIS                   | Currently using lat/lng + index. If complex spatial queries are needed, add the PostGIS extension           |
| Prisma doesn't support all PostgreSQL features      | Materialized views and complex triggers require raw SQL migrations                                          |

---

## Consequences

- The generated client is in `generated/prisma/client` (not in `node_modules`)
- Always run `pnpm db:generate` after modifying `prisma/schema.prisma`
- Production migrations must be run with `pnpm db:migrate` (never `db:push` in prod)
- PostgreSQL and Redis run via `docker-compose.yml` in local development
