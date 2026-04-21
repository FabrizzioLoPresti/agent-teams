---
name: create-ui-component
description: Create React components following alta-cancha-fs conventions. Use when building new components, containers, data hooks, or util functions. Covers file naming (lowerCamelCase), component naming (PascalCase), TanStack Query hooks via ORPC, container/presentational split, Shadcn UI usage, and TypeScript patterns.
---

# create-ui-component

Create React components following the **alta-cancha-fs** project conventions exactly.
Always read existing components in the same domain before creating new ones — consistency with surrounding code is the highest priority.

## Scope Discipline

**Only create or modify the files required to implement this component.** Do not reformat, restructure, or touch any file outside the task scope — even if you notice style issues while reading for context. Report unrelated issues; never fix them inline.

## Step-by-step process

1. **Read existing files** in the same domain (`src/components/[domain]/`) before writing anything.
2. **Plan the files** — component, data hook, utils, skeleton.
3. **Create files in order**: utils → data hook → presentational component → container → skeleton.
4. **Run the `react-component-auditor` agent** after creation to verify quality.

---

## File naming

| What            | Convention                              | Example                                       |
| --------------- | --------------------------------------- | --------------------------------------------- |
| Component file  | `lowerCamelCase.tsx`                    | `bookingForm.tsx`                             |
| Form file       | `[name]Form.tsx` (always suffix `Form`) | `bookingForm.tsx`, `complexForm.tsx`          |
| Data hook file  | `kebab-case.ts` in `src/data/[domain]/` | `src/data/booking/get-bookings-by-fieldId.ts` |
| Util file       | `camelCase.ts` in `src/utils/`          | `src/utils/booking.ts`                        |
| Table hook file | `use[Name]Table.ts` next to the table   | `useComplexesTable.ts`                        |

**Component placement:**

- `src/components/[domain]/cards/` — card components
- `src/components/[domain]/modals/` — modal components
- `src/components/[domain]/forms/` — form components
- `src/components/[domain]/tables/` — table + column + hook files
- `src/components/[domain]/skeletons/` — skeleton components
- `src/components/[domain]/general/` — containers and general layout components

---

## Component naming

- **File:** `lowerCamelCase.tsx` — `bookingModal.tsx`, `complexesTable.tsx`
- **Form file:** always suffix `Form` — file is `[name]Form.tsx`, exported function is `[Name]Form` (e.g., file `bookingForm.tsx` → `const BookingForm = ...`)
- **Exported function:** `PascalCase` matching the file — `const BookingModal = ...`
- **Default export** at the bottom of every component file
- **Props type:** `type Props = { ... }` — always named `Props`, never `ComponentNameProps`

```typescript
// File: bookingModal.tsx
import type { ComplexType } from '@/types/complex'

type Props = {
  complexId: ComplexType['id']  // Always use indexed access types for entity IDs
  isOpen: boolean
}

const BookingModal = ({ complexId, isOpen }: Props) => { ... }

export default BookingModal
```

---

## Component file structure

Follow this order in every component file:

```typescript
// 1. External imports (React, libraries)
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'

// 2. UI component imports from @/components/ui/
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// 3. Data hook imports from @/data/[domain]/
import { useBookingsByFieldId } from '@/data/booking/get-bookings-by-fieldId'

// 4. Util, schema and type imports
import { subdivisionOptions } from '@/utils/booking'
import { BookingFormSchema } from '@/orpc/schemas/booking'
import type { BookingFormType } from '@/types/booking'

// 5. Props type
type Props = {
  complexId: string
  onSuccess?: () => void
}

// 6. Constants (SCREAMING_SNAKE_CASE)
const FORM_DEFAULT_VALUES: BookingFormType = {
  fieldId: '',
  bookingDate: new Date(),
}

// 7. Component function with JSDoc for non-obvious logic
const BookingForm = ({ complexId, onSuccess }: Props) => {
  // 7a. Data hooks first
  const { bookingsByFieldId, isLoadingBookingsByFieldId, isErrorBookingsByFieldId } =
    useBookingsByFieldId(...)

  // 7b. Form hooks
  const form = useForm<BookingFormType>({
    resolver: zodResolver(BookingFormSchema),
    defaultValues: FORM_DEFAULT_VALUES,
  })

  // 7c. Local state
  const [selectedField, setSelectedField] = useState<string | null>(null)

  // 7d. Derived / computed values
  const watchedFieldId = form.watch('fieldId')

  // 7e. Effects
  useEffect(() => {
    if (isErrorBookingsByFieldId) toast.error('Error al obtener las reservas')
  }, [isErrorBookingsByFieldId])

  // 7f. Handlers (prefix with `handle`)
  const handleSubmit = async (data: BookingFormType) => { ... }

  // 7g. Loading / error early returns
  if (isLoadingBookingsByFieldId) return <BookingFormSkeleton />

  // 7h. Render
  return (
    <Card>
      <CardContent>...</CardContent>
    </Card>
  )
}

export default BookingForm
```

---

## Container vs Presentational split

**Container** — fetches data, manages loading/error states, composes presentational components.
**Presentational** — receives props only, renders UI, no data fetching.

```typescript
// src/components/profile/general/complexesContainer.tsx
const ComplexesContainer = () => {
  const { complexesList, isLoadingComplexesList, isErrorComplexesList } = useComplexesList()

  useEffect(() => {
    if (isErrorComplexesList) toast.error('Error al obtener los complejos')
  }, [isErrorComplexesList])

  if (isLoadingComplexesList) return <ComplexesTableSkeleton />

  return <ComplexesTable complexes={complexesList ?? []} />
}
export default ComplexesContainer
```

```typescript
// src/components/profile/tables/complexes/complexesTable.tsx
type Props = { complexes: ComplexType[] }

const ComplexesTable = ({ complexes }: Props) => (
  <DataTable columns={columns} data={complexes} />
)
export default ComplexesTable
```

---

## Data hooks (TanStack Query via ORPC)

**Location:** `src/data/[domain]/[action-in-kebab-case].ts`

### Query hook

```typescript
// src/data/complex/get-complexes.ts
import { useQuery } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'

interface UseComplexesListParams {
  userId: UserType['id']  // Use indexed access types — never raw string for entity IDs
}

export const useComplexesList = ({ userId }: UseComplexesListParams) => {
  const { data, refetch, isLoading, isError, error } = useQuery({
    queryKey: ['complexesList', userId],
    queryFn: () => orpc.getComplexesList.call({ userId }),
    staleTime: 1000 * 60 * 5,
    enabled: !!userId,
  })

  return {
    complexesList: data,
    refetchComplexesList: refetch,
    isLoadingComplexesList: isLoading,
    isErrorComplexesList: isError,
    complexesListError: error,
  }
}
```

**Rules:**

- Hook name: `use[Domain][Action]` — `useComplexesList`, `useBookingsByFieldId`
- **Rename every returned property** with a domain suffix — `isLoading` → `isLoadingComplexesList`
- `enabled` guard whenever any param can be undefined/falsy
- `staleTime: 1000 * 60 * 5` (5 min) unless data needs to be fresh
- Always call ORPC via `orpc.[endpoint].call(params)` — never REST or GraphQL

### Mutation hook

```typescript
// src/data/booking/add-booking.ts
import { useMutation } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import type { CreateBookingInputType } from '@/types/booking'

export const useAddBooking = () => {
  const { mutate, mutateAsync, data, isPending, isError, error, isSuccess } =
    useMutation({
      mutationFn: (input: CreateBookingInputType) =>
        orpc.addBooking.call(input),
    })

  return {
    addBooking: mutate,
    addBookingAsync: mutateAsync,
    addBookingData: data,
    isPendingAddBooking: isPending,
    isErrorAddBooking: isError,
    addBookingError: error,
    isSuccessAddBooking: isSuccess,
  }
}
```

---

## Utils

Extract logic to `src/utils/` when a function:

- Is used in 2+ components, OR
- Contains business logic with no JSX (independently testable)

```typescript
// src/utils/booking.ts
export const subdivisionOptions = (
  selectedField: FieldByComplexIdType,
  fields: FieldByComplexIdType[],
) =>
  selectedField?.isDividable
    ? [
        {
          value: selectedField.id,
          label: `${selectedField.title} (${selectedField.capacity})`,
        },
        ...fields
          .filter((f) => f.parentFieldId === selectedField.id)
          .map((sf) => ({
            value: sf.id,
            label: `${sf.title} (${sf.capacity})`,
          })),
      ]
    : []
```

---

## Forms (React Hook Form + Zod)

Schemas live in `src/orpc/schemas/[domain].ts`. Never duplicate schema logic in a component.

```typescript
// schema (already exists or create it)
export const BookingFormSchema = z.object({
  fieldId: z.cuid(),
  bookingDate: z.date(),
  notes: z.string().max(500).optional().default(''),
})
export type BookingFormType = z.infer<typeof BookingFormSchema>

// in component
const form = useForm<BookingFormType>({
  resolver: zodResolver(BookingFormSchema),
  defaultValues: FORM_DEFAULT_VALUES,
})
```

For reusable form fields, use the `FormFields` namespace pattern (see `bookingFormFields.tsx`):

```typescript
export const FormFields = {
  TextField,
  SelectField,
  DatePickerField,
  SubmitButton,
}
```

---

## Shadcn UI

- Import from `@/components/ui/[component]` — never modify those files
- Add new components with: `pnpx shadcn@latest add <component>`
- Use `cn()` from `@/lib/utils` to merge Tailwind classes conditionally

---

## Error handling & feedback

```typescript
import { toast } from 'sonner'

// Success / error toasts
toast.success('Reserva creada exitosamente')
toast.error('Error al crear la reserva')

// In containers: trigger toast via useEffect on error flag
useEffect(() => {
  if (isErrorBookings) toast.error('Error al obtener las reservas')
}, [isErrorBookings])

// Loading state: return a skeleton, never null or spinner in the middle of a layout
if (isLoading) return <BookingModalSkeleton />
```

Always create a `[ComponentName]Skeleton` in `src/components/[domain]/skeletons/` when building a container.

---

## React Compiler — no manual memoization

The project uses **React 19 with the React Compiler** enabled. The compiler automatically inserts optimal memoization at build time.

- **Do not use** `useMemo`, `useCallback`, or `React.memo`
- The compiler handles all reactive-scope memoization more granularly than manual annotations
- Exception: keep manual memoization only when a third-party library explicitly requires a stable reference (e.g., a library that checks referential equality on a prop)

---

## TypeScript rules

- Strict mode — no `any`, no unused variables or imports
- Derive types from Zod schemas: `z.infer<typeof Schema>`
- Use `type` (not `interface`) for component Props
- Generic form fields typed as `<T extends FieldValues>`
- Avoid `as` type assertions
- **State variables and selected-ID values must use indexed access types** — never raw primitives. Derive the type from the domain type:

```typescript
// ✅ Correct
const [selectedComplexId, setSelectedComplexId] = useState<ComplexType['id'] | null>(null)
const [selectedFieldId, setSelectedFieldId] = useState<FieldType['id'] | null>(null)

// ❌ Wrong
const [selectedComplexId, setSelectedComplexId] = useState<string | null>(null)
```

  This applies to all `useState`, props, and local variables that hold an ID or a specific property of a domain entity.

---

## Pre-flight checklist

- [ ] Component file is `lowerCamelCase.tsx`; exported function is `PascalCase`
- [ ] Data hooks are in `src/data/[domain]/` with kebab-case filenames
- [ ] Reusable logic extracted to `src/utils/[domain].ts`
- [ ] Container handles loading/error/empty states; presentational only renders
- [ ] All hook return properties renamed with domain suffix
- [ ] `enabled` guard on queries with optional/falsy params
- [ ] Error surfaced via `toast.error()` inside a `useEffect`
- [ ] Loading state returns a Skeleton component
- [ ] `export default ComponentName` at the bottom of each file
- [ ] No unused imports or variables
- [ ] State variables holding IDs or entity properties typed with indexed access (`EntityType['field']`), not raw primitives
