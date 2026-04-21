# ADR-005: API Layer — ORPC

**Status:** Accepted
**Date:** 2026
**Area:** Client-server communication

---

## Context

The platform needs a communication layer between the React frontend and server logic that satisfies:

- End-to-end type safety (server types are automatically inferred on the client)
- Input validation with Zod (same schemas for frontend and backend)
- Compatible with TanStack Query for caching and loading/error states
- Isomorphic SSR support (same call works on server and client)
- Middleware chain for cross-cutting concerns (auth, validation, errors)
- No additional code generation or build steps

Alternatives evaluated: **REST + OpenAPI**, **GraphQL + Apollo**, **tRPC**, **ORPC**.

---

## Decision

Use **ORPC** with an isomorphic client and native TanStack Query integration.

---

## Why It's the Right Choice

### 1. Real type safety without code generation

ORPC infers client types directly from the server definition:

```typescript
// Server defines the handler with types
export const addBooking = authorizedMiddleware
  .input(CreateBookingInputSchema)   // Zod schema
  .output(createApiResponseSchema(BookingResponseSchema))
  .handler(async ({ input, context }) => { ... })

// Client uses it with full types, no intermediate steps
const result = await orpc.addBooking.call({ fieldId: '...' })
// result is automatically typed from BookingResponseSchema
```

With REST + OpenAPI, client types are generated from the spec and synchronization must be maintained manually. With GraphQL, there is a code generation step (`codegen`).

### 2. Native isomorphic client

```typescript
const getORPCClient = createIsomorphicFn()
  .server(() => createRouterClient(router, { context: getRequestHeaders() }))
  .client(() => createORPCClient(new RPCLink({ url: '/api/rpc' })))
```

In SSR, `createRouterClient` invokes handlers as local functions — no HTTP. On the client, `RPCLink` serializes via fetch. The same fetching code works in both environments. With tRPC, this integration exists but requires more configuration and has limitations with TanStack Start.

### 3. Composable middleware chain

ORPC has a middleware system that enriches the context at each layer:

```
base (context: Headers + error catalog)
  └─> inputValidation (Zod error formatting)
        └─> authMiddleware (adds session + user to context)
              └─> handler (accesses context.user directly)
```

This is more explicit and composable than Express middlewares or Apollo HOCs. Each middleware is a pure function that can be tested independently.

### 4. First-class TanStack Query integration

```typescript
export const orpc = createTanstackQueryUtils(client)

// In components:
const { data } = orpc.getComplexById.useQuery({ id: complexId })
const { mutate } = orpc.addBooking.useMutation()
```

`createTanstackQueryUtils` automatically generates `useQuery`, `useMutation`, `queryKey`, and `prefetch` from the router definition. No manual query key boilerplate or response typing needed.

### 5. Typed error catalog

Errors are defined in `base.ts` and are type-safe in handlers:

```typescript
throw errors.CONFLICT({ message: 'A booking already exists for that time slot' })
throw errors.NOT_FOUND({ message: 'Field not found' })
```

The client knows exactly which errors each endpoint can return. With REST, errors are strings or codes with no type information.

---

## Why Not the Alternatives

**REST + OpenAPI:** No compile-time type safety between client and server. Synchronization between implementation and spec is manual and prone to drift. For an app with a single client (this frontend), the OpenAPI overhead adds no value.

**GraphQL + Apollo:** Overkill for this use case. GraphQL shines when there are multiple clients with different needs or when external consumers need query flexibility. The operational complexity (schema, resolvers, N+1 problem, cache normalization) is not justified.

**tRPC:** The conceptual predecessor of ORPC. ORPC addresses tRPC's limitations: better isomorphic SSR support, more expressive middleware chain, first-class TanStack Query integration, and Zod 4 compatibility. Migration from tRPC to ORPC is relatively straightforward if ever needed.

---

## Accepted Trade-offs

| Aspect                                  | Impact                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| Smaller ecosystem than GraphQL/REST     | Less external tooling (API clients, auto-generated docs)              |
| No standard public endpoint             | The API is not consumable by third parties without an ORPC client     |
| Coupling to the TanStack ecosystem      | Switching from TanStack Query would require rewriting the data hooks  |

If a public API for third parties (mobile apps from other teams) is needed in the future, an additional REST/OpenAPI layer can be added on top of the same handlers. ORPC does not replace REST for public APIs.

---

## Consequences

- Endpoints are in `src/orpc/router/`
- Zod validation schemas are in `src/orpc/schemas/`
- The HTTP entry point is `src/routes/api.rpc.$.ts` (TanStack Router catchall)
- Data hooks using the client are in `src/data/`
- All public system endpoints go through this router (no ad-hoc REST endpoints)
