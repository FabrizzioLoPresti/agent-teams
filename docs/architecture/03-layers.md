# 3. Layered Architecture

Dependencies flow top to bottom. No lower layer knows about upper ones.

```mermaid
flowchart TD
    subgraph Presentacion["Presentation Layer"]
        Routes["Routes\n(TanStack Router)"]
        Components["Components\n(React 19 + Shadcn)"]
    end

    subgraph Datos["Client Data Layer"]
        Hooks["Data Hooks\n(TanStack Query + ORPC)"]
        Store["Zustand Store\n(local state)"]
    end

    subgraph API["API Layer"]
        Client["ORPC Client\n(isomorphic)"]
        Middlewares["Middlewares\n(validation + auth)"]
        Handlers["Router Handlers\n(business logic)"]
        Schemas["Zod Schemas\n(contracts)"]
    end

    subgraph Infra["Infrastructure Layer"]
        Prisma["Prisma 7\n(PrismaPg)"]
        Redis["Redis\n(sessions + rate limit)"]
        Auth["Better-Auth"]
    end

    Routes --> Components
    Components --> Hooks
    Components --> Store
    Hooks --> Client

    Client -->|SSR: direct call| Handlers
    Client -->|Client: fetch to /api/rpc| Middlewares
    Middlewares --> Handlers
    Handlers --> Schemas
    Handlers --> Prisma
    Handlers --> Redis
    Middlewares --> Auth
```

## Routes (Presentation)

File-based routing via TanStack Router. Directory prefixes determine the access level:

| Prefix        | Access                        | Example                |
| ------------- | ----------------------------- | ---------------------- |
| `_general/`   | Public                        | `/`, `/about`, `/faqs` |
| `_customers/` | Customers only                | `/search`              |
| `_owners/`    | Owners only                   | `/dashboard`           |
| `_users/`     | Any authenticated user        | `/profile/*`           |
| `auth/`       | Public (unauthenticated)      | `/auth/sign-in`        |

## Data Hooks (Client Data)

Custom hooks in `src/data/` that wrap ORPC calls with TanStack Query. They provide:

- **Cache**: 5-minute stale time by default
- **Decoupling**: components are unaware of the RPC transport
- **Standardized states**: loading, error, data, refetch

## ORPC (API)

The core of client-server communication. Handlers contain business logic (price calculation, conflict detection, transactions). Zod schemas define input and output contracts. All responses are wrapped with `createApiResponseSchema()`, which adds `message`, `status`, and `data`.

## Infrastructure

- **Prisma 7** with the PrismaPg adapter (native PostgreSQL driver, not libSQL)
- **Redis** for session caching (avoids hitting PostgreSQL on every request) and rate limiting
- **Better-Auth** for authentication with multiple strategies

---

← [Domain Model](./02-domain-model.md) | [Index](./README.md) | [Data Flow →](./04-data-flow.md)
