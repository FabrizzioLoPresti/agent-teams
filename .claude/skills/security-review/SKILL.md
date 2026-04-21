---
name: security-review
description: Security audit for alta-cancha-fs. Reviews ORPC handlers, routes, and auth flows for missing ownership checks, unprotected endpoints, input validation gaps, and RBAC violations.
argument-hint: "<handler, route, or feature to review>"
---

# security-review

Perform a **structured security audit** of alta-cancha-fs code changes.

## Scope

Focuses on the four main vulnerability areas in this project:

1. **Missing ownership checks** — authenticated user accessing another user's resource
2. **Unprotected endpoints** — handler missing `authorizedMiddleware`
3. **Missing input validation** — handler missing `.input(schema)`
4. **Route protection gaps** — route missing `server.middleware`

## Step-by-step process

### Step 1 — Identify the target

Read the files being reviewed:
- ORPC handlers: `src/orpc/router/[domain].ts`
- Route files: `src/routes/[group]/[route].tsx`
- Auth config: `src/lib/auth/permissions.ts`, `src/config/auth.ts`

### Step 2 — Run the security checklist

#### ORPC Handler Checklist

For each handler in the file:

```
□ Uses authorizedMiddleware (not just base)?
□ Has .input(schema) applied?
□ Has .output(schema) applied?
□ If mutation on owned resource → ownership verified (resource.ownerId === context.user.id)?
□ Uses typed error catalog (errors.NOT_FOUND, etc.) not throw new Error()?
□ No sensitive data in error messages?
□ Sentry span does not log sensitive data?
□ User ID taken from context.user.id (not from input)?
```

#### Route Checklist

For each route in the owner/customer/user groups:

```
□ _owners/ routes have server.middleware: [authMiddleware]?
□ _customers/ routes have server.middleware: [authMiddleware]?
□ _users/ routes have server.middleware: [authMiddleware]?
□ auth/ routes are intentionally public?
□ _general/ routes are intentionally public?
```

#### Auth Flow Checklist

```
□ Sign-up requires accountType (no roleless users)?
□ Role assignment happens in databaseHooks.user.create.before?
□ Client code never imports server auth.ts?
□ Session read via useSession() on client, auth.api.getSession() only on server?
```

### Step 3 — Check for common patterns

**Pattern A — Missing ownership check:**

```typescript
// ❌ VULNERABLE
export const deleteField = authorizedMiddleware
  .input(DeleteFieldInputSchema)
  .handler(async ({ input }) => {
    // No ownership check! Any user can delete any field.
    await prisma.field.delete({ where: { id: input.fieldId } })
  })

// ✅ SECURE
export const deleteField = authorizedMiddleware
  .input(DeleteFieldInputSchema)
  .handler(async ({ input, context, errors }) => {
    const field = await prisma.field.findUnique({
      where: { id: input.fieldId },
      include: { complex: { select: { ownerId: true } } },
    })
    if (!field) throw errors.NOT_FOUND({ message: 'Cancha no encontrada' })
    if (field.complex.ownerId !== context.user.id) {
      throw errors.FORBIDDEN({ message: 'No tenés permisos para eliminar esta cancha' })
    }
    // proceed with delete
  })
```

**Pattern B — Using input user ID instead of session user ID:**

```typescript
// ❌ VULNERABLE — trusting client-supplied userId
.handler(async ({ input, errors }) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: input.userId },  // client can send any userId
  })
})

// ✅ SECURE — use authenticated session
.handler(async ({ input, context, errors }) => {
  const bookings = await prisma.booking.findMany({
    where: { userId: context.user.id },  // from verified session
  })
})
```

**Pattern C — Public endpoint that should be protected:**

```typescript
// ❌ VULNERABLE
export const getMyDashboard = baseInputValidationMiddleware
  .handler(async ({ input }) => { ... })

// ✅ SECURE
export const getMyDashboard = authorizedMiddleware
  .handler(async ({ input, context }) => { ... })
```

**Pattern D — Missing server middleware on protected route:**

```typescript
// ❌ VULNERABLE
export const Route = createFileRoute('/_owners/dashboard')({
  component: DashboardComponent,
  // No server.middleware — SSR renders without auth check
})

// ✅ SECURE
export const Route = createFileRoute('/_owners/dashboard')({
  component: DashboardComponent,
  server: {
    middleware: [authMiddleware],
  },
})
```

### Step 4 — Generate the security report

```markdown
## Security Review: [Target]
**Date:** [date]
**Reviewer:** security-expert

### Summary
[1-2 sentences on overall security posture]

### Critical Issues 🔴
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|
| 1 | `src/orpc/router/field.ts` | 45 | Missing ownership check in `deleteField` | Add `field.complex.ownerId !== context.user.id` check |

### Medium Issues 🟡
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

### Low Issues 🟢
| # | File | Line | Issue | Fix |
|---|------|------|-------|-----|

### What Looks Good ✅
- [Positive observations]

### Verdict
🔴 Requires Changes / 🟡 Minor Issues / ✅ Approved
```

### Step 5 — Fix critical issues

If critical issues are found and the task scope includes fixing:

1. Add ownership checks to unprotected mutations
2. Add `authorizedMiddleware` to unprotected endpoints
3. Replace `input.userId` with `context.user.id` where applicable
4. Add missing route server middleware

## Role permissions reference

```typescript
// src/config/auth.ts
export enum ROLES {
  USER = 'user',                      // No access to protected routes
  CUSTOMER_COMPLEX = 'customerComplex', // /search, bookings
  OWNER_COMPLEX = 'ownerComplex',      // /dashboard, /profile, complex/field management
}
```

| Operation | Required Role |
|-----------|--------------|
| Create booking | `customerComplex` |
| View own bookings | `customerComplex` |
| Create complex | `ownerComplex` |
| Create/update/delete field | `ownerComplex` |
| View dashboard metrics | `ownerComplex` |
| Search complexes | `customerComplex` |

## Rules

- Every mutation on an owned resource must verify `ownerId === context.user.id`
- Never use `input.userId` to filter data — always `context.user.id`
- `ROLES.USER` has no access — treat as incomplete registration
- Missing `.input(schema)` is a security issue, not just a validation issue
- Rate limiting is automatic via Better-Auth Redis — do not add manual limits
