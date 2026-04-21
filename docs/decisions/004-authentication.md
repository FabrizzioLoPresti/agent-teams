# ADR-004: Authentication — Better-Auth

**Status:** Accepted
**Date:** 2026
**Area:** Authentication and security

---

## Context

The platform needs an authentication system that supports:

- Email and password with mandatory email verification
- OAuth with Google
- User roles assigned at registration time (not after)
- RBAC (Role-Based Access Control) with granular per-resource permissions
- Session management with Redis cache
- Rate limiting per authentication endpoint
- Unique usernames (in addition to email)
- Compatible with TanStack Start and Prisma

Alternatives evaluated: **Auth.js (NextAuth)**, **Clerk**, **Lucia**, **custom implementation**.

---

## Decision

Use **Better-Auth** with the Prisma adapter, admin plugin (RBAC), and username plugin.

---

## Why It's the Right Choice

### 1. Compatible with any framework

Unlike Auth.js, which is tightly coupled to Next.js, Better-Auth is framework-agnostic. It has an official adapter for TanStack Start (`tanstackStartCookies()`), which correctly handles cookies in SSR with Vite's headers mechanism.

### 2. Built-in RBAC with `better-auth/plugins/access`

The admin plugin includes `createAccessControl` to define typed resources and actions:

```typescript
const statement = {
  complex: ['create', 'share', 'update', 'delete'],
  field: ['create', 'share', 'update', 'delete'],
}
```

This generates type-safe roles verified at compile time. Clerk offers something similar but as an external SaaS (user data outside the application's control).

### 3. `databaseHooks` for business logic at registration

Better-Auth exposes database hooks (`databaseHooks.user.create.before`) that allow injecting logic before creating a user. This is critical for assigning the role at registration time, for both email/password and OAuth:

```typescript
databaseHooks: {
  user: {
    create: {
      before: async (user, ctx) => {
        // Assign role based on accountType selected by the user
        user.role = ACCOUNT_TYPE_TO_ROLE[user.accountType]
      }
    }
  }
}
```

In Auth.js, this pattern requires complex callbacks and is not as straightforward for OAuth.

### 4. `secondaryStorage` for Redis

The `secondaryStorage` interface with `get/set/delete` maps directly to Redis with no extra adapters. Better-Auth uses this store for both session caching and rate limiting.

### 5. Per-endpoint rate limiting

```typescript
rateLimit: {
  window: 10, max: 100,
  customRules: {
    '/sign-in/email': { window: 10, max: 3 },
    '/sign-up/email': { window: 10, max: 3 },
  }
}
```

Lucia has no built-in rate limiting. Clerk offers it but is not configurable at this level.

### 6. User data in your own database

Unlike Clerk (a SaaS that stores users on its servers), Better-Auth uses the Prisma adapter and stores everything in the project's own PostgreSQL. This matters for: data compliance (GDPR), full control, and not depending on an external SaaS for core functionality.

---

## Why Not the Alternatives

**Auth.js (NextAuth v5):** Strongly oriented toward Next.js. TanStack Start support requires extra work. RBAC is not a first-class feature. Database hooks are more limited.

**Clerk:** SaaS that stores user data outside the system. Cost scales with users. No control over the user schema. External dependency for core functionality.

**Lucia:** Minimalist and flexible, but requires manually implementing: rate limiting, RBAC, Redis cache, OAuth state management — everything Better-Auth provides out of the box.

**Custom:** Correctly implementing sessions, password hashing, CSRF protection, and OAuth flows is complex and error-prone from a security standpoint. There is no justification for reinventing this.

---

## Accepted Trade-offs

| Aspect                              | Impact                                              |
| ----------------------------------- | --------------------------------------------------- |
| Younger library than Auth.js        | Less adoption, potential bugs in edge cases         |
| API changes between minor versions  | Changelog must be reviewed on each update           |
| Documentation still evolving        | Some features require reading the source code       |

---

## Consequences

- Auth tables (`user`, `session`, `account`, `verification`) are managed by Better-Auth via the Prisma schema
- The `/api/auth/$` route in TanStack Router is Better-Auth's catchall handler
- To add fields to the user (such as `accountType`/`role`), use `user.additionalFields` in the Better-Auth config
- The auth client for the frontend is in `src/lib/auth/auth-client.ts`
- RBAC permissions are defined in `src/lib/auth/permissions.ts` and referenced in `auth.ts`
