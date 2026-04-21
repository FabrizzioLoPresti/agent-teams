# ADR-009: Soft Deletes on Complex

**Status:** Accepted
**Date:** 2026
**Area:** Domain and data integrity

---

## Context

Complex owners may want to "delete" a complex from the platform. However, a complex's data is deeply referenced throughout the system:

```
Complex → Field → Booking → Payment → Refund
                          → Review
```

A completed (`COMPLETED`) or paid booking has financial and legal implications. The record must exist indefinitely for:

- **Financial auditing**: processed payments must retain their context (which field, which complex, which owner)
- **Dispute resolution**: if a user claims a refund for a past booking, the complex must exist as a reference
- **Tax compliance**: transaction records must be retained according to local law (Argentina: 10 years for accounting records)

The problem: using `DELETE` with CASCADE in PostgreSQL would destroy the entire chain — Fields, Bookings, Payments, Refunds, Reviews. Avoiding the cascade leaves broken references (orphaned records).

---

## Decision

Use **soft delete** on the `Complex` model: fields `deletedAt: DateTime?` and `deletedBy: String?` (userId of the actor who performed the deletion). The `isActive: Boolean` field controls operational visibility.

---

## Why It's the Right Choice

### 1. Complete history preservation

A complex with `deletedAt != null` still exists in the database with all its relations intact. Past bookings, payments, and reviews remain accessible for auditing.

### 2. Audit trail of who deleted

`deletedBy: String` stores the userId of the actor who performed the deletion (the owner or an admin). If there is a dispute about a deletion, there is traceability.

### 3. Recovery possible (undeletion)

A soft delete can be reversed: `UPDATE complex SET deletedAt = NULL, deletedBy = NULL WHERE id = ?`. A hard delete is irreversible. In cases of user error or business reactivation, recovery is trivial.

### 4. Indexes optimized for common queries

```prisma
@@index([isActive, deletedAt])
@@index([ownerId, deletedAt])
```

The composite index `[isActive, deletedAt]` allows `WHERE isActive = true AND deletedAt IS NULL` to use an index scan instead of a sequential scan. The combination ensures that queries for "live" complexes are efficient even with millions of records.

---

## Why Not Hard Delete with Constraints

**Option 1: Hard delete with ON DELETE CASCADE**
Destroys the financial history. Unacceptable for legal and auditing reasons.

**Option 2: Hard delete without cascade (SET NULL)**
Leaves orphaned records. Bookings end up with `field.complexId = NULL`, losing the complex context. Revenue reports and metrics become incomplete.

**Option 3: Archive to a historical table**
Move the complex and its children to `_archived` tables before deleting. More complex to implement (requires cloning 6 related tables), and foreign key IDs in Bookings no longer point to the correct table.

Soft delete is the simplest solution that preserves complete referential integrity.

---

## Difference Between `isActive` and `deletedAt`

The two fields have distinct and complementary purposes:

| Field       | Purpose                                                  | Who changes it                                                    |
| ----------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `isActive`  | The complex is currently operational (can take bookings) | The owner (can pause/reactivate)                                  |
| `deletedAt` | The complex was removed from the platform                | Only admin or the owner; irreversible in UX but reversible in DB  |

A complex can have `isActive = false` (temporarily closed for holidays) without being deleted. A deleted complex always has `isActive = false`, but not vice versa.

---

## Accepted Trade-offs

| Aspect                                              | Impact                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| All queries must filter `deletedAt IS NULL`         | If forgotten, "deleted" complexes will appear               |
| Database grows with "dead" records                  | Requires a long-term archiving strategy                     |
| `SELECT COUNT(*)` includes deleted records unfiltered | "Total complexes" reports must be careful with filters    |

The risk of forgetting the filter is mitigated by convention: every complex listing query in production always includes `WHERE deleted_at IS NULL`. A Prisma middleware that applies it automatically can be added if the problem scales.

---

## Consequences

- Every public or owner listing query must filter: `{ deletedAt: null }` in Prisma
- Admin queries (history, auditing) may omit the filter to see deleted records
- The deletion endpoint must set `deletedAt = now()`, `deletedBy = userId`, `isActive = false`
- Soft delete does not apply to other models (Field, Booking, etc.): if a field is deleted, its future bookings must be explicitly cancelled first
- `deletedBy` stores the actor's userId for auditing
