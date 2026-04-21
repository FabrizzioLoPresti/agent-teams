---
name: authentication
description: Implement authentication in alta-cancha-fs using Better-Auth. Use whenever adding a protected route, reading session data in a component, adding auth guards or ownership checks to ORPC handlers, or wiring sign-in/sign-up/sign-out flows. Also use when configuring RBAC roles, setting up role-based redirects, or debugging session/auth errors.
argument-hint: "[scenario: protected-route | session | handler-guard | auth-flow]"
---

# authentication

Implement **Better-Auth** authentication patterns for alta-cancha-fs. There are two separate auth instances that must never be mixed.

| Instance | File | Where to use |
|----------|------|--------------|
| Server | `@/lib/auth/auth.ts` | ORPC middlewares, server middleware only |
| Client | `@/lib/auth/auth-client.ts` | Components and client-side code only |

## Roles

```typescript
// src/config/auth.ts
export enum ROLES {
  USER = 'user',
  CUSTOMER_COMPLEX = 'customerComplex',
  OWNER_COMPLEX = 'ownerComplex',
}
```

| Role | Access |
|------|--------|
| `user` | No protected routes |
| `customerComplex` | `/search` — court search and booking |
| `ownerComplex` | `/dashboard`, `/profile` — complex/court management |

Roles are assigned **at registration** and cannot be changed from the client.

---

## Pattern 1: Protecting a route (server middleware)

Protected routes use server middleware in the layout's `route.tsx`. The shared middleware is in `src/middlewares/auth.ts` — import it, don't redefine.

```typescript
// src/routes/_owners/dashboard/route.tsx
import { createFileRoute } from '@tanstack/react-router'
import { authMiddleware } from '@/middlewares/auth'

export const Route = createFileRoute('/_owners/dashboard')({
  component: RouteComponent,
  server: {
    middleware: [authMiddleware],  // runs on server during SSR; redirects if no session
  },
})
```

The middleware itself:

```typescript
// src/middlewares/auth.ts
import { createMiddleware, getRequestHeaders } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { auth } from '@/lib/auth/auth'

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) throw redirect({ to: '/auth/login' })
  return await next()
})
```

---

## Pattern 2: Reading session in a component

```typescript
import { useSession } from '@/lib/auth/auth-client'

const MyComponent = () => {
  const { data: session, isPending } = useSession()

  if (isPending) return <Skeleton />
  if (!session) return null

  const role = session.user.role   // 'customerComplex' | 'ownerComplex' | 'user'
  const userId = session.user.id

  return <div>Hello, {session.user.name}</div>
}
```

Never call `auth.api.getSession()` in a component — that's server-only.

---

## Pattern 3: Auth guard in an ORPC handler

All protected handlers use `authorizedMiddleware`. It verifies the session and injects `context.user` and `context.session`.

```typescript
import { authorizedMiddleware } from '@/orpc/middlewares/auth'

export const updateField = authorizedMiddleware
  .input(UpdateFieldInputSchema)
  .output(createApiResponseSchema(UpdateFieldResponseSchema))
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id  // guaranteed — no need to null-check

    // Always verify the resource belongs to this user
    const field = await prisma.field.findUnique({
      where: { id: input.id },
      include: { complex: true },
    })
    if (!field) throw errors.NOT_FOUND({ message: 'Court not found' })
    if (field.complex.ownerId !== userId) {
      throw errors.FORBIDDEN({ message: 'You do not have permission' })
    }

    // ... proceed with update
  })
```

---

## Pattern 4: Auth actions (sign-in, sign-up, sign-out)

```typescript
import { signIn, signUp, authClient } from '@/lib/auth/auth-client'
import { getAuthErrorMessage } from '@/utils/auth'

// Sign in by username
await signIn.username({
  username: data.username,
  password: data.password,
  callbackURL: '/dashboard',
  fetchOptions: {
    onError: (ctx) => toast.error(getAuthErrorMessage(ctx.error)),
  },
})

// Email sign up — accountType is required, registration fails without it
await signUp.email({
  email: data.email,
  password: data.password,
  name: data.username,
  username: data.username,
  accountType: data.role,  // 'customerComplex' | 'ownerComplex'
  callbackURL: '/auth/verify-email',
  fetchOptions: {
    onError: (ctx) => toast.error(getAuthErrorMessage(ctx.error)),
  },
})

// OAuth sign in (Google)
await signIn.social({
  provider: 'google',
  callbackURL: '/auth/verify-email',
  requestSignUp: true,
  fetchOptions: { body: { accountType: 'ownerComplex' } },
})

// Sign out
await authClient.signOut({
  fetchOptions: { onSuccess: () => navigate({ to: '/' }) },
})
```

Error codes are translated via `getAuthErrorMessage(ctx.error)` from `src/utils/auth.ts`.

---

## Checklist

- [ ] Protected routes apply `authMiddleware` from `@/middlewares/auth` via `server.middleware`
- [ ] Protected ORPC handlers use `authorizedMiddleware`, not `base` or `baseInputValidationMiddleware`
- [ ] Every mutation handler has an ownership check (`resource.ownerId !== context.user.id` → FORBIDDEN)
- [ ] Components read session via `useSession()` from `@/lib/auth/auth-client`
- [ ] Sign-up always passes `accountType` (`'customerComplex'` or `'ownerComplex'`)
- [ ] Auth errors handled with `getAuthErrorMessage(ctx.error)` in `fetchOptions.onError`
- [ ] Server `auth` instance never imported in components
- [ ] Role checks never done on the client to protect routes — always server middleware
