---
name: orpc-endpoints
description: >
  oRPC endpoint creation patterns for alta-cancha-fs. Use this skill whenever you need to create or modify an oRPC procedure, define a Zod schema, add a new route handler, implement input/output validation, handle pagination, throw typed errors, register a new procedure in the router, or create the data hook to consume it from a component. Always use this skill before writing any file in src/orpc/ or src/data/.
---

# oRPC Endpoint Patterns for alta-cancha-fs

**Stack:** `@orpc/server` + Zod v4 + Prisma + Better Auth
**HTTP mount:** `/api/rpc` → `src/routes/api.rpc.$.ts`
**Client:** `src/orpc/client.ts` exports `orpc` (TanStack Query utils) and `client` (raw typed client)

---

## File layout for a new domain

```
src/orpc/schemas/<domain>.ts     ← Zod schemas (inputs, outputs, enums)
src/orpc/router/<domain>.ts      ← procedure handlers
src/orpc/router/index.ts         ← register procedures here (re-export)
src/types/<domain>.ts            ← TypeScript types (z.infer from schemas)
src/data/<domain>/<operation>.ts ← React Query hook to consume the procedure
```

---

## 1. Schemas (`src/orpc/schemas/<domain>.ts`)

Schemas serve two purposes: they validate data at the API boundary, and they become TypeScript types via `z.infer`. Define all schemas for a domain in one file.

```ts
import { z } from 'zod'
import { paginationSchema, sortSchema, paginationResponseSchema } from './common'
import { createApiResponseSchema } from './api-response'

// Enums from config constants
import { MY_STATUS_VALUES } from '@/config/myDomain'

export const MyStatusEnum = z.enum(MY_STATUS_VALUES)

// Input for creating
export const CreateMyEntityInputSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  status: MyStatusEnum.default('ACTIVE'),
})

// Input for paginated list
export const GetMyEntitiesInputSchema = paginationSchema
  .extend(sortSchema.shape)
  .extend({
    sortBy: z.enum(['createdAt', 'title', 'status']).default('createdAt'),
  })

// Single item response
export const MyEntityResponseSchema = z.object({
  id: z.cuid(),
  title: z.string(),
  description: z.string().nullable(),
  status: MyStatusEnum,
  createdAt: z.date(),
})

// Paginated response body
export const MyEntitiesWithPaginationResponseSchema = z.object({
  entities: MyEntityResponseSchema.array(),
  pagination: paginationResponseSchema,
})
```

**Common schemas** (import from `./common`):
- `paginationSchema` → `{ pageIndex, pageSize }`
- `sortSchema` → `{ sortBy, sortOrder }`
- `dateRangeFilterSchema` → `{ startDateTime?, endDateTime? }`
- `paginationResponseSchema` → `{ pageIndex, pageSize, total, totalPages }`

**Response wrapper** (import from `./api-response`):
```ts
createApiResponseSchema(DataSchema)
// → z.object({ message: z.string(), status: z.number(), data: DataSchema.optional() })
```

Use the wrapper when the response includes meaningful metadata (`message`, `status`). Use direct returns for simple list queries.

---

## 2. Types (`src/types/<domain>.ts`)

All types are inferred from schemas. Never write them manually.

```ts
import { z } from 'zod'
import {
  CreateMyEntityInputSchema,
  GetMyEntitiesInputSchema,
  MyEntityResponseSchema,
  MyEntitiesWithPaginationResponseSchema,
  MyStatusEnum,
} from '@/orpc/schemas/myDomain'

export type CreateMyEntityInputType = z.infer<typeof CreateMyEntityInputSchema>
export type GetMyEntitiesInputType = z.infer<typeof GetMyEntitiesInputSchema>
export type MyEntityResponseType = z.infer<typeof MyEntityResponseSchema>
export type MyEntitiesWithPaginationType = z.infer<typeof MyEntitiesWithPaginationResponseSchema>
export type MyStatusType = z.infer<typeof MyStatusEnum>
```

---

## 3. Procedures (`src/orpc/router/<domain>.ts`)

Every procedure follows the same chain: **middleware → `.input()` → `.output()` → `.handler()`**.

### Middleware selection

| Use case | Middleware |
|---|---|
| Public (no auth) | `baseInputValidationMiddleware` |
| Protected (requires login) | `authorizedMiddleware` |

```ts
import { ORPCError } from '@orpc/client'
import { prisma } from '@/db/db'
import { baseInputValidationMiddleware } from '@/orpc/middlewares/input-validation'
import { authorizedMiddleware } from '@/orpc/middlewares/auth'
import { createApiResponseSchema } from '@/orpc/schemas/api-response'
import {
  CreateMyEntityInputSchema,
  GetMyEntitiesInputSchema,
  MyEntityResponseSchema,
  MyEntitiesWithPaginationResponseSchema,
} from '@/orpc/schemas/myDomain'
```

### Pattern A — public simple list (no auth, no pagination)

```ts
export const getMyEntitiesPublic = baseInputValidationMiddleware
  .output(MyEntityResponseSchema.array())
  .handler(async ({ errors }) => {
    try {
      const items = await prisma.myEntity.findMany({
        where: { isActive: true },
        select: { id: true, title: true, description: true, status: true, createdAt: true },
      })
      return items
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

### Pattern B — protected list with ownership filter

```ts
export const getMyEntities = authorizedMiddleware
  .output(MyEntityResponseSchema.array())
  .handler(async ({ context, errors }) => {
    const userId = context.user.id
    try {
      const items = await prisma.myEntity.findMany({
        where: { ownerId: userId, isActive: true },
        select: { id: true, title: true, description: true, status: true, createdAt: true },
      })
      return items
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

### Pattern C — protected paginated + sorted list

```ts
export const getMyEntitiesList = authorizedMiddleware
  .input(GetMyEntitiesInputSchema)
  .output(createApiResponseSchema(MyEntitiesWithPaginationResponseSchema))
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id
    try {
      const { pageIndex, pageSize, sortBy, sortOrder } = input
      const skip = pageIndex * pageSize

      const where = { ownerId: userId, isActive: true }
      const total = await prisma.myEntity.count({ where })
      const totalPages = Math.ceil(total / pageSize)

      const items = await prisma.myEntity.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: pageSize,
        select: { id: true, title: true, description: true, status: true, createdAt: true },
      })

      return {
        message: 'Entities retrieved successfully',
        status: 200,
        data: {
          entities: items,
          pagination: { pageIndex, pageSize, total, totalPages },
        },
      }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

### Pattern D — create with conflict check

```ts
export const createMyEntity = authorizedMiddleware
  .input(CreateMyEntityInputSchema)
  .output(createApiResponseSchema(MyEntityResponseSchema))
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id
    try {
      const existing = await prisma.myEntity.findUnique({
        where: { title: input.title },
        select: { id: true },
      })
      if (existing) {
        throw errors.CONFLICT({ message: 'Ya existe una entidad con ese nombre.' })
      }

      const item = await prisma.myEntity.create({
        data: { ...input, ownerId: userId },
        select: { id: true, title: true, description: true, status: true, createdAt: true },
      })

      return { message: 'Creado exitosamente', status: 201, data: item }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

### Pattern E — update with ownership check

```ts
export const updateMyEntity = authorizedMiddleware
  .input(UpdateMyEntityInputSchema)
  .output(createApiResponseSchema(MyEntityResponseSchema))
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id
    try {
      const existing = await prisma.myEntity.findUnique({
        where: { id: input.id },
        select: { ownerId: true },
      })
      if (!existing) throw errors.NOT_FOUND({ message: 'Entidad no encontrada.' })
      if (existing.ownerId !== userId) throw errors.FORBIDDEN({ message: 'Sin permisos.' })

      const item = await prisma.myEntity.update({
        where: { id: input.id },
        data: { title: input.title, description: input.description },
        select: { id: true, title: true, description: true, status: true, createdAt: true },
      })

      return { message: 'Actualizado exitosamente', status: 200, data: item }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

### Pattern F — soft delete with business rule validation

```ts
export const deleteMyEntity = authorizedMiddleware
  .input(z.object({ id: z.cuid() }))
  .output(createApiResponseSchema(z.object({ id: z.cuid(), deletedAt: z.date() })))
  .handler(async ({ input, context, errors }) => {
    const userId = context.user.id
    try {
      const existing = await prisma.myEntity.findUnique({
        where: { id: input.id },
        select: { ownerId: true, isActive: true },
      })
      if (!existing || !existing.isActive) throw errors.NOT_FOUND()
      if (existing.ownerId !== userId) throw errors.FORBIDDEN()

      // Business rule: block delete if related records exist
      const relatedCount = await prisma.relatedModel.count({
        where: { myEntityId: input.id, status: { in: ['PENDING', 'ACTIVE'] } },
      })
      if (relatedCount > 0) {
        throw errors.CONFLICT({ message: `No se puede eliminar: tiene ${relatedCount} registro/s activo/s.` })
      }

      const item = await prisma.myEntity.update({
        where: { id: input.id },
        data: { isActive: false, deletedAt: new Date(), deletedBy: userId },
        select: { id: true, deletedAt: true },
      })

      return { message: 'Eliminado exitosamente', status: 200, data: { id: item.id, deletedAt: item.deletedAt! } }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

---

## 4. Error handling rules

### Backend — throwing errors

- **Always** catch errors and re-throw `ORPCError` instances unchanged: `if (error instanceof ORPCError) throw error`
- Then fall back to `throw errors.BAD_REQUEST()` — never let raw Prisma/JS errors leak to the client
- Throw typed errors with optional message overrides:

```ts
throw errors.NOT_FOUND({ message: 'Entidad no encontrada.' })
throw errors.FORBIDDEN({ message: 'Sin permisos para esta acción.' })
throw errors.CONFLICT({ message: 'Ya existe un registro con ese nombre.' })
throw errors.UNAUTHORIZED()         // generic — no custom message needed
throw errors.BAD_REQUEST({ message: 'Datos inválidos.' })
throw errors.INTERNAL_SERVER_ERROR()
```

### How errors flow to the frontend

The `message` you set in `throw errors.X({ message: '...' })` becomes `error.message` on the client when the mutation rejects. The HTTP status code is set automatically based on the error code. The frontend catches these as `ORPCError` instances from `@orpc/client`.

This means you should write backend error messages in the same language as the UI (Spanish) since they surface directly to users via `toast.error(error.message)`.

---

## 5. Register the procedure

**`src/orpc/router/index.ts`** — add the import and re-export:

```ts
import { getMyEntities, createMyEntity, updateMyEntity, deleteMyEntity } from './myDomain'

export default {
  // ...existing procedures...
  getMyEntities,
  createMyEntity,
  updateMyEntity,
  deleteMyEntity,
}
```

The procedure name in this export object becomes the call name on the client (`orpc.getMyEntities.call(...)`).

---

## 6. Data hooks to consume procedures

One file per operation in `src/data/<domain>/`. See the `react-components` skill or `src/data/` for the query/mutation hook patterns — they use `orpc.<procedureName>.call(input)` as the `queryFn`/`mutationFn`.

Quick reference:
```ts
// Query
queryFn: () => orpc.getMyEntities.call({ pageIndex, pageSize, sortBy, sortOrder })

// Mutation
mutationFn: (input: CreateMyEntityInputType) => orpc.createMyEntity.call(input)

// After mutation — invalidate stale queries
queryClient.invalidateQueries({ queryKey: ['myEntitiesList'] })
```

---

## 7. Prisma transactions

Use `prisma.$transaction()` when you need atomicity across multiple writes:

```ts
const result = await prisma.$transaction(async (tx) => {
  const a = await tx.modelA.create({ data: { ... } })
  const b = await tx.modelB.create({ data: { ..., aId: a.id } })
  return b
})
```

Always check for conflicts *inside* the transaction when race conditions matter (e.g. booking slot conflicts).
