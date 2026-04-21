# ADR-007: Client State — Zustand + TanStack Query

**Status:** Accepted
**Date:** 2026
**Area:** State management

---

## Context

In a modern React application, client state has two distinct natures:

1. **Server state**: data coming from the API (bookings, complexes, users). Needs caching, synchronization, invalidation, loading states, error handling.
2. **Local UI state**: user preferences (sidebar open/closed), modal state, active filters, form data.

Mixing both in a single solution (e.g., Redux with RTK Query, or Zustand for everything) creates unnecessary complexity or excessive boilerplate.

Alternatives evaluated: **Redux + RTK Query**, **Jotai + React Query**, **Zustand + TanStack Query**, **Context API + SWR**.

---

## Decision

Use **TanStack Query** for server state (via ORPC) and **Zustand** for persisted local UI state.

---

## Why It's the Right Choice

### TanStack Query for Server State

TanStack Query solves the server data synchronization problem in an opinionated and correct way:

- **Automatic cache**: each query has a `queryKey`. If two components use the same key, they share the cache without manual coordination.
- **Stale-while-revalidate**: data is shown immediately (stale) while being revalidated in the background.
- **Granular invalidation**: when creating a booking, only the user's bookings query is invalidated (`orpc.getBookingsByUserId.invalidate()`), not the entire state.
- **Optimistic updates**: mutations that update the cache locally before confirming with the server.

The integration with ORPC via `createTanstackQueryUtils` automatically generates `useQuery`, `useMutation`, and `queryKey` from the router.

### Zustand for Local State

Zustand is minimalist but sufficient for UI state that persists across navigations:

```typescript
// src/store/useSidebarStore.ts
interface SidebarState {
  isOpen: boolean
  isCollapsed: boolean
  toggle: () => void
  toggleCollapse: () => void
}

// With localStorage persistence
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({ ... }),
    { name: 'sidebar-store' }
  )
)
```

The sidebar state needs to persist across page reloads (the user does not want it to reset every time). Zustand's `persist` middleware handles this in one line.

### Why Not Redux / Redux Toolkit

Redux handles global state well in large applications, but adds significant overhead for this project's use cases:

- **Boilerplate**: actions, reducers, selectors for every entity
- **RTK Query vs TanStack Query**: RTK Query is excellent but more optimized for the Redux ecosystem. TanStack Query has better ORPC integration and is more flexible for SSR prefetching

### Why Not Context API for Everything

React Context is suitable for data that changes rarely (theme, language, authenticated user). For frequently changing data (booking list, loading state), Context causes unnecessary re-renders across all context consumers. It has no caching or invalidation.

### Why Not Jotai

Jotai is good for atomic state with complex inter-atom dependencies. For this project's UI state (sidebar, modals, filters), Jotai's complexity adds no value over Zustand.

---

## Separation of Concerns

| State Type                                        | Solution                | Example                               |
| ------------------------------------------------- | ----------------------- | ------------------------------------- |
| Server data (booking list, complexes)             | TanStack Query via ORPC | `orpc.getBookingsByUserId.useQuery()` |
| Persisted UI preferences                          | Zustand + persist       | Sidebar state                         |
| Form state                                        | React Hook Form         | New booking form                      |
| Ephemeral local UI state                          | useState / useReducer   | Modal open/closed                     |

---

## Accepted Trade-offs

| Aspect                                           | Impact                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Multiple state libraries                         | Each piece of state requires a decision about where it belongs          |
| Zustand DevTools less mature than Redux          | Debugging is less visual                                                |
| TanStack Query has a learning curve              | Concepts like stale time, cache time, and query keys are library-specific |

---

## Consequences

- Zustand stores are in `src/store/` following the `useXxxStore` pattern
- Data hooks using TanStack Query + ORPC are in `src/data/`
- Default stale time is 5 minutes; adjust per query if data is more volatile
- Do not use `useState` to store data coming from the API — always use TanStack Query
