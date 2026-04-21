# ADR-001: Fullstack Framework — TanStack Start

**Status:** Accepted
**Date:** 2026
**Area:** Core framework

---

## Context

A fullstack framework is needed to build a booking platform with the following requirements:

- SSR (Server-Side Rendering) for SEO and initial load performance (complex search pages must be indexable)
- Smooth SPA experience post-load for the booking flow
- End-to-end type safety (frontend + backend in the same repository)
- React 19 ecosystem with Concurrent Features support
- Compatibility with ORPC and TanStack Query for the data layer

Alternatives evaluated: **Next.js**, **Remix**, **TanStack Start**, and a separate SPA + API approach.

---

## Decision

Use **TanStack Start** (Vite + React 19 + TanStack Router) as the fullstack framework.

---

## Why It's the Right Choice

### 1. Cohesive TanStack ecosystem

TanStack Start integrates natively with TanStack Router and TanStack Query — the two libraries already used for routing and fetching. This eliminates integration friction present in Next.js (where the App Router has its own fetching system that competes with React Query).

### 2. File-based routing with real type safety

TanStack Router generates a typed `routeTree.gen.ts`. Params, search params, and loaders are type-safe at compile time, with no manual casting. In Next.js, `useParams()` returns `string | string[] | undefined` with no type validation.

### 3. Isomorphic SSR without magic

The `createIsomorphicFn()` pattern allows the same fetching code to work on the server (direct call) and client (HTTP fetch) with shared types. In Next.js, the distinction between Server Components and Client Components creates a conceptual barrier that complicates the architecture.

### 4. Vite as bundler

Significantly faster builds than webpack (used by Next.js by default). Instant HMR in development. The Vite plugin ecosystem is more modern and active.

### 5. React 19 without restrictions

TanStack Start does not impose its own component model. React 19 can be used with all its features (use(), Concurrent Rendering, optional Server Actions) without the constraints of Next.js's App Router.

---

## Accepted Trade-offs

| Aspect                              | Impact                                          |
| ----------------------------------- | ----------------------------------------------- |
| Smaller ecosystem than Next.js      | Fewer plugins and examples available            |
| Younger framework                   | Potential breaking changes                      |
| Lower market recognition            | Learning curve for new developers               |

---

## Consequences

- Routing is defined in `src/routes/` with auto-generated files in `routeTree.gen.ts` (never edit manually)
- The dev server uses Vite (`pnpm dev`, port 3000)
- Server functions and the ORPC client share types with no extra code
