# 8. Glossary

| Term                   | Description                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| **Complex**            | Physical sports establishment (e.g., "Club Deportivo Norte"). Aggregate root.                   |
| **Field / Cancha**     | Playing field within a complex. Can be FULL, HALF_A, or HALF_B.                                 |
| **PriceSlot**          | Time slot with a specific rate within a schedule.                                               |
| **Working Schedule**   | Operating hours for a field on a given day of the week.                                         |
| **Timestamptz**        | Timestamp with timezone in PostgreSQL. Stored internally as UTC.                                |
| **Soft Delete**        | Logical deletion by setting `deletedAt` without removing the record.                            |
| **Optimistic Locking** | Concurrency control using an incrementing `version` field.                                      |
| **ORPC**               | Type-safe RPC framework that generates clients from server definitions.                         |
| **Isomorphic Client**  | Client that works both on the server (SSR) and in the browser.                                  |
| **SSR**                | Server-Side Rendering. HTML is generated on the server on the first load.                       |
| **Middleware (ORPC)**  | Function that intercepts requests to add validation, auth, etc. Composed in a chain.            |
| **Data Hook**          | React hook that encapsulates an ORPC call + TanStack Query cache.                               |
| **TanStack Query**     | Async data caching and synchronization library for React.                                       |
| **Better-Auth**        | Authentication framework with support for OAuth, email/password, RBAC, and plugins.             |
| **Zustand**            | Minimalist state management library for React.                                                  |

---

← [Infrastructure](./07-infrastructure.md) | [Index](./README.md)
