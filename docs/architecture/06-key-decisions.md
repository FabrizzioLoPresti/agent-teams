# 6. Key Architectural Decisions

Summary of the most important decisions. Each has a detailed ADR in [`docs/decisions/`](../decisions/).

## ADR-001: Local Times in Schedules, UTC in Bookings

**Context:** Complexes operate in specific timezones. Operating schedules must reflect local time regardless of DST changes. Bookings must be unambiguous absolute moments in time.

**Decision:** `FieldWorkingSchedule.openTime`/`closeTime` and `PriceSlot.startTime`/`endTime` are stored as `HH:MM` strings in local time. `Booking.startDateTime`/`endDateTime` are stored as `Timestamptz` (UTC). `Complex.timezone` is used for conversion with `date-fns-tz` (`toZonedTime`).

**Rationale:** A schedule of "08:00" always means 8 AM local time, regardless of DST. A booking "2026-03-22T11:00:00Z" is a unique moment in time. Mixing both would cause data corruption during time transitions.

**Consequences:** Every booking creation must convert between local and UTC. The presentation layer must also convert for display. In return, all temporal ambiguity is eliminated.

→ [Detailed ADR](../decisions/008-timezone-scheduling.md)

---

## ADR-002: Isomorphic ORPC Instead of REST/GraphQL

**Context:** Type-safe client-server communication with SSR support is required.

**Decision:** ORPC with `createIsomorphicFn` — direct function calls on the server, RPC link on the client.

**Rationale:** End-to-end type safety from Zod schema to React component. SSR calls avoid HTTP overhead. A single codebase for both environments. The middleware pattern (`base → validation → auth`) provides clean separation of concerns.

**Consequences:** Coupling to the ORPC ecosystem. However, the abstraction via data hooks in `src/data/` allows changing the transport without affecting components.

→ [Detailed ADR](../decisions/005-api-layer.md)

---

## ADR-003: Divisible Fields with Self-Relation

**Context:** Some fields can be split (e.g., an 11-a-side soccer field into two 5-a-side fields).

**Decision:** Self-reference on `Field` with `parentFieldId`. FULL is the parent; HALF_A/HALF_B are children.

**Rationale:** Avoids separate tables. Conflict detection is straightforward: compute IDs in memory and query with a single `IN` clause inside the transaction.

**Consequences:** Queries must resolve the field graph (parent + children) before checking availability. Resolved in memory after a single query with a nested `select`.

→ [Detailed ADR](../decisions/012-divisible-fields-model.md)

---

## ADR-004: Optimistic Locking on Booking

**Context:** Concurrent booking attempts for the same time slot.

**Decision:** `version` field on Booking + conflict check inside `$transaction`.

**Rationale:** PostgreSQL serializable isolation is expensive. The `findFirst` (check conflict) + `create` (insert) pattern within a transaction provides sufficient safety for the booking use case.

**Consequences:** Under extreme concurrency, a user receives a CONFLICT (409) error and must retry. An acceptable UX tradeoff.

→ [Detailed ADR](../decisions/010-booking-concurrency.md)

---

## ADR-005: Decimal Precision for Financial Amounts

**Context:** Financial calculations must not have floating-point errors.

**Decision:** `Decimal(10,2)` in PostgreSQL, Prisma runtime `Decimal` class in TypeScript.

**Rationale:** Avoids the classic `0.1 + 0.2 !== 0.3`. Tax calculations (`baseAmount * TAX_RATE`) use Decimal arithmetic (`new Decimal(BOOKING_TAX_RATE)`, `.mul()`, `.add()`).

**Consequences:** Requires explicit conversion (`.toNumber()`) when serializing to JSON. All financial math must use Decimal operations.

→ [Detailed ADR](../decisions/011-financial-precision.md)

---

## ADR-006: Soft Deletes on Complex

**Context:** Deleting a complex must preserve booking history for legal and financial records.

**Decision:** `deletedAt`/`deletedBy` fields instead of physical DELETE. Composite index `[isActive, deletedAt]` for efficient filtering.

**Rationale:** Bookings reference complex fields via `fieldId`. A hard delete would cascade and destroy completed financial transaction records.

**Consequences:** All complex queries must filter `deletedAt IS NULL`. The composite index ensures no performance penalty.

→ [Detailed ADR](../decisions/009-soft-deletes.md)

---

← [Auth](./05-auth.md) | [Index](./README.md) | [Infrastructure →](./07-infrastructure.md)
