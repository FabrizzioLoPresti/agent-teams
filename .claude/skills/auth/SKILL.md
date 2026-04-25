---
name: auth
description: >
  Authentication patterns for alta-cancha-fs. Use this skill whenever you need to protect an oRPC procedure, protect a route/page, check auth state in a component, access the current user or session, implement role-based access control, or add any new authentication behavior. Covers the full stack: oRPC middleware, TanStack Start route middleware, and client-side hooks. Always use this skill before writing any code that touches auth, sessions, users, or protected resources.
---

# Authentication in alta-cancha-fs

**Stack:** Better Auth + oRPC + TanStack Start. Auth is always validated server-side via headers/cookies.

---

## oRPC Procedures

### Choosing a middleware

| Use case | Middleware |
|---|---|
| Protected endpoint (requires login) | `authorizedMiddleware` |
| Public endpoint | `baseInputValidationMiddleware` |

```typescript
import { authorizedMiddleware } from '@/orpc/middlewares/auth'
import { baseInputValidationMiddleware } from '@/orpc/middlewares/input-validation'
```

### Protected procedure — pattern

```typescript
export const myProcedure = authorizedMiddleware
  .input(MyInputSchema)
  .output(MyOutputSchema)
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id
    const userRole = context.user.role // 'user' | 'customerComplex' | 'ownerComplex'

    // Ownership check example
    const resource = await prisma.myResource.findUnique({ where: { id: input.id } })
    if (!resource) throw errors.NOT_FOUND()
    if (resource.ownerId !== userId) throw errors.FORBIDDEN()

    // ...
  })
```

### Public procedure — pattern

```typescript
export const myPublicProcedure = baseInputValidationMiddleware
  .input(MyInputSchema)
  .output(MyOutputSchema)
  .handler(async ({ input, errors }) => {
    // No context.user here
  })
```

### Available error codes (throw via `errors.*`)

`UNAUTHORIZED` · `FORBIDDEN` · `NOT_FOUND` · `CONFLICT` · `BAD_REQUEST` · `INTERNAL_SERVER_ERROR`

### Context shape (only available after `authorizedMiddleware`)

```typescript
context.user    // { id, email, name, username, image, role, ... }
context.session // { id, userId, expiresAt, token, ... }
```

---

## Route / Page Protection

Use the TanStack Start `authMiddleware` in the route's `server.middleware` array. Apply it at the **layout route** to protect all child routes at once.

```typescript
// src/routes/_owners/dashboard/route.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { authMiddleware } from '@/middlewares/auth'

export const Route = createFileRoute('/_owners/dashboard')({
  component: RouteComponent,
  server: {
    middleware: [authMiddleware], // redirects to /auth/login if no session
  },
})
```

`src/middlewares/auth.ts` redirects to `/auth/login` when there is no session. No extra configuration needed.

---

## Client-Side Auth State

Use `authClient.useSession()` to read session state in components. Exported from `src/lib/auth/auth-client.ts`.

```typescript
import { authClient } from '@/lib/auth/auth-client'
// or use the named export:
import { useSession } from '@/lib/auth/auth-client'

const { data: session, isPending } = authClient.useSession()

if (isPending) return <Spinner />

if (!session?.user) {
  // not logged in
}

const role = session.user.role // 'user' | 'customerComplex' | 'ownerComplex'
```

For role constants, import from `src/config/auth.ts`:

```typescript
import { ROLES } from '@/config/auth.ts'

if (session.user.role === ROLES.OWNER_COMPLEX) { /* ... */ }
```

---

## Roles

| Constant | String value | Who |
|---|---|---|
| `ROLES.USER` | `'user'` | Generic authenticated user |
| `ROLES.CUSTOMER_COMPLEX` | `'customerComplex'` | Customer booking fields |
| `ROLES.OWNER_COMPLEX` | `'ownerComplex'` | Complex/field owner |

Role is set at registration and cannot be changed by the user.

---

## Key files

| File | Purpose |
|---|---|
| `src/orpc/middlewares/auth.ts` | `authMiddleware` + `authorizedMiddleware` (oRPC) |
| `src/orpc/middlewares/base.ts` | `base` — error codes and base context type |
| `src/orpc/middlewares/input-validation.ts` | `baseInputValidationMiddleware` |
| `src/middlewares/auth.ts` | Route-level `authMiddleware` (TanStack Start) |
| `src/lib/auth/auth.ts` | Better Auth server instance |
| `src/lib/auth/auth-client.ts` | `authClient`, `useSession`, `signIn`, `signUp` |
| `src/lib/auth/permissions.ts` | Access control roles and statements |
| `src/config/auth.ts` | `ROLES` enum |
