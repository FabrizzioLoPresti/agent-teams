---
name: react-components
description: >
  React 19 component creation patterns for alta-cancha-fs. Use this skill whenever you need to create or edit a React component, form, table, container, card, modal, skeleton, or any UI element. Covers the exact component structure used in this codebase (tsrafce pattern), Shadcn UI usage, Tailwind CSS custom variables, React 19 rules (React Compiler active — no useMemo/useCallback/memo needed), form architecture with react-hook-form + zod, TanStack Table pattern for data tables, and folder placement conventions. Always consult this skill before writing any .tsx component file.
---

# React Component Patterns for alta-cancha-fs

**Stack:** React 19 + TanStack Start + Tailwind CSS v4 + Shadcn/Radix + react-hook-form + TanStack Table

---

## React 19 — what changes

This project runs **`babel-plugin-react-compiler`** (React Compiler). The compiler automatically memoizes components and hooks — do not manually add `useMemo`, `useCallback`, or `React.memo`. They are redundant noise here and signal misunderstanding of the setup.

What to use instead:
- Expensive computations → just compute them inline; the compiler handles it
- Stable callbacks → define them normally; the compiler stabilizes refs automatically
- Component re-render prevention → no `memo()` wrapper needed

`useState`, `useEffect`, `useRef`, `useContext` are still used normally.

---

## Component anatomy (tsrafce pattern)

Every component follows this exact structure:

```tsx
type Props = {
  title: string
  count?: number
}

const MyComponent = ({ title, count }: Props) => {
  return (
    <div>
      <p>{title}</p>
    </div>
  )
}

export default MyComponent
```

Rules:
- `type Props = {}` always at the top, even if empty (`type Props = {}`)
- Arrow function, **not** `function MyComponent()`
- **Default export only** — never named exports for components
- `@/` alias for all internal imports
- File name: `camelCase.tsx` matching the component name

---

## Folder placement

```
src/components/
├── ui/              ← Shadcn primitives only (never edit these)
├── layouts/         ← App-wide layout pieces (navbar, sidebar, dataTable)
│   └── tables/
│       └── dataTable.tsx
├── auth/            ← Auth-specific components
│   ├── forms/
│   └── buttons/
├── <domain>/        ← One folder per feature domain
│   ├── forms/       ← Forms for this domain
│   ├── tables/      ← Tables for this domain
│   │   └── <entity>/
│   │       ├── <entity>Table.tsx
│   │       ├── columnsTable.tsx
│   │       └── use<Entity>Table.ts
│   ├── cards/       ← Card-style display components
│   ├── modals/      ← Dialog/sheet wrappers
│   ├── skeletons/   ← Loading placeholders
│   └── general/     ← Container/orchestration components
```

When adding a new domain (e.g. `review`, `notification`), replicate this structure. Never put domain-specific components in `ui/` or `layouts/`.

---

## Tailwind — custom colors and utilities

**Brand color classes** (defined in `src/styles.css` via `@theme inline`):
```
bg-ac-lime          ← #dbff5e — brand accent (lime green)
bg-ac-dark-black    ← dark card background
bg-ac-dark-gray     ← slightly lighter dark
bg-ac-dark-blue     ← deep blue-dark
bg-ac-mid-gray      ← mid-range dark gray
bg-ac-light-gray    ← lighter gray text/border
```

**Semantic color classes** (CSS variable-backed, light/dark aware):
```
bg-background / text-foreground
bg-primary / text-primary-foreground   ← lime green in light, adapted in dark
bg-secondary / text-secondary-foreground
bg-muted / text-muted-foreground
bg-accent / text-accent-foreground
bg-destructive / text-white            ← errors/danger
bg-card / text-card-foreground
bg-sidebar / text-sidebar-foreground
```

**Predefined utility classes:**
```tsx
className="ac-container"      // container mx-auto px-6 md:px-8 lg:px-10
className="ac-btn-principal"  // styled CTA button (bg-ac-mid-gray, hover:bg-ac-lime)
```

**Class merging** — always use `cn()` for conditional or merged classes:
```tsx
import { cn } from '@/lib/utils'

className={cn('base-class', isActive && 'active-class', className)}
```

---

## Shadcn components

All 37 Shadcn primitives are pre-installed in `src/components/ui/`. Import directly:

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
```

To add a new Shadcn component not yet installed:
```bash
pnpx shadcn@latest add <component>
```

Icons always come from `lucide-react`:
```tsx
import { Loader2, TrendingUp, Calendar } from 'lucide-react'
<Loader2 className="size-4 animate-spin" />
```

---

## Forms

Forms always use **react-hook-form + zod + Shadcn Form**. The validation schema lives in `src/orpc/schemas/<domain>.ts` and is shared between the form and the oRPC handler.

### Standard form pattern

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Form } from '@/components/ui/form'
import { MySchema } from '@/orpc/schemas/myDomain'
import type { MyFormType } from '@/types/myDomain'
import FormFields from './myFormFields'
import { toast } from 'sonner'

type Props = {
  onSuccess?: () => void
}

const MyForm = ({ onSuccess }: Props) => {
  const form = useForm<MyFormType>({
    resolver: zodResolver(MySchema),
    defaultValues: { title: '', description: '' },
  })

  const onSubmit = async (values: MyFormType) => {
    try {
      // call mutation here
      toast.success('Guardado correctamente.')
      onSuccess?.()
    } catch {
      toast.error('Ocurrió un error. Intentá de nuevo.')
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormFields.TextField
          control={form.control}
          name="title"
          label="Título"
          placeholder="Escribí el título"
        />
        <FormFields.SubmitButton
          label="Guardar"
          isLoading={form.formState.isSubmitting}
          loadingLabel="Guardando..."
        />
      </form>
    </Form>
  )
}

export default MyForm
```

### FormFields file (`<domain>FormFields.tsx`)

Each form domain has its own FormFields helper file that wraps Shadcn `<FormField>` + `<FormItem>` into reusable typed helpers. Model new ones on `src/components/auth/forms/authFormFields.tsx` or `src/components/booking/forms/bookingFormFields.tsx`.

Base field prop type from `src/types/forms.ts`:
```tsx
import type { BaseFieldProps } from '@/types/forms'
// { control, name, label?, placeholder?, description?, disabled? }
```

Available field types to model:
- `TextField` / `EmailField` / `PasswordField` — `<Input>`
- `TextAreaField` — `<Textarea>`
- `SelectField` — `<Select>` with options array
- `DatePickerField` — `<Calendar>` inside `<Popover>`
- `SubmitButton` — `<Button type="submit">` with loading state

Multi-column layout:
```tsx
<div className="grid lg:grid-cols-2 gap-x-4">
  <FormFields.TextField ... />
  <FormFields.SelectField ... />
</div>
```

---

## Tables

Tables use **TanStack React Table v8** + the generic `DataTable` wrapper at `src/components/layouts/tables/dataTable.tsx`.

Each table domain has three files:

### `<entity>Table.tsx` — the component

```tsx
import DataTable from '@/components/layouts/tables/dataTable'
import { useMyEntityTable } from './useMyEntityTable'

type Props = {}

const MyEntityTable = ({}: Props) => {
  const { data, columns, pagination, setPagination, sorting, setSorting, pageCount } =
    useMyEntityTable()

  return (
    <DataTable
      data={data}
      columns={columns}
      caption="Descripción de la tabla"
      pagination={pagination}
      onPaginationChange={setPagination}
      sorting={sorting}
      onSortingChange={setSorting}
      pageCount={pageCount}
      manualPagination
      manualSorting
    />
  )
}

export default MyEntityTable
```

### `columnsTable.tsx` — column definitions

```tsx
import { createColumnHelper } from '@tanstack/react-table'
import type { MyEntityType } from '@/types/myDomain'

const columnHelper = createColumnHelper<MyEntityType>()

export const getColumnsTable = () => [
  columnHelper.accessor('name', {
    header: 'Nombre',
    enableSorting: true,
    maxSize: 200,
    cell: (info) => <span>{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: 'actions',
    header: 'Acciones',
    enableSorting: false,
    maxSize: 100,
    cell: (info) => <ActionsMenu row={info.row.original} />,
  }),
]
```

### `useMyEntityTable.ts` — state and data hook

```tsx
import { useState } from 'react'
import type { PaginationState, SortingState } from '@tanstack/react-table'
import { getColumnsTable } from './columnsTable'
import { useMyEntityData } from '@/data/myDomain/useMyEntityData'

export const useMyEntityTable = () => {
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
  const [sorting, setSorting] = useState<SortingState>([])

  const { data, refetch } = useMyEntityData({ pagination, sorting })

  const columns = getColumnsTable()

  return {
    data: data?.items ?? [],
    columns,
    pagination,
    setPagination,
    sorting,
    setSorting,
    pageCount: data?.pageCount ?? 0,
    refetch,
  }
}
```

---

## Data hooks (React Query)

All server data goes through custom hooks in `src/data/<domain>/`. These wrap `orpc` + React Query and expose domain-prefixed return values to avoid collisions when multiple hooks are used in the same component.

**File location:** `src/data/<domain>/<operation>.ts` — one file per operation.

### Query hook (read data)

```ts
import { useQuery } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import type { MyInputType } from '@/types/myDomain'

type UseMyDataParams = MyInputType & {
  enabled?: boolean
}

export const useMyData = ({ id, enabled = true }: UseMyDataParams) => {
  const { data, refetch, isLoading, isError, error } = useQuery({
    queryKey: ['myData', id],         // include all params that affect the result
    queryFn: () => orpc.getMyData.call({ id }),
    staleTime: 1000 * 60 * 5,        // 5 min cache — adjust per use case
    enabled,
  })

  return {
    myData: data,                     // prefix with domain to avoid name collision
    refetchMyData: refetch,
    isLoadingMyData: isLoading,
    isErrorMyData: isError,
    myDataError: error,
  }
}
```

### Mutation hook (create / update / delete)

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import type { CreateMyEntityInputType } from '@/types/myDomain'

export const useAddMyEntity = () => {
  const queryClient = useQueryClient()

  const {
    mutate: addMyEntity,
    mutateAsync: addMyEntityAsync,
    isPending: isPendingAddMyEntity,
    isError: isErrorAddMyEntity,
    error: addMyEntityError,
    isSuccess: isSuccessAddMyEntity,
  } = useMutation({
    mutationFn: (input: CreateMyEntityInputType) => orpc.addMyEntity.call(input),
    onSuccess: () => {
      // Invalidate every query that shows stale data after this mutation
      queryClient.invalidateQueries({ queryKey: ['myEntityList'] })
    },
    onError: (error) => {
      console.error('Error adding myEntity:', JSON.stringify(error))
    },
  })

  return {
    addMyEntity,
    addMyEntityAsync,
    isPendingAddMyEntity,
    isErrorAddMyEntity,
    addMyEntityError,
    isSuccessAddMyEntity,
  }
}
```

Key points:
- **Always invalidate** related queries in `onSuccess` so the UI reflects the change
- Use `mutateAsync` when you need to `await` the result in a form's `onSubmit`
- Use `mutate` for fire-and-forget calls (button clicks without form state)
- The `queryKey` array must include every param that changes the result — wrong keys cause stale data bugs

### Using hooks in components

```tsx
// In a container
const { myData, isLoadingMyData } = useMyData({ id })

// In a form's onSubmit
const { addMyEntityAsync, isPendingAddMyEntity } = useAddMyEntity()

const onSubmit = async (values: MyFormType) => {
  try {
    await addMyEntityAsync(values)
    toast.success('Guardado correctamente.')
  } catch {
    toast.error('Ocurrió un error.')
  }
}
```

---

## Containers and loading states

Containers fetch their own data and own their loading/error states. They don't receive data via props — they call data hooks directly.

```tsx
import { useMyData } from '@/data/myDomain/useMyData'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

type Props = {}

const MyContainer = ({}: Props) => {
  const { data, isLoading, isError } = useMyData()

  if (isLoading) return <MyContainerSkeleton />

  if (isError) {
    toast.error('No se pudieron cargar los datos.')
    return null
  }

  return (
    <div className="space-y-4">
      {data?.map((item) => <MyCard key={item.id} data={item} />)}
    </div>
  )
}

export default MyContainer
```

Skeleton components mirror the visual structure of the loaded state using `<Skeleton className="h-x w-x rounded-x" />`. Place them in `<domain>/skeletons/`.

---

## oRPC error handling in components

When using `mutateAsync` in a form or action, oRPC errors arrive as `ORPCError` instances. The message set on the backend (`throw errors.CONFLICT({ message: '...' })`) maps directly to `error.message` — show it to the user as-is.

```tsx
import { ORPCError } from '@orpc/client'
import { toast } from 'sonner'

// Standard pattern for any oRPC mutateAsync call
const onSubmit = async (values: MyFormType) => {
  try {
    await addMyEntityAsync(values)
    toast.success('Guardado correctamente.')
    onClose?.()
  } catch (error: unknown) {
    if (error instanceof ORPCError) {
      toast.error(error.message)   // server message — already in Spanish
    } else {
      toast.error('Ocurrió un error. Intentá de nuevo.')
    }
  }
}
```

The same pattern applies to non-form actions (button clicks, dialog confirms):

```tsx
const handleDelete = async (e: React.MouseEvent) => {
  e.preventDefault()
  try {
    await deleteMyEntityAsync({ id })
    toast.success('Eliminado exitosamente.')
    onClose()
  } catch (error: unknown) {
    if (error instanceof ORPCError) {
      toast.error(error.message)
    } else {
      toast.error('Error al eliminar. Intentá nuevamente.')
    }
  }
}
```

For **Better Auth** errors (login, signup, OAuth), use `getAuthErrorMessage` which maps error codes to Spanish strings:

```tsx
import { getAuthErrorMessage } from '@/utils/auth'

// Inside Better Auth callback
onError: (ctx) => {
  toast.error(getAuthErrorMessage(ctx.error))
}
```

---

## Notifications

```tsx
import { toast } from 'sonner'

toast.success('Mensaje de éxito.')
toast.error('Ocurrió un error.')
toast.info('Información.')
toast.warning('Advertencia.')
```

---

## Precise typing rule

**Never use primitive `string`, `number`, or `boolean` when a more specific indexed type exists.**

This applies to **any field** of a domain entity — not just `id`. Whenever a prop, parameter, state field, or variable holds a value that maps to a field on a domain type, use the indexed type:

```ts
// ❌ Wrong — too broad
type Props = {
  complexId: string | undefined
  complexTitle: string
  complexTimezone: string
  fieldId: string
  fieldTitle: string
  isVisible: boolean
  isDividable: boolean
}

// ✅ Correct — exact, refactor-safe
import type { ComplexType, ComplexesTableResponseType } from '@/types/complex'
import type { FieldType } from '@/types/field'

type Props = {
  complexId: ComplexType['id'] | undefined
  complexTitle: ComplexType['title']
  complexTimezone: ComplexType['timezone']
  fieldId: FieldType['id']
  fieldTitle: FieldType['title']
  isVisible: FieldType['isVisible']
  isDividable: FieldType['isDividable']
}
```

This applies everywhere:
- Component `type Props`
- Hook parameters and return types
- Local state type annotations (`useState<{ fieldTitle: FieldType['title'] }>`)
- oRPC input schemas (use `z.cuid()` not `z.string()` for IDs)
- Data hook signatures

**When to use which type:**
- Use the most specific schema type available. If a component receives data from a table response, use `ComplexesTableResponseType['field']`. If it receives data from the full entity, use `ComplexType['field']`.
- For IDs always use the entity's own type: `ComplexType['id']`, `FieldType['id']`.
- For booleans like `isVisible`, `isActive`, `isDividable` — always index from the domain type.
- For strings like `title`, `timezone`, `timezone` — always index from the domain type.

**Exception:** Generic UI utility types (e.g. a carousel that accepts `{ id: string; [key: string]: any }`) may use primitives when the component is intentionally domain-agnostic.

Benefits:
- If a field type changes in the schema, TypeScript propagates the error automatically
- Communicates intent — a reader knows exactly which entity and field this value represents
- Prevents accidentally passing the wrong entity's value (e.g. `complexTitle` where `fieldTitle` is expected)

---

## Quick reference

| Need | Import from |
|---|---|
| Class merging | `import { cn } from '@/lib/utils'` |
| Icons | `import { X } from 'lucide-react'` |
| Auth session | `import { authClient } from '@/lib/auth/auth-client'` |
| Data hooks | `import { useX } from '@/data/<domain>/useX'` |
| oRPC client | `import { orpc, client } from '@/orpc/client'` |
| Form types | `import type { BaseFieldProps } from '@/types/forms'` |
| Toast | `import { toast } from 'sonner'` |
| Router navigation | `import { useNavigate } from '@tanstack/react-router'` |
