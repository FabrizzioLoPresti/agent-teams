# ADR-012: Divisible Fields Model — Self-Relation on Field

**Status:** Accepted
**Date:** 2026
**Area:** Field domain

---

## Context

Many sports complexes offer fields that can be used in two ways:

- **Full**: An 11-a-side soccer field (or large futsal court) used by two complete teams
- **Split**: The same physical field divided into two independent halves, each with its own goal and players

This is a real business feature: the owner wants to rent out half a field during low-demand hours. But the constraints are complex:

- If the full field (FULL) is booked, neither half can be booked
- If half A (HALF_A) is booked, the full field cannot be booked (but half B can)
- If both halves are booked, the owner may want to display the field as "occupied" at the FULL level

Alternatives evaluated for modeling this:

1. **Separate `FieldDivision` table** with FK to Field
2. **Self-relation on Field** with `parentFieldId`
3. **Flags on Field** without an explicit relation (only `fieldType`)
4. **Two distinct entities** `FullField` and `HalfField`

---

## Decision

Use a **self-relation on `Field`** with `parentFieldId`, `fieldType: FieldType (FULL | HALF_A | HALF_B)`, and `isDividable: Boolean`.

```prisma
model Field {
  fieldType     FieldType @default(FULL)
  isDividable   Boolean   @default(false)

  parentFieldId String?
  parentField   Field?  @relation("FieldToSubFields", fields: [parentFieldId], references: [id])
  subFields     Field[] @relation("FieldToSubFields")
}
```

---

## Why It's the Right Choice

### 1. A single model, no additional tables

All three variants (standalone FULL, divisible FULL, HALF) are instances of `Field`. They share the same schedule schema (`FieldWorkingSchedule`), prices (`PriceSlot`), images (`FieldImage`), and bookings (`Booking`). Adding a separate `FieldDivision` table would duplicate the scheduling and pricing logic.

### 2. Clear validations in the schema

Domain invariants are documented in the schema:

```prisma
// Validation: If isDividable=true, must have subFields
//             If HALF_A/HALF_B, must have parentFieldId
```

Although Prisma cannot enforce these validations at the DB level, the handler code verifies them. The schema communicates the intent.

### 3. Simple conflict detection with `IN` clause

The conflict logic is computed in memory with already-loaded IDs, and executed with a single predicate:

```typescript
// If FULL (divisible): check FULL + both halves
conflictFieldIds = [field.id, ...field.subFields.map((sf) => sf.id)]

// If HALF: check HALF + FULL parent (not the other half)
conflictFieldIds = [field.id, field.parentFieldId]

// A single query to detect conflicts
tx.booking.findFirst({
  where: {
    fieldId: { in: conflictFieldIds },
    // ... rest of the overlap filter
  },
})
```

With a separate `FieldDivision` table, this JOIN would be more complex.

### 4. `subFields` and `parentField` included in the initial query

The `addBooking` query loads the field with its subfields and parent in a single operation:

```typescript
prisma.field.findUnique({
  where: { id: input.fieldId },
  select: {
    subFields: { where: { isActive: true }, select: { id: true } },
    parentField: { select: { id: true, subFields: { select: { id: true } } } },
    // ...
  },
})
```

Everything needed to compute `conflictFieldIds` is obtained in a single query, with no N+1.

---

## Domain Invariants

The model is only correct when these rules are respected:

| Rule                                                              | Implementation                              |
| ----------------------------------------------------------------- | ------------------------------------------- |
| FULL with `isDividable=true` must have exactly 2 subfields        | Validate when creating/activating HALF_A and HALF_B |
| HALF_A and HALF_B must have the same `parentFieldId`              | Self-relation FK in Prisma                  |
| A HALF can only point to a FULL (not to another HALF)             | Validation in handler                       |
| Booking a HALF blocks the FULL but not the other HALF             | Logic in `conflictFieldIds`                 |
| Booking a FULL blocks both HALFs                                  | Logic in `conflictFieldIds`                 |

### Booking HALF_A when HALF_B is already booked

```
FULL [id: "full-1"]
├── HALF_A [id: "half-a"] ← user wants to book this
└── HALF_B [id: "half-b"] ← ALREADY BOOKED

conflictFieldIds for HALF_A = ["half-a", "full-1"]  (does not include "half-b")
→ findFirst where fieldId IN ["half-a", "full-1"] → no conflict
→ HALF_A booking created ✓
→ Both halves are now booked; FULL cannot be booked
```

---

## Why Not the Alternatives

**Separate `FieldDivision` table:** Adds an extra JOIN to every availability query. Subfields would need to duplicate schedule and pricing configuration (or inherit it, creating another level of complexity). The self-relation is more direct.

**Only flags without a relation:** Without `parentFieldId`, navigating from HALF to its FULL parent efficiently is not possible. An extra `findFirst` would be needed searching `WHERE fieldType = 'FULL' AND complexId = ?` — ambiguous if there are multiple FULLs in the same complex.

**Two distinct entities `FullField`/`HalfField`:** Duplicates the entire model. `FieldWorkingSchedule`, `PriceSlot`, `Booking`, and `FieldImage` would all need to be duplicated. The schema would triple in complexity.

---

## Accepted Trade-offs

| Aspect                                           | Impact                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Invariants are not enforced by the DB            | Application code must validate them; a bug can leave the model in an invalid state           |
| Limited relation depth                           | Only one level of division (a HALF cannot be split into quarters)                            |
| `isDividable` is redundant with having subfields | Must be kept in sync when creating/removing subfields                                        |

The one-level limitation is intentional — the real business domain does not need fields subdivided into more than two halves.

---

## Consequences

- When creating a complex with a divisible field, first create the FULL with `isDividable=true`, then create HALF_A and HALF_B with `parentFieldId = full.id`
- When deactivating (`isActive=false`) a divisible FULL, consider whether the HALFs should also be deactivated
- The `@@index([parentFieldId, fieldType])` indexes speed up subfield lookups by parent
- The `conflictFieldIds` logic is centralized in the `addBooking` and `getBookingsListByFieldId` handlers — any new availability query must replicate this logic
