# ADR-008: Timezone Handling — Local Times in Schedules, UTC in Bookings

**Status:** Accepted
**Date:** 2026
**Area:** Booking and scheduling domain

---

## Context

Sports complexes operate in specific timezones (currently `America/Argentina/Buenos_Aires` by default, but the system must support any IANA timezone). This creates two conceptually distinct categories of time:

1. **Operating hours** (`FieldWorkingSchedule.openTime`, `PriceSlot.startTime`): Express "at what time the field opens in the complex's timezone". These times must not change during DST transitions. If the complex opens at 8 AM, it always opens at 8 AM, regardless of daylight saving time.

2. **Booking moments** (`Booking.startDateTime`, `Booking.endDateTime`): Express "at exactly what point in time the booking starts/ends". A Tuesday 8 AM booking must refer to an unambiguous absolute moment.

The classic mistake is storing everything as timestamps, which causes problems during DST transitions: a Sunday 2:30 AM booking can correspond to two different moments during a "clock change", or a "22:00" schedule time may actually be "23:00 UTC" in winter and "22:00 UTC" in summer.

---

## Decision

- **Schedules and PriceSlots**: store times as `HH:MM` strings in the complex's LOCAL time
- **Bookings and FieldUnavailabilities**: store timestamps as `Timestamptz` (UTC) in PostgreSQL
- **Complex timezone**: stored in `Complex.timezone` as an IANA string (e.g., `"America/Argentina/Buenos_Aires"`)
- **Conversion**: use `date-fns-tz` (`toZonedTime`, `fromZonedTime`) to convert between local and UTC in the booking creation handler

---

## Why It's the Right Choice

### Critical case: DST transition

Argentina currently has no DST, but the system must be correct for future complexes in other zones. Consider a complex in Madrid (CET, UTC+1 in winter, UTC+2 in summer):

**Incorrect scenario (everything as timestamps):**

- Schedule stores: `openTime = 2026-03-01T07:00:00Z` (7 AM UTC = 8 AM CET winter)
- In summer (DST): that same timestamp is now 9 AM CEST
- The complex "shifts" from opening at 8 AM to 9 AM without anyone changing it

**Correct scenario (local strings in schedule):**

- Schedule stores: `openTime = "08:00"` + `Complex.timezone = "Europe/Madrid"`
- At any time of year, "08:00" is 8 AM Madrid time
- Creating an August booking for 8 AM converts: `"08:00"` in `"Europe/Madrid"` = `06:00Z` (UTC+2)
- Creating a January booking for 8 AM converts: `"08:00"` in `"Europe/Madrid"` = `07:00Z` (UTC+1)

### Bookings in UTC: unambiguous absolute moments

A booking is a commitment in real time. "Tuesday at 8 AM" in the context of a booking means exactly one point in time that must not change. Storing it in UTC guarantees:

- The booking `2026-08-04T06:00:00Z` is always the same (8 AM Madrid in August)
- No ambiguity during DST transitions
- PostgreSQL `Timestamptz` stores internally in UTC and can convert to any requested timezone

### Handler implementation

```typescript
// src/orpc/router/booking.ts
const complexTimezone = field.complex.timezone
const localStartTime = toZonedTime(input.startDateTime, complexTimezone)
const dayOfWeek = getDay(localStartTime) // Day of week in local time
const startHour = localStartTime.getHours() // Hour in complex's local time
const startMinute = localStartTime.getMinutes() // Minute in local time

// Find the day's schedule in local time
const schedule = field.fieldWorkingSchedules.find(
  (s) => s.dayOfWeek === DAY_OF_WEEK_VALUES[dayOfWeek],
)
```

The client sends `startDateTime` in UTC. The handler converts to local to validate against schedules (which are local), and stores the booking in UTC.

---

## Why Not the Alternatives

**Store everything in UTC (including schedules):** The DST problem described above. Operating hours "shift" without anyone editing them.

**Store everything in local time (including bookings):** Bookings are ambiguous during DST. "2 AM" can occur twice in one night. Comparing bookings from different complexes in different timezones is impossible without knowing each one's timezone.

**Numeric offset instead of IANA name:** Storing `UTC-3` instead of `"America/Argentina/Buenos_Aires"` does not work because offsets change with DST. The IANA name allows the date library to calculate the correct offset for any date.

---

## Accepted Trade-offs

| Aspect                                   | Impact                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Conversion logic in the handler          | Every booking creation requires conversion; DST edge cases must be tested              |
| UI must convert for display              | UTC timestamps must be converted to the complex's timezone before showing to the user  |
| Schedule validation is in local time     | Comparing `startHour >= openHour` requires local time, not UTC                         |

---

## Consequences

- The `Complex.timezone` field is required for the system to work correctly
- `date-fns-tz` is the library used for conversion (import `toZonedTime`, `fromZonedTime`)
- `openTime`/`closeTime` and `startTime`/`endTime` fields are `"HH:MM"` strings — do not parse directly as Date
- `startDateTime`/`endDateTime` fields on Booking are `Timestamptz` — always UTC in the database
- When displaying a booking to the user, always convert using `toZonedTime(booking.startDateTime, complex.timezone)`
- Booking creation tests must include cases with timezones other than Argentina
