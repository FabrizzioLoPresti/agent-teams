# 4. End-to-End Data Flow

## Example: Customer Creates a Booking

```mermaid
sequenceDiagram
    participant UI as Component
    participant Hook as useAddBooking
    participant Client as ORPC Client
    participant Val as Input Validation MW
    participant Auth as Auth MW
    participant Handler as addBooking Handler
    participant DB as PostgreSQL

    UI->>Hook: submit({ fieldId, startDateTime, endDateTime, duration })
    Hook->>Client: orpc.addBooking.call(input)

    alt SSR (server)
        Client->>Handler: direct call (no HTTP)
    else Client-side (browser)
        Client->>Val: fetch POST /api/rpc
    end

    Val->>Val: Validate Zod schema (CreateBookingInputSchema)
    Val->>Auth: valid input
    Auth->>Auth: getSession via Better-Auth (Redis cache / PostgreSQL)
    Auth->>Handler: context = { session, user, headers }

    Handler->>DB: Query 1 - Get field + schedules + priceSlots + subFields
    Handler->>Handler: Calculate conflictFieldIds (in memory)
    Handler->>Handler: Convert UTC to local (date-fns-tz)
    Handler->>Handler: Find day schedule + priceSlot
    Handler->>Handler: Calculate price with Decimal (base + tax)

    Handler->>DB: $transaction start
    DB->>Handler: Lock
    Handler->>DB: findFirst - search conflict in conflictFieldIds
    alt No conflict
        Handler->>DB: create booking (status: CONFIRMED)
        DB->>Handler: booking created
    else Conflict found
        Handler-->>UI: Error CONFLICT (409)
    end
    Handler->>DB: $transaction commit

    Handler-->>UI: { message, status: 201, data: booking }
    Hook->>Hook: TanStack Query invalidates cache
    UI->>UI: Re-render with new booking
```

## Isomorphic Client

The key pattern that enables efficient SSR:

```typescript
// src/orpc/client.ts
const getORPCClient = createIsomorphicFn()
  .server(() => createRouterClient(router, { context: getRequestHeaders() }))
  .client(() => createORPCClient(new RPCLink({ url: '/api/rpc' })))
```

- **On server (SSR):** `createRouterClient` invokes handlers directly as functions, with no HTTP overhead. This is critical for first-load performance.
- **On client (browser):** `RPCLink` serializes the call and sends it as a fetch POST to `/api/rpc`.

Both paths share the same types and schemas, guaranteeing end-to-end type safety.

## Middleware Chain

```mermaid
flowchart LR
    Base["base\n(context: Headers)\n(error catalog)"]
    Val["inputValidation\n(Zod error → flattenError)\n(422 INPUT_VALIDATION_FAILED)"]
    Auth["authMiddleware\n(Better-Auth getSession)\n(context += session, user)"]
    Handler["Handler\n(business logic)"]

    Base --> Val --> Auth --> Handler

    style Base fill:#e1e5f2,stroke:#333
    style Val fill:#f0e6cc,stroke:#333
    style Auth fill:#d4edda,stroke:#333
    style Handler fill:#f8d7da,stroke:#333
```

**Composition:**

1. `base` — Defines the context type (`{ headers: Headers }`) and the error catalog (UNAUTHORIZED, BAD_REQUEST, NOT_FOUND, CONFLICT, FORBIDDEN, etc.)
2. `baseInputValidationMiddleware` — Intercepts Zod validation errors and reformats them with `z.flattenError()` for form-friendly responses
3. `authMiddleware` — Retrieves the session via `auth.api.getSession()` (checks Redis cache first, then PostgreSQL) and adds `session` + `user` to the context
4. `authorizedMiddleware` = `baseInputValidationMiddleware.use(authMiddleware)` — The final composition for protected endpoints

---

← [Layers](./03-layers.md) | [Index](./README.md) | [Auth →](./05-auth.md)
