# Tech Stack

## Introduction

This document describes the technologies used in the project, their versions, the reason they were chosen, and specific usage considerations. See the ADRs in `docs/decisions/` for the full reasoning behind each decision.

---

## Fullstack framework: TanStack Start

**Version:** `@tanstack/start` v1.132.0  
**Why:** Isomorphic SSR with Vite, native integration with TanStack Router and React Query, no framework "magic". See ADR-001.

**Considerations:**

- The ORPC client is isomorphic: on the server it calls functions directly; in the browser it fetches `/api/rpc`
- Routes are files in `src/routes/` (file-based routing via TanStack Router)
- `routeTree.gen.ts` is auto-generated — never edit manually
- There are no "Server Components" in the Next.js App Router sense

```typescript
// Core isomorphic pattern of the project
const getORPCClient = createIsomorphicFn()
  .server(() => createRouterClient(router, { context: getRequestHeaders }))
  .client(() => createORPCClient(new RPCLink({ url: '/api/rpc' })))
```

---

## UI: React 19

**Version:** `react` v19.2.3  
**Why:** Current stable version with React Compiler, performance improvements, and the new `use()` API.

**Considerations:**

- **React Compiler** is active: do not use `useMemo`, `useCallback`, or `React.memo` unless an external library requires stable references
- `use()` hook available for consuming promises and contexts more directly
- All components are client-side (not Next.js App Router)

---

## Router: TanStack Router

**Version:** `@tanstack/react-router` v1.132.0  
**Why:** Native type safety for params, search params, and routes. Direct integration with TanStack Start. See ADR-006.

**Considerations:**

- Route protection via `beforeLoad` in parent layouts
- Route groups with directory prefix: `_general/`, `_customers/`, `_owners/`, `_users/`, `auth/`
- Dynamic routes: `search.$complexId.tsx` → `params.complexId` typed
- `notFound()` and `redirect()` are TanStack Router functions, not Next.js

```typescript
// Route protection with beforeLoad
export const Route = createFileRoute('/_owners')({
  beforeLoad: async ({ context }) => {
    if (session.user.role !== 'ownerComplex') throw redirect({ to: '/search' })
  },
})
```

---

## API Layer: ORPC

**Version:** `@orpc/server` v1.7.5, `@orpc/client` v1.7.5, `@orpc/tanstack-query` v1.7.5  
**Why:** End-to-end type safety, composable middleware, first-class integration with TanStack Query. See ADR-005.

**Considerations:**

- All inputs and outputs are validated with Zod
- The error catalog is typed: `errors.NOT_FOUND()`, `errors.CONFLICT()`, etc.
- `createTanstackQueryUtils(client)` generates `orpc.procedure.queryOptions()` and `orpc.procedure.call()` helpers
- Do not use REST or GraphQL — ORPC is the only form of client-server communication

---

## Validation: Zod

**Version:** `zod` v4.1.11  
**Why:** Runtime validation + TypeScript type inference. Single source of truth.

**Considerations:**

- Zod v4 has API changes from v3 (e.g.: `z.cuid()` may require a specific import)
- Schemas live in `src/orpc/schemas/` — never defined inline in endpoints or components
- `z.infer<typeof Schema>` is the only mechanism for creating TypeScript types in the project

---

## Server State: TanStack Query (React Query)

**Version:** `@tanstack/react-query` v5.66.5  
**Why:** Caching, invalidation, optimistic updates, and loading/error state management. See ADR-007.

**Considerations:**

- React Query v5 uses `isPending` instead of `isLoading` for mutations
- The `queryKey` must include all dynamic parameters
- `staleTime` is configured per hook based on data volatility (e.g.: bookings = 5 min)
- Hooks live in `src/data/` — not defined inline in components

---

## ORM: Prisma 7 + PrismaPg

**Version:** `prisma` v7.1.0, `@prisma/pg` (native PrismaPg driver)  
**Why:** ORM with generated types, automatic migrations, native PostgreSQL support. See ADR-002.

**Considerations:**

- Run `pnpm db:generate` after **any** change to `prisma/schema.prisma`
- PrismaPg is the native driver (not the old Prisma adapter) — performance improvement
- Use Prisma `Decimal` for monetary fields (not `Float`)
- `deletedAt` on Complex implements soft delete (ADR-009)

---

## Database: PostgreSQL 16

**Version:** PostgreSQL 16 (via Docker)  
**Why:** ACID, JSONB, native Timestamptz, composite indexes. See ADR-002.

**Considerations:**

- **All datetimes are stored in UTC** (`Timestamptz`)
- Working schedules (`workingSchedule`) are stored as `HH:MM` strings in local time
- Use `date-fns-tz` for UTC ↔ local timezone conversions (ADR-008)

---

## Cache: Redis

**Version:** `redis` v5.10.0  
**Why:** Better-Auth session storage with native TTL and sub-ms latency. See ADR-003.

**Considerations:**

- Configured as Better-Auth `secondaryStorage` (sessions in Redis, not the main database)
- Do not use Redis directly in ORPC handlers — it is transparent via the auth layer

---

## Authentication: Better-Auth

**Version:** `better-auth` v1.4.4  
**Why:** Framework-agnostic, integrated RBAC, `databaseHooks` for registration logic. See ADR-004.

**Roles:** `user`, `customerComplex`, `ownerComplex`

**Considerations:**

- The session is retrieved with `auth.api.getSession({ headers })` in the ORPC middleware
- The role is assigned in the `user.create.after` hook of `databaseHooks`
- Supports Email + OAuth (Google) out of the box

---

## Forms: React Hook Form + Zod

**Version:** `react-hook-form` v7.66.0  
**Why:** Performance, Zod integration via `zodResolver`, compatible with Shadcn Form.

**Considerations:**

- Always use `zodResolver(MyFormSchema)` — never manual validation
- The form schema (`FormSchema`) may differ from the API input schema (`InputSchema`)
- Data transformation from the form to the API input happens in the component's `onSubmit`

---

## UI: Shadcn/ui + Tailwind CSS v4

**Version:** Tailwind CSS v4.0.6, Shadcn with Radix UI components  
**Why:** Accessible, composable components, no CSS-in-JS overhead.

**Tailwind v4 considerations:**

- **No `tailwind.config.js`** — configuration is done in CSS with `@theme`
- Native CSS variables instead of custom utilities
- Classes like `text-sm`, `gap-4`, etc. work the same as v3
- New utilities: `inset-*`, `size-*` (replaces `w-* h-*` when equal)

```css
/* Configuration in CSS (Tailwind v4) */
@import 'tailwindcss';

@theme {
  --color-ac-dark-gray: #1a1a2e;
  --color-ac-blue: #16213e;
}
```

**Shadcn:**

- Add components with: `pnpx shadcn@latest add <component>`
- Components are copied to `src/components/ui/` — they can be modified
- Do not modify without a specific project reason

---

## Local state: Zustand

**Version:** `zustand` v5.0.11  
**Why:** UI state that persists between navigations (sidebar, preferences). See ADR-007.

**Considerations:**

- Only for **UI** state (sidebar open/closed, visual preferences)
- Do not use for server data — that is TanStack Query's responsibility
- Use the `persist` middleware when state must survive page reloads

---

## Animations: Motion

**Version:** `motion` v12.15.0 (ex Framer Motion)  
**Why:** Declarative animations with React.

> ⚠️ The package is called `motion` in v12+, not `framer-motion`. Imports change to `import { motion } from 'motion/react'`.

---

## Maps: React Leaflet + Leaflet

**Version:** `react-leaflet` v5.0.0-rc.2, `leaflet` v1.9.4  
**Why:** Interactive maps for selecting the location of sports complexes.

**Considerations:**

- Use `dynamic import` to avoid SSR errors (Leaflet uses `window`)
- Geocoding via Nominatim (OpenStreetMap public API) — no API key required

---

## Testing: Vitest

**Version:** `vitest` v3.0.5  
**Why:** Same runner as Vite, zero-config, compatible with Jest API.

**Considerations:**

- Tests for critical logic: ORPC handlers, booking business logic
- Do not test trivial UI components
- Tests live next to the files they test (`*.test.ts`)

---

## Monitoring: Sentry

**Version:** `@sentry/tanstackstart-react`  
**Why:** Error tracking and performance monitoring.

**Considerations:**

- Wrap server functions with `Sentry.startSpan(...)`:
  ```typescript
  return Sentry.startSpan({ name: 'addBooking' }, async () => {
    // handler logic
  })
  ```
- Import from `@sentry/tanstackstart-react`, not `@sentry/react`

---

## Environment variables: t3-env

**Version:** `@t3-oss/env-core`  
**Why:** Zod validation of environment variables at build time.

```typescript
// src/env.ts
import { createEnv } from '@t3-oss/env-core'

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
  },
  runtimeEnv: process.env,
})
```

Add new variables in `src/env/` **and** in `.env.example`.
