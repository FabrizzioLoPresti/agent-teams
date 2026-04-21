# ADR-011: Financial Precision — Decimal(10,2) for Amounts

**Status:** Accepted
**Date:** 2025
**Area:** Financial domain

---

## Context

The system handles monetary amounts in several operations:

- Booking price calculation: `hourlyRate * (duration / 60)`
- Tax: `baseAmount * TAX_RATE` (currently 21%)
- Total: `baseAmount + taxAmount - discountAmount`
- Partial refunds: `totalAmount - refundAmount`

In JavaScript, floating-point numbers (`float`, `number`) follow the IEEE 754 standard. This produces representation errors:

```javascript
0.1 + 0.2 === 0.3 // false → 0.30000000000000004
1200 * 0.21 // 252.00000000000003
```

In a financial system, these errors accumulate and create inconsistencies: the total shown to the user does not match the stored total, revenue reports have phantom cents, and calculated refunds do not sum exactly to the original total.

---

## Decision

Use **`Decimal(10,2)`** in PostgreSQL for all monetary fields and the **`Decimal`** class from `@prisma/client/runtime/client` in TypeScript for all financial arithmetic.

---

## Why It's the Right Choice

### PostgreSQL `NUMERIC`/`DECIMAL` is exact

Unlike `FLOAT` or `DOUBLE PRECISION`, PostgreSQL `DECIMAL(10,2)` stores the exact number as a fixed-precision decimal. `252.00` is stored and retrieved as `252.00`, never as `251.99999999999997`.

The `(10, 2)` specification means:

- 10 total digits
- 2 digits after the decimal point
- Maximum: `99,999,999.99` (sufficient for ARS, USD, EUR values)

### Prisma's `Decimal` class for arithmetic

Prisma uses the `Decimal` class (based on `decimal.js`) to represent PostgreSQL `Decimal` fields in TypeScript:

```typescript
import { Decimal } from '@prisma/client/runtime/client'

const TAX_RATE = new Decimal(BOOKING_TAX_RATE) // exact 0.21
const hourlyRateDecimal = new Decimal(priceSlot.hourlyRate)

// Exact arithmetic
const baseAmount = hourlyRateDecimal.mul(durationInHours) // no float errors
const taxAmount = baseAmount.mul(TAX_RATE) // 252.00, not 252.00000000000003
const total = baseAmount.add(taxAmount)
```

### Why Not JavaScript `number`

```typescript
// BAD: float arithmetic
const base = 1200 * (90 / 60) // 1800
const tax = 1800 * 0.21 // 378.00000000000006 ← error
const total = 1800 + 378.00000000000006 // 2178.00000000000006

// Stored in DB as 2178.00 (PostgreSQL rounds on insert into DECIMAL(10,2))
// But the JS-calculated total does not match what is stored
// → Inconsistency when comparing totalAmount with baseAmount + taxAmount
```

### Why Not `BigInt` in cents

Another common approach is converting everything to cents and operating with integers (`1200.00 ARS = 120000 cents`). The problem:

- Multiplying `120000 cents * 0.21` still requires floating-point for the tax rate
- The cents↔currency conversion in the presentation layer is verbose and error-prone
- The Prisma schema and API responses become less readable

`Decimal(10,2)` is the standard solution in relational databases for financial amounts and requires no transformations.

---

## Conversion When Serializing

The only trade-off of using `Decimal` is that it is not a native JSON type. When serializing the ORPC response, conversion is required:

```typescript
// In the handler, when building the response:
return {
  baseAmount: booking.baseAmount.toNumber(), // Decimal → number for JSON
  taxAmount: booking.taxAmount.toNumber(),
  totalAmount: booking.totalAmount.toNumber(),
}
```

This conversion to `number` is safe in the presentation context because:

1. The calculation already occurred with Decimal precision
2. The value stored in the DB is exact
3. Representing values with 2 decimal places and up to 8 integer digits as JavaScript `number` has no significant IEEE 754 errors

---

## Affected Schema Fields

```prisma
model Booking {
  baseAmount     Decimal @default(0) @db.Decimal(10, 2)
  discountAmount Decimal @default(0) @db.Decimal(10, 2)
  taxAmount      Decimal @default(0) @db.Decimal(10, 2)
  totalAmount    Decimal             @db.Decimal(10, 2)
}

model Payment {
  amount        Decimal @db.Decimal(10, 2)
  totalRefunded Decimal @default(0) @db.Decimal(10, 2)
}

model Refund {
  amount Decimal @db.Decimal(10, 2)
}
```

The `hourlyRate` field on `PriceSlot` is `Float` (for simplicity in price configuration). It is converted to `Decimal` at the start of the calculation to preserve precision:

```typescript
const hourlyRateDecimal = new Decimal(priceSlot.hourlyRate)
```

---

## Accepted Trade-offs

| Aspect                                   | Impact                                                             |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `.toNumber()` required when serializing  | An extra step, but explicit and visible                            |
| `Decimal` cannot be compared with `===`  | Use `.equals()` or `.comparedTo()` for comparisons                 |
| `Decimal` is not a native JSON type      | Response Zod schemas use `z.number()` (post-conversion)            |

---

## Consequences

- All financial calculations in handlers must import `Decimal` from `@prisma/client/runtime/client`
- Monetary fields in Prisma explicitly use `@db.Decimal(10, 2)`
- When building JSON responses, convert with `.toNumber()` before returning
- `BOOKING_TAX_RATE` in `src/config/bookings.ts` is a JS `number`; convert to `new Decimal(BOOKING_TAX_RATE)` at the start of each calculation
- Price calculation tests must verify exact precision (no float error margin)
