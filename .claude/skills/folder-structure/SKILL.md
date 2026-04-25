---
name: folder-structure
description: Project folder structure rules and naming conventions for alta-cancha-fs. Use when creating new files, adding a new domain/entity, or implementing any feature that involves routes, components, oRPC procedures, data hooks, schemas, or types.
compatibility: alta-cancha-fs project (TanStack Start + oRPC + Prisma)
---

## Layer Map — Where Does Each File Go?

| What you're creating | Location |
|---|---|
| Zod schemas for a domain | `src/orpc/schemas/<domain>.ts` |
| oRPC handler (CRUD + Prisma logic) | `src/orpc/router/<domain>.ts` |
| Register a new procedure | `src/orpc/router/index.ts` (flat export object) |
| TypeScript types | `src/types/<domain>.ts` |
| React Query hooks | `src/data/<domain>/<verb>-<entity>.ts` |
| Static constants / enum maps | `src/config/<domain>.ts` |
| Page or route | `src/routes/<prefix>/<section>/` |
| React components | `src/components/<domain>/<type>/` |
| Pure utility functions | `src/utils/<domain>.ts` |

**Route prefix by access level:**
- `_general/` → public (no auth)
- `_customers/` → `customerComplex` role
- `_owners/` → `ownerComplex` role
- `_users/` → any authenticated user

Sections with sub-pages use `route.tsx` (layout + middleware) + `index.tsx` (main page).

---

## Naming Conventions

### oRPC Procedures
`get<Entities>List` · `getMy<Entities>List` · `get<Entity>ById` · `create<Entity>` · `update<Entity>` · `update<Entity><SubResource>` · `delete<Entity>`

### Zod Schemas (`src/orpc/schemas/<domain>.ts`)
- Base entity (mirrors Prisma model): `<Entity>Schema`
- Create API input: `Create<Entity>InputSchema`
- Create form input (with user-facing error messages in Spanish): `Create<Entity>FormSchema`
- Create response: `Create<Entity>ResponseSchema`
- Update input / response: `Update<Entity>InputSchema` / `Update<Entity>ResponseSchema`
- Delete input / response: `Delete<Entity>InputSchema` / `Delete<Entity>ResponseSchema`
- Get by ID input / response: `Get<Entity>ByIdInputSchema` / `<Entity>ByIdResponseSchema`
- Paginated list input: `Get<Entities>ByUserIdInputSchema`
- Paginated list response: `<Entities>WithPaginationResponseSchema`
- Table row schema: `<Entities>TableResponseSchema`

### TypeScript Types (`src/types/<domain>.ts`)
All types are `z.infer<typeof Schema>` — never define types manually. Always suffix with `Type`:
`FieldType` · `CreateFieldInputType` · `CreateFieldFormType` · `FieldByIdResponseType`

### React Query Hooks (`src/data/<domain>/`)
- File name: kebab-case → `get-fields.ts`, `add-field.ts`, `delete-field.ts`
- Hook name: camelCase with `use` prefix
  - Queries: `use<Entity>List` · `use<Entity>ById` · `use<Entity>By<Relation>`
  - Mutations: `useAdd<Entity>` · `useUpdate<Entity>` · `useDelete<Entity>`
- `queryKey` pattern: `['<camelCaseEntityList>', ...params]`
- Mutations must call `queryClient.invalidateQueries` in `onSuccess`
- Always use `orpc.<procedure>.call(input)` — never call the raw `client` directly

### Constants (`src/config/<domain>.ts`)
- All exports in `SCREAMING_SNAKE_CASE`
- `<ENTITY>_VALUES` → `as const` array used in `z.enum()`
- `<ENTITY>_MAP` → `{ value, label }[]` array used in UI selects
- `CREATE_<ENTITY>_FORM_DEFAULT_VALUES` → default values for the create form

### Components (`src/components/<domain>/`)
- File names: `camelCase.tsx` (e.g. `fieldForm.tsx`, `complexModal.tsx`)
- Exported component names: `PascalCase` (e.g. `FieldForm`, `ComplexModal`)
- Sub-folders by type: `forms/` · `modals/` · `cards/` · `tables/` · `skeletons/` · `general/` · `charts/`
- Table pattern: always a folder `tables/<entity>/` containing:
  - `columnsTable.tsx` — column definitions
  - `<entity>Table.tsx` — table component
  - `use<Entity>Table.ts` — table state hook
- `ui/` is Shadcn-only → add components with `pnpx shadcn@latest add <component>`

---

## Non-Obvious Rules

- **No service layer** — oRPC handlers in `src/orpc/router/` access Prisma directly.
- **Schemas are the single source of truth** — never define types independently of schemas.
- **One file per mutation** in `src/data/` — don't bundle multiple mutations together.
- **Route files hold no business logic** — only import from `src/components/` and `src/data/`.
- **Two separate auth middlewares** — don't confuse them:
  - `src/middlewares/auth.ts` → TanStack Start route middleware, applied in `route.tsx` via `server: { middleware: [authMiddleware] }`
  - `src/orpc/middlewares/auth.ts` → oRPC middleware, applied to procedures via `authorizedMiddleware`
- **Public oRPC procedures** use `baseInputValidationMiddleware`; **protected ones** use `authorizedMiddleware`.

---

## Creation Order for a New Domain

Follow this order when adding a new entity end-to-end:

1. `prisma/schema.prisma` → add model, then run `pnpm db:migrate`
2. `src/config/<entity>.ts` → `*_VALUES`, `*_MAP`, form defaults
3. `src/orpc/schemas/<entity>.ts` → all Zod schemas
4. `src/types/<entity>.ts` → all types inferred from schemas
5. `src/orpc/router/<entity>.ts` → handlers using Prisma
6. `src/orpc/router/index.ts` → add new procedure exports
7. `src/data/<entity>/` → one React Query hook file per operation
8. `src/components/<domain>/` → UI components (forms, modals, tables, etc.)
9. `src/routes/<prefix>/<section>/` → pages that consume the components
