---
name: orpc-endpoint
description: Scaffold a complete ORPC endpoint for alta-cancha-fs. Creates Zod schemas, TypeScript types, ORPC handler, and router registration following project conventions. Use when adding a new API operation (get, create, update, delete) to any domain.
argument-hint: "<domain> <operation> [description]"
---

# orpc-endpoint

Scaffold a **complete, production-ready ORPC endpoint** for alta-cancha-fs following all project conventions.

## Scope Discipline

**Only create or modify the files required to scaffold this endpoint.** Do not reformat, restructure, or touch any file outside the task scope — even if you notice style issues while reading for context. Report unrelated issues; never fix them inline.

## What this skill creates

1. **Zod schemas** in `src/orpc/schemas/[domain].ts`
2. **TypeScript types** in `src/types/[domain].ts`
3. **ORPC handler** in `src/orpc/router/[domain].ts`
4. **Router registration** in `src/orpc/router/index.ts` (if new domain)

## Step-by-step process

### Step 1 — Explore existing code

Before writing anything, read:
- `src/orpc/schemas/[domain].ts` — existing schemas for this domain
- `src/orpc/router/[domain].ts` — existing handlers for this domain
- `src/types/[domain].ts` — existing types
- `src/config/[domain].ts` — config constants and enums
- A similar handler in another domain for pattern reference

### Step 2 — Design the contract

Determine:
- Input schema name and fields (FormSchema if form-driven, InputSchema for API)
- Output schema (ResponseSchema, or WithPaginationResponseSchema for lists)
- Error cases: NOT_FOUND, CONFLICT, FORBIDDEN
- Whether to use `authorizedMiddleware` or `baseInputValidationMiddleware`
- Whether output needs `createApiResponseSchema` wrapper (mutations) or direct schema (queries)

### Step 3 — Create/update Zod schemas

```typescript
// src/orpc/schemas/[domain].ts

// 1. Enum values from config (if needed)
import { NEW_STATUS_VALUES } from '@/config/[domain]'
export const NewStatusEnum = z.enum(NEW_STATUS_VALUES)

// 2. Input schema
export const Create[Entity]InputSchema = z.object({
  // Required fields with validation
  title: z.string().min(1, 'El título es requerido').max(100),
  complexId: z.cuid(),
  // Optional fields with defaults
  notes: z.string().max(500).optional().default(''),
})

// 3. Response schema
export const [Entity]ResponseSchema = z.object({
  id: z.cuid(),
  title: z.string(),
  createdAt: z.date(),
})
```

Schema naming conventions:
- Form input: `[Action][Entity]FormSchema`
- API input: `[Create|Update|Delete|Get][Entity]InputSchema`
- Response: `[Entity]ResponseSchema`
- Array: `[Entities]ResponseSchema` (plural entity name)
- Paginated: `[Entities]WithPaginationResponseSchema`

ID field rules — non-negotiable:
- Entity IDs in input schemas: always `z.cuid()` — never `z.string()`
- Entity IDs in response schemas: always `z.cuid()` — never `z.string()`
- Example: `complexId: z.cuid()`, `id: z.cuid()` ✅ / `complexId: z.string()` ❌

### Schema composition patterns

Derive from a base entity schema instead of duplicating fields:

```typescript
// Base entity schema mirrors the full Prisma model
export const FieldSchema = z.object({
  id: z.cuid(),
  title: z.string(),
  complexId: z.cuid(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Response: use .pick() to select only needed fields
export const CreateFieldResponseSchema = FieldSchema.pick({
  id: true, title: true, isActive: true, createdAt: true,
})

// Response with relational data: .pick() + .extend()
export const FieldByIdResponseSchema = FieldSchema.pick({
  id: true, title: true, complexId: true,
}).extend({
  complexTitle: z.string(),  // denormalized join, not in Prisma model
})

// Update input: reuse create input, add id
export const UpdateFieldInputSchema = CreateFieldInputSchema.extend({ id: z.cuid() })
```

Form schema vs API input schema — they often differ:
- **FormSchema**: flat structure, UX validation messages, matches what the user types
- **InputSchema**: may be nested objects, UTC dates, cleaned for the server

The component's `onSubmit` transforms form data into the API input shape. Never use the same schema for both if the shapes differ.

Enum values always come from `src/config/[domain].ts`:

```typescript
import { SURFACE_VALUES } from '@/config/fields'
export const SurfaceEnum = z.enum(SURFACE_VALUES)
```

### Step 4 — Add TypeScript types

```typescript
// src/types/[domain].ts — only z.infer<>, no logic
import { Create[Entity]InputSchema, [Entity]ResponseSchema } from '@/orpc/schemas/[domain]'

export type Create[Entity]InputType = z.infer<typeof Create[Entity]InputSchema>
export type [Entity]ResponseType = z.infer<typeof [Entity]ResponseSchema>
```

### Step 5 — Implement the handler

```typescript
// src/orpc/router/[domain].ts
import { Sentry } from '@sentry/tanstackstart-react'
import { authorizedMiddleware } from '@/orpc/middlewares/auth'
import { Create[Entity]InputSchema, [Entity]ResponseSchema } from '@/orpc/schemas/[domain]'
import { createApiResponseSchema } from '@/orpc/schemas/api-response'
import { prisma } from '@/lib/prisma'

export const create[Entity] = authorizedMiddleware
  .input(Create[Entity]InputSchema)
  .output(createApiResponseSchema([Entity]ResponseSchema))
  .handler(async ({ input, context, errors }) => {
    return Sentry.startSpan({ name: 'create[Entity]' }, async () => {
      // 1. Ownership/existence check
      const parent = await prisma.[parent].findUnique({
        where: { id: input.parentId },
      })
      if (!parent) throw errors.NOT_FOUND({ message: '[Parent] no encontrado' })
      if (parent.ownerId !== context.user.id) {
        throw errors.FORBIDDEN({ message: 'No tenés permisos para esta operación' })
      }

      // 2. Conflict check (if applicable)
      const existing = await prisma.[entity].findFirst({
        where: { title: input.title, parentId: input.parentId },
      })
      if (existing) throw errors.CONFLICT({ message: '[Entity] ya existe' })

      // 3. Create in transaction
      const entity = await prisma.$transaction(async (tx) => {
        return tx.[entity].create({
          data: { ...input },
        })
      })

      // 4. Return wrapped response
      return {
        message: '[Entity] creado exitosamente',
        status: 201,
        data: { id: entity.id, title: entity.title, createdAt: entity.createdAt },
      }
    })
  })
```

Handler naming:
- `get{Entity}By{Field}` — getBookingsByFieldId
- `get{Entity}ById` — getComplexById
- `getMy{Entities}` — getMyComplexes
- `add{Entity}` — addBooking, addField
- `update{Entity}` — updateComplex
- `delete{Entity}` — deleteField

### Step 6 — Register in router

```typescript
// src/orpc/router/index.ts
import * as [domain]Procedures from './[domain]'

const router = base.router({
  // ... existing
  ...[domain]Procedures,
})
```

## Sentry instrumentation

Wrap mutations and handlers with complex business logic. Simple paginated reads don't need it.

```typescript
import * as Sentry from '@sentry/tanstackstart-react'

// ✅ Mutations — always wrap
export const createField = authorizedMiddleware
  .handler(async ({ input, errors, context }) => {
    return Sentry.startSpan({ name: 'createField' }, async () => { ... })
  })

// ✅ Complex queries with ownership checks or multi-step logic — wrap
export const getFieldById = authorizedMiddleware
  .handler(async ({ input, errors, context }) => {
    return Sentry.startSpan({ name: 'getFieldById' }, async () => { ... })
  })

// ❌ Simple paginated reads — skip Sentry
export const getFieldsList = authorizedMiddleware
  .handler(async ({ input }) => {
    const [total, fields] = await Promise.all([...])
    // no Sentry.startSpan needed
  })
```

Always import from `@sentry/tanstackstart-react` — never from `@sentry/react`.

## Transaction rules

Use `prisma.$transaction` when a mutation touches **multiple tables atomically**. For parallel reads, use `Promise.all` — never wrap reads in a transaction.

```typescript
// ✅ Multi-table mutation — use transaction
const result = await prisma.$transaction(async (tx) => {
  const field = await tx.field.create({ data: { ... } })
  await tx.fieldWorkingSchedule.createMany({ data: [...] })
  return field
})

// ✅ Soft delete cascade — use transaction
await prisma.$transaction(async (tx) => {
  await tx.field.updateMany({ where: { parentFieldId: input.id }, data: { isActive: false } })
  return tx.field.update({ where: { id: input.id }, data: { isActive: false } })
})

// ✅ Parallel reads — use Promise.all, no transaction
const [total, fields] = await Promise.all([
  prisma.field.count({ where }),
  prisma.field.findMany({ where, skip, take: pageSize }),
])
```

## Output wrapping rules

| Operation | Output wrapper |
|-----------|---------------|
| Create (mutation) | `createApiResponseSchema(ResponseSchema)` → returns `{ message, status, data }` |
| Update (mutation) | `createApiResponseSchema(ResponseSchema)` → returns `{ message, status, data }` |
| Delete (mutation) | `createApiResponseSchema(z.object({}))` → returns `{ message, status }` |
| Get by ID (query) | Direct `EntityResponseSchema` |
| Get list (query) | Direct `EntityResponseSchema.array()` |
| Paginated list (query) | `EntitiesWithPaginationResponseSchema` |

## Error catalog

```typescript
throw errors.UNAUTHORIZED({ message: '...' })   // 401 — no session
throw errors.NOT_FOUND({ message: '...' })       // 410 — resource missing
throw errors.CONFLICT({ message: '...' })        // 409 — duplicate/overlap
throw errors.FORBIDDEN({ message: '...' })       // 403 — wrong owner
throw errors.BAD_REQUEST({ message: '...' })     // 400 — invalid state
```

## Post-flight checklist

- [ ] Schema file updated — base entity schema derived via `.pick()` / `.extend()`, not copy-pasted
- [ ] Enum values imported from `src/config/[domain].ts`, not hardcoded in schema
- [ ] Types file updated with new `z.infer<>` types
- [ ] Handler implemented with `.input()`, `.output()`, and `.handler()`
- [ ] Ownership check in handler (if mutation on owned resource)
- [ ] Sentry span wraps mutations and complex queries — import from `@sentry/tanstackstart-react`
- [ ] `prisma.$transaction` used for multi-table writes; `Promise.all` used for parallel reads
- [ ] Handler registered in `src/orpc/router/index.ts`
- [ ] No inline schemas in handler (all in `src/orpc/schemas/`)
- [ ] No `any` types
- [ ] Typed error catalog used (`errors.NOT_FOUND(...)`, not `throw new Error()`)
