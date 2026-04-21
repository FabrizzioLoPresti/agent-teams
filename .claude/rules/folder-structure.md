# Folder Structure

## Introduction

The project follows a **feature-first architecture with shared horizontal layers**. Code lives in `src/` and is organized by technical responsibility: server data in `orpc/`, client hooks in `data/`, UI in `components/`, and pages in `routes/`.

---

## Directory tree

```
src/
├── components/       # React components (UI + feature)
│   ├── ui/           # Shadcn/ui primitives (do not touch)
│   ├── booking/      # Feature: booking flow
│   │   ├── modals/   # Modals (orchestrators)
│   │   ├── forms/    # React Hook Form forms
│   │   └── cards/    # Presentational components
│   ├── dashboard/    # Feature: owner dashboard
│   ├── profile/      # Feature: profile/complex/field management
│   ├── search/       # Feature: court search
│   ├── auth/         # Feature: authentication
│   └── home/         # Feature: landing page
│
├── data/             # TanStack Query hooks (wrappers over ORPC)
│   ├── booking/
│   ├── complex/
│   ├── field/
│   └── dashboard/
│
├── orpc/             # API layer (server + client)
│   ├── client.ts     # Isomorphic client + orpc utils
│   ├── middlewares/  # base, auth, input-validation
│   ├── router/       # Handlers per domain (booking, complex, field...)
│   └── schemas/      # Zod schemas (source of truth)
│
├── routes/           # TanStack Router file-based routing
│   ├── __root.tsx    # Root layout
│   ├── _general/     # Public routes
│   ├── _customers/   # Routes for customerComplex
│   ├── _owners/      # Routes for ownerComplex
│   ├── _users/       # Routes for authenticated users
│   ├── auth/         # Authentication routes
│   └── api.rpc.$.ts  # ORPC HTTP handler
│
├── types/            # TypeScript types (inferred from Zod schemas)
│
├── config/           # Domain constants and configuration
│   ├── bookings.ts   # Durations, currencies, status, tax rate
│   ├── fields.ts     # Surface types, field types, days of week
│   ├── complexes.ts  # Complex features, court types
│   ├── auth.ts       # Roles, route config, redirects
│   └── common.ts     # Shared constants
│
├── store/            # Zustand stores (persistent UI state)
│   └── useSidebarStore.ts
│
├── utils/            # Pure utility functions
│   ├── format.ts     # Date, currency, etc. formatting
│   ├── booking.ts    # Booking business logic (slot calculation, conflicts)
│   └── auth.ts       # Authentication helpers
│
├── db/               # Database and cache clients
│   ├── db.ts         # Prisma client instance  ← import as `@/db/db`
│   └── redis.ts      # Redis client instance
│
├── lib/              # External library wrappers (organized in subfolders)
│   ├── auth/
│   │   ├── auth.ts         # Better-Auth server instance
│   │   ├── auth-client.ts  # Better-Auth client instance
│   │   └── permissions.ts  # RBAC definitions
│   ├── geocoding/
│   │   └── nominatim.ts    # Nominatim geocoding client
│   ├── maps/
│   │   └── map-marker.ts   # Leaflet marker utilities
│   └── utils.ts            # cn() and other shared utilities
│
├── middlewares/      # Server middlewares (TanStack Start)
│
└── env.ts            # Environment variables (t3-env with Zod validation)
```

---

## What lives in each layer

### `orpc/schemas/` — Source of truth

Defines the shape of all data that crosses the client-server boundary. Everything else derives from here.

```
schemas/
├── common.ts       # pagination, sort, dateRange (reusable)
├── api-response.ts # generic wrapper { message, status, data }
├── booking.ts      # AddBookingFormSchema, CreateBookingInputSchema, BookingResponseSchema...
├── complex.ts      # CreateComplexInputSchema, ComplexResponseSchema...
├── field.ts        # CreateFieldInputSchema, FieldResponseSchema...
└── dashboard.ts    # DashboardMetricsResponseSchema
```

### `orpc/router/` — Server logic

Handlers with access to Prisma, authentication context, and typed errors.

```
router/
├── booking.ts    # addBooking, getBookingsListByFieldId, cancelBooking...
├── complex.ts    # addComplex, getComplexById, getMyComplexes, updateComplex...
├── field.ts      # addField, getFieldsByComplexId, updateField, deleteField...
├── dashboard.ts  # getDashboardMetrics
└── index.ts      # Main router composition
```

### `types/` — Derived types

Only barrel files that do `z.infer` from schemas. They contain no logic.

```
types/
├── booking.ts    # AddBookingFormType, CreateBookingInputType, BookingResponseType...
├── complex.ts    # CreateComplexInputType, ComplexResponseType...
├── field.ts      # CreateFieldInputType, FieldResponseType...
└── dashboard.ts  # DashboardMetricsResponseType
```

### `data/` — Server state on the client

`useQuery`/`useMutation` wrappers. No business logic, no complex transformations.

### `config/` — Domain constants

`as const` arrays and objects with enum values, display labels, numeric constants. They are the single source of truth for values that Zod uses in its enums.

### `store/` — Local UI state

Zustand stores for state that persists between navigations (sidebar, preferences). Not for server data.

---

## Co-location vs. shared folders rules

| Content               | Location                                       | Reason                                   |
| --------------------- | ---------------------------------------------- | ---------------------------------------- |
| Zod schema            | `src/orpc/schemas/[domain].ts`                 | Shared between front and back            |
| TypeScript type       | `src/types/[domain].ts`                        | Derived from schema, centralized         |
| Domain constants      | `src/config/[domain].ts`                       | Referenced by schemas and components     |
| Data hook             | `src/data/[domain]/[operation].ts`             | One file per operation                   |
| Feature component     | `src/components/[feature]/[type]/[name].tsx`   | Co-located by feature                    |
| Base UI component     | `src/components/ui/`                           | Shadcn, shared globally                  |
| ORPC handler          | `src/orpc/router/[domain].ts`                  | Co-located by domain                     |
| Zustand store         | `src/store/use[Name]Store.ts`                  | Global UI state                          |
| Pure utility          | `src/utils/[name].ts`                          | No side effects                          |
| Library wrapper       | `src/lib/[name]/[file].ts`                     | Single instance, exported                |
| DB/cache client       | `src/db/db.ts`, `src/db/redis.ts`              | Import as `@/db/db`, `@/db/redis`        |

---

## Auto-generated files

```
src/routes/routeTree.gen.ts   # Generated by TanStack Router — NEVER edit manually
prisma/schema.prisma          # Edited manually; generates the client with pnpm db:generate
```

---

## Anti-patterns

```
# ❌ Putting business logic in src/utils/
# Utils are pure functions (formatting, simple calculations). Domain logic
# goes in ORPC handlers.

# ❌ Defining types in src/components/
# Types always go in src/types/ (derived from Zod) or inline only for local Props.

# ❌ Putting Zod schemas in src/types/
# Schemas go in src/orpc/schemas/; src/types/ only has z.infer<>.

# ❌ Importing from src/orpc/router/ in components
# Components never import server handlers directly.

# ❌ Creating an ad-hoc shared/ or common/ folder
# Truly shared content has its place: schemas in orpc/schemas/,
# constants in config/, types in types/.
```
