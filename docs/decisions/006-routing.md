# ADR-006: Routing — TanStack Router with File-Based Routing

**Status:** Accepted
**Date:** 2026
**Area:** Navigation and route protection

---

## Context

The routing system needs:

- Type safety for params, search params, and loaders (no `as string` or manual casting)
- Role-based route protection without repeated code on every page
- SSR with data loaders (server-side prefetch before rendering)
- Nested layouts (shared dashboard sidebar across all owner routes)
- Clear separation between public, customer, and owner routes

Alternatives evaluated: **React Router v7**, **Next.js App Router**, **TanStack Router** (already chosen alongside TanStack Start).

---

## Decision

Use **TanStack Router** with file-based routing, auto-generated `routeTree.gen.ts`, and directory prefixes for access control.

---

## Why It's the Right Choice

### 1. Full type safety for params and search params

TanStack Router is the only React router with complete type safety inferred from the file structure:

```typescript
// src/routes/_owners/dashboard/index.tsx
export const Route = createFileRoute('/_owners/dashboard/')({
  component: DashboardPage,
  loader: async ({ context }) => {
    // typed context, no casting
  },
})

// In a child component:
const { fieldId } = Route.useParams() // fieldId: string (typed)
const { page } = Route.useSearch() // page: number (with Zod validation)
```

With React Router v7, `useParams()` returns `Record<string, string | undefined>` with no information about which params exist on that route.

### 2. Route protection via directory prefixes

The directory structure defines access level without repeated code:

```
routes/
├── _general/        # Public (no auth)
├── _customers/      # customerComplex only
├── _owners/         # ownerComplex only
├── _users/          # Any authenticated user
└── auth/            # Unauthenticated only
```

The parent layout of each directory (e.g., `_owners.tsx`) has the `beforeLoad` with role verification. All child routes inherit this protection automatically. No need to remember to add an auth HOC to every new page.

### 3. Loaders with server-side prefetch

```typescript
export const Route = createFileRoute('/search')({
  loader: async ({ context: { queryClient } }) => {
    // Runs on the server during SSR
    await queryClient.prefetchQuery(orpc.getComplexesMapList.queryOptions())
  },
  component: SearchPage,
})
```

TanStack Router loaders run on the server, inject data into the QueryClient, and the rendered HTML already has the data. No client-side data waterfall. Next.js App Router does something similar with Server Components, but they have restrictions on React hooks.

### 4. `routeTree.gen.ts` as the source of truth

The TanStack Router CLI automatically generates the route tree from the file structure. No need to manually register routes or maintain a routes array. Non-existent route errors are TypeScript errors, not runtime errors.

### 5. Nested layouts with Outlet

```
_owners.tsx           # Layout with owner sidebar
└── dashboard/
    ├── index.tsx     # /dashboard
    ├── bookings.tsx  # /dashboard/bookings
    └── fields.tsx    # /dashboard/fields
```

All share the sidebar layout without repeating code. React Router v7 also supports this, but TanStack Query integration is more direct with TanStack Router.

---

## Prefix Convention

| Prefix       | Meaning                | Check in `beforeLoad`           |
| ------------ | ---------------------- | ------------------------------- |
| `_general`   | Public                 | None                            |
| `_customers` | `customerComplex` only | Session + role                  |
| `_owners`    | `ownerComplex` only    | Session + role                  |
| `_users`     | Any authenticated user | Session only                    |
| `auth`       | Unauthenticated only   | Redirects if session exists     |

The leading underscore (`_`) indicates the directory is a route group (pathless layout route) — it does not appear in the URL.

---

## Accepted Trade-offs

| Aspect                              | Impact                                                                           |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `routeTree.gen.ts` is auto-generated | Do not edit manually; if the file is out of sync, the CLI must be re-run        |
| Learning curve                      | The type system is powerful but takes time to understand                         |
| Fewer examples online               | TanStack Router has less adoption than React Router or Next.js                   |

---

## Consequences

- `routeTree.gen.ts` is in `.gitignore` or regenerated on build — never edit it
- Adding a new protected route = creating the file in the correct directory; protection is automatic
- Role verification `beforeLoad` hooks are in each group's layout file (`_owners.tsx`, `_customers.tsx`, etc.)
- `AUTH_ROUTE_CONFIG` in `src/config/auth.ts` defines routes at the server middleware level; TanStack Router uses it on the client
