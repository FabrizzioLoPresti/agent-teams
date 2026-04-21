# 1. System Overview

Alta Cancha is a platform that connects **sports complex owners** with **players who want to book fields**. The system allows owners to manage their complexes, fields, schedules, and prices, while players can search, compare, and book fields in real time.

## Main Actors

- **Customer** (`customerComplex`): Searches complexes, checks availability, and creates bookings.
- **Owner** (`ownerComplex`): Manages complexes, fields, schedules, prices, and views business metrics.
- **Admin**: Manages users, moderates reviews, and oversees the platform.

## Context Diagram

```mermaid
flowchart TB
    Customer["Customer\n(Player)"]
    Owner["Owner\n(Complex owner)"]

    subgraph AltaCancha["Alta Cancha"]
        App["TanStack Start\n(SSR + SPA)"]
        DB["PostgreSQL 16"]
        Cache["Redis"]
    end

    Customer -->|Searches and books fields| App
    Owner -->|Manages complex and fields| App
    App --> DB
    App --> Cache

    App -->|OAuth| Google["Google OAuth"]
    App -->|Monitoring| Sentry["Sentry"]
    App -.->|Payments (future)| MP["MercadoPago / Stripe"]
```

---

← [Index](./README.md) | [Domain Model →](./02-domain-model.md)
