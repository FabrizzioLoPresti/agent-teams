# ADR-010: Booking Concurrency — Transaction with Conflict Detection

**Status:** Accepted
**Date:** 2026
**Area:** Booking domain and data integrity

---

## Context

Field bookings are a scarce resource with a high probability of contention: during peak hours (Friday at 8 PM, all day Saturday), multiple users may attempt to book the same slot simultaneously.

The classic concurrency problem:

1. User A checks availability for the Friday 20:00–21:00 slot → available
2. User B checks availability for the same slot → available
3. User A creates the booking → ok
4. User B creates the booking → **should fail, but without a control mechanism it can be inserted**

This would result in two bookings for the same slot — an invalid domain state.

Alternatives considered: **Pessimistic locking (SELECT FOR UPDATE)**, **Serializable isolation level**, **Optimistic locking with version field**, **Conflict detection in $transaction (current pattern)**.

---

## Decision

Use **conflict detection inside a Prisma transaction** (`$transaction`): `findFirst` to search for an overlapping booking + `create` to insert, all within a transaction. The `version` field on Booking exists for future optimistic locking needs on updates.

---

## Why It's the Right Choice

### The implemented pattern

```typescript
const booking = await prisma.$transaction(async (tx) => {
  // Step 1: Find conflict with range overlap
  const conflictingBooking = await tx.booking.findFirst({
    where: {
      fieldId: { in: conflictFieldIds },
      status: { in: ['CONFIRMED', 'COMPLETED', 'PENDING'] },
      startDateTime: { lt: input.endDateTime },  // start1 < end2
      endDateTime:   { gt: input.startDateTime }, // end1 > start2
    },
  })

  if (conflictingBooking) {
    throw errors.CONFLICT({ message: 'A booking already exists for that time slot' })
  }

  // Step 2: Create booking (only if no conflict)
  return await tx.booking.create({ data: { ... } })
})
```

**Why it works:** PostgreSQL guarantees that within `$transaction`, no other transaction can insert a booking that causes a conflict between the `findFirst` and the `create`. The default isolation level (Read Committed) combined with the `@@unique([fieldId, startDateTime])` constraint in the schema is sufficient to prevent exact duplicates.

### Overlap detection with interval logic

The condition `startDateTime < new_endDateTime AND endDateTime > new_startDateTime` is the correct formula for detecting any overlap between two time intervals, including partial cases:

```
Existing:    |-------|
New (A):          |-------|  → start < existing.end AND end > existing.start ✓
New (B):  |-----|            → start < existing.end AND end > existing.start ✓
New (C):              |---| → start >= existing.end → NO conflict ✓
New (D): |---------------|   → start < existing.end AND end > existing.start ✓
```

### Divisible fields: the set of IDs to check

For FULL fields with subfields, the conflict is computed in memory:

- Booking FULL: check `[FULL_id, HALF_A_id, HALF_B_id]`
- Booking HALF_A: check `[HALF_A_id, FULL_parent_id]` (not HALF_B: the two halves do NOT block each other)

This prevents the case where one user books HALF_A while another books the full FULL field.

### Why Not Pessimistic Locking (`SELECT FOR UPDATE`)

`SELECT FOR UPDATE` locks the row for the duration of the transaction. The problem:

- If thousands of concurrent requests are checking availability, they all block the same rows → severe performance degradation
- Availability read operations (without creating a booking) also block → unacceptable for the search page

### Why Not Serializable Isolation

Serializable guarantees that concurrent transactions produce the same result as if they ran sequentially. But:

- CPU and I/O cost is significantly higher (PostgreSQL must track all accesses to detect serializable conflicts)
- Transactions fail with `ERROR: could not serialize access due to concurrent update` and the application must retry — more complex than receiving a business CONFLICT error

For the booking use case, explicit conflict detection inside `$transaction` with the default isolation level is sufficient and more efficient.

---

## The `version` Field on Booking

The schema includes `version: Int @default(1)` on Booking. It is not currently used in the creation flow, but is prepared for **optimistic locking on updates**:

```typescript
// Future pattern for updating a booking
const updated = await prisma.booking.update({
  where: { id: bookingId, version: currentVersion }, // Fails if someone updated first
  data: { status: 'CANCELLED', version: { increment: 1 } },
})

if (!updated)
  throw errors.CONFLICT({
    message: 'The booking was concurrently modified',
  })
```

This prevents the "lost update" problem when two admins update the same booking simultaneously.

---

## Accepted Trade-offs

| Aspect                                               | Impact                                                                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A user may receive CONFLICT (409)                    | Must retry or choose another slot; acceptable UX for bookings                                              |
| The transaction does not prevent all race conditions | Under extreme load (thousands of users/second on the same slot), issues may escalate to the database level |
| `version` is not yet being used                      | Minor technical debt; the field exists, the update logic is pending                                        |

---

## Consequences

- Every booking creation flow must use `$transaction` with the conflict detection logic
- The `@@unique([fieldId, startDateTime])` index in the schema acts as the last line of defense against exact duplicate insertions (same field, same startDateTime)
- The `@@index([fieldId, status, startDateTime, endDateTime])` indexes speed up the conflict detection query
- Future Booking status updates must increment `version` to prevent lost updates
- Integration tests must include concurrency scenarios for the same slot
