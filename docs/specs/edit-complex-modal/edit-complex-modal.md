# SPEC: Modal de Edición de Complejo Deportivo

**Status:** Pending implementation
**Fecha:** 2026-03-30
**Ubicación:** `/profile/complexes`
**Alcance:** Edición de complejo existente. Reutiliza el mismo modal y form de creación en modo dual-purpose.

---

## 1. Resumen

Implementar la edición de un complejo deportivo reutilizando **exactamente el mismo modal y formulario** del flujo de creación (`ComplexModal` + `ComplexForm`). El modal se abre desde el menú de acciones "Editar" en la tabla de complejos. El formulario se pre-llena con los datos existentes y, al guardar, llama a un nuevo procedimiento `updateComplex`.

La acción "Editar" en `columnsTable.tsx` ya existe como placeholder sin handler. No se crean nuevos componentes de UI — solo se hace dual-purpose el modal/form existente y se agrega la capa backend.

---

## 2. Decisiones de diseño

| Decisión                       | Elección                                                             | Razón                                                                             |
| ------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Reutilización del modal/form   | `complexId?` prop hace el form dual-purpose                          | Mismos 4 steps, misma validación, misma UX                                        |
| Schema de update               | `UpdateComplexInputSchema = CreateComplexInputSchema.extend({ id })` | Cero duplicación; misma validación que create                                     |
| Fetch de datos para edit       | En `ComplexModal`, no en `ComplexForm`                               | Mantiene el form puro; Suspense boundary en el container                          |
| Estado del modal de edición    | `editComplexId: string \| null` en `complexesContainer`              | El ID actúa como flag de apertura + identificador                                 |
| Helper de mapeo                | `mapComplexToFormDefaults()` en `config/complexes.ts`                | Convierte la respuesta anidada de `getComplexById` a la estructura plana del form |
| Badge de dirección pre-llenado | Prop `initialAddress` en `AddressAutocompleteField`                  | Muestra badge desde el inicio sin requerir interacción del usuario                |
| Nombres de constantes          | Mantener `CREATE_COMPLEX_FORM_*` sin renombrar                       | Evita churn; los steps y defaults sirven para ambos modos                         |

---

## 3. Arquitectura de archivos

### 3.1 Archivos nuevos a crear

```
src/
└── data/
    └── complex/
        └── update-complex.ts    # Hook: useUpdateComplex (mutation)
```

### 3.2 Archivos existentes a modificar

| Archivo                                                        | Cambio                                                                                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/orpc/schemas/complex.ts`                                  | Agregar `UpdateComplexInputSchema`, `UpdateComplexResponseSchema`; extender `ComplexByIdResponseSchema` con `currency`, `latitude`, `longitude` |
| `src/types/complex.ts`                                         | Agregar `UpdateComplexInputType`, `UpdateComplexResponseType`                                                                                   |
| `src/orpc/router/complex.ts`                                   | Agregar `currency`, `latitude`, `longitude` al select de `getComplexById`; agregar procedimiento `updateComplex`                                |
| `src/orpc/router/index.ts`                                     | Registrar `updateComplex`                                                                                                                       |
| `src/config/complexes.ts`                                      | Agregar helper `mapComplexToFormDefaults()`                                                                                                     |
| `src/components/profile/modals/complexModal.tsx`               | Aceptar `complexId?`, fetch con `useComplexById`, título dinámico, pasar defaults al form                                                       |
| `src/components/profile/forms/complexForm.tsx`                 | Aceptar `complexId?` + `defaultValues?`, lógica dual create/update en `onSubmit`                                                                |
| `src/components/profile/forms/complexFormFields.tsx`           | `StepNavigationButtons`: agregar `isEditMode`; `AddressAutocompleteField`: agregar `initialAddress`                                             |
| `src/components/profile/general/complexesContainer.tsx`        | Agregar estado `editComplexId`, handler, render modal con `<Suspense>`                                                                          |
| `src/components/profile/tables/complexes/columnsTable.tsx`     | Agregar `onEditComplex`, wiring onClick en "Editar"                                                                                             |
| `src/components/profile/tables/complexes/useComplexesTable.ts` | Pasar `onEditComplex` a `getColumnsTable`                                                                                                       |
| `src/components/profile/tables/complexes/complexesTable.tsx`   | Aceptar y forwardear prop `onEditComplex`                                                                                                       |

---

## 4. Backend — ORPC

### 4.1 Schemas Zod (`src/orpc/schemas/complex.ts`)

**Extender `ComplexByIdResponseSchema`** para incluir campos que el form de edición necesita pero que actualmente no se retornan (`currency`, `latitude`, `longitude`):

```typescript
export const ComplexByIdResponseSchema = ComplexSchema.extend({
  currency: z.enum(BOOKING_CURRENCY_VALUES),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  fields: z.array(FieldSchema),
})
```

**Agregar schemas de update** (al final del archivo):

```typescript
// UPDATE COMPLEX — API input (create + id)
export const UpdateComplexInputSchema = CreateComplexInputSchema.extend({
  id: z.cuid(),
})

// UPDATE COMPLEX — Response schema (misma forma que create)
export const UpdateComplexResponseSchema = CreateComplexResponseSchema
```

### 4.2 Tipos TypeScript (`src/types/complex.ts`)

```typescript
export type UpdateComplexInputType = z.infer<typeof UpdateComplexInputSchema>
export type UpdateComplexResponseType = z.infer<
  typeof UpdateComplexResponseSchema
>
```

### 4.3 Procedimiento ORPC `updateComplex` (`src/orpc/router/complex.ts`)

**Extender `getComplexById` select** — agregar tres campos al objeto `select`:

```typescript
currency: true,
latitude: true,
longitude: true,
```

**Agregar procedimiento:**

```typescript
// ============================================================================
// UPDATE COMPLEX
// ============================================================================
export const updateComplex = authorizedMiddleware
  .input(UpdateComplexInputSchema)
  .output(createApiResponseSchema(UpdateComplexResponseSchema))
  .handler(async ({ input, errors, context }) => {
    const userId = context.user.id
    try {
      // 1. Verificar existencia y ownership
      const existing = await prisma.complex.findUnique({
        where: { id: input.id },
        select: {
          ownerId: true,
          complexAddressId: true,
          complexContactId: true,
        },
      })
      if (!existing) {
        throw errors.NOT_FOUND({ message: 'Complejo no encontrado.' })
      }
      if (existing.ownerId !== userId) {
        throw errors.FORBIDDEN({
          message: 'No tenés permisos para editar este complejo.',
        })
      }

      // 2. Validar unicidad de título (excluyendo el propio complejo)
      const duplicate = await prisma.complex.findFirst({
        where: { title: input.title, id: { not: input.id } },
        select: { id: true },
      })
      if (duplicate) {
        throw errors.CONFLICT({
          message: 'Ya existe un complejo con ese nombre.',
        })
      }

      // 3. Actualizar en transacción: address → contact → complex
      const complex = await prisma.$transaction(async (tx) => {
        if (existing.complexAddressId) {
          await tx.complexAddress.update({
            where: { id: existing.complexAddressId },
            data: {
              street: input.address.street,
              city: input.address.city,
              state: input.address.state,
              country: input.address.country,
              zip: input.address.zip,
            },
          })
        }

        if (existing.complexContactId) {
          await tx.complexContact.update({
            where: { id: existing.complexContactId },
            data: {
              phone: input.contact.phone,
              website: input.contact.website,
              facebook: input.contact.facebook,
              twitter: input.contact.twitter,
              instagram: input.contact.instagram,
              youtube: input.contact.youtube,
            },
          })
        }

        return await tx.complex.update({
          where: { id: input.id },
          data: {
            title: input.title,
            description: input.description,
            timezone: input.timezone,
            currency: input.currency,
            cancellationPolicy: input.cancellationPolicy,
            latitude: input.latitude,
            longitude: input.longitude,
            geojson: {
              type: 'Point',
              coordinates: [input.longitude, input.latitude],
            },
            features: input.features,
          },
          select: {
            id: true,
            title: true,
            isActive: true,
            createdAt: true,
          },
        })
      })

      return {
        message: 'Complejo actualizado exitosamente',
        status: 200,
        data: {
          id: complex.id,
          title: complex.title,
          isActive: complex.isActive,
          createdAt: complex.createdAt,
        },
      }
    } catch (error) {
      console.error('Error al actualizar complejo:', error)
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

**Nota de diseño:** Sin Prisma schema changes — `Complex`, `ComplexAddress`, `ComplexContact` ya existen con todos los campos necesarios.

### 4.4 Registro en router (`src/orpc/router/index.ts`)

```typescript
import { ..., updateComplex } from './complex'

export default {
  // ... existentes sin cambios
  updateComplex,
}
```

---

## 5. Frontend — Data Hook (`src/data/complex/update-complex.ts`)

Patrón idéntico a `add-complex.ts`. La diferencia clave: `onSuccess` invalida también `complexById` del complejo editado.

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import { UpdateComplexInputType } from '@/types/complex'

export const useUpdateComplex = () => {
  const queryClient = useQueryClient()

  const {
    mutate: updateComplex,
    mutateAsync: updateComplexAsync,
    data: updateComplexData,
    isPending: isPendingUpdateComplex,
    isError: isErrorUpdateComplex,
    error: updateComplexError,
    isSuccess: isSuccessUpdateComplex,
    status: updateComplexStatus,
  } = useMutation({
    mutationFn: (input: UpdateComplexInputType) =>
      orpc.updateComplex.call(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['complexesList'] })
      queryClient.invalidateQueries({ queryKey: ['complexesMapList'] })
      queryClient.invalidateQueries({ queryKey: ['complexById', variables.id] })
    },
    onError: (error) => {
      console.error('Error updating complex:', JSON.stringify(error))
    },
  })

  return {
    updateComplex,
    updateComplexAsync,
    updateComplexData,
    isPendingUpdateComplex,
    isErrorUpdateComplex,
    updateComplexError,
    isSuccessUpdateComplex,
    updateComplexStatus,
  }
}
```

---

## 6. Frontend — Helper de mapeo (`src/config/complexes.ts`)

Convierte la respuesta anidada de `getComplexById` a la estructura plana de `CreateComplexFormType`. Se necesita porque el form usa estructura plana (react-hook-form) pero la API retorna `complexAddress` y `complexContact` como objetos anidados.

```typescript
import { ComplexByIdResponseType, CreateComplexFormType } from '@/types/complex'

export function mapComplexToFormDefaults(
  complex: ComplexByIdResponseType,
): CreateComplexFormType {
  return {
    title: complex.title,
    description: complex.description,
    timezone: complex.timezone as CreateComplexFormType['timezone'],
    currency: complex.currency as CreateComplexFormType['currency'],
    cancellationPolicy: complex.cancellationPolicy,
    street: complex.complexAddress?.street ?? '',
    city: complex.complexAddress?.city ?? '',
    state: complex.complexAddress?.state ?? '',
    country: (complex.complexAddress?.country ??
      'AR') as CreateComplexFormType['country'],
    zip: complex.complexAddress?.zip ?? '',
    latitude: complex.latitude,
    longitude: complex.longitude,
    phone: complex.complexContact?.phone ?? '',
    website: complex.complexContact?.website ?? '',
    facebook: complex.complexContact?.facebook ?? '',
    twitter: complex.complexContact?.twitter ?? '',
    instagram: complex.complexContact?.instagram ?? '',
    youtube: complex.complexContact?.youtube ?? '',
    features: (complex.features ?? []) as CreateComplexFormType['features'],
  }
}
```

---

## 7. Frontend — Componentes

### 7.1 `complexFormFields.tsx` — Cambios menores

**`StepNavigationButtons`** — agregar prop `isEditMode?: boolean`:

```typescript
const StepNavigationButtons = ({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSubmit,
  isLoading,
  isEditMode = false,
}: {
  currentStep: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  onSubmit: () => void
  isLoading: boolean
  isEditMode?: boolean
}) => {
  // ...
  // Último step:
  {
    isLoading
      ? isEditMode
        ? 'Guardando...'
        : 'Creando...'
      : isEditMode
        ? 'Guardar cambios'
        : 'Crear complejo'
  }
}
```

**`AddressAutocompleteField`** — agregar prop `initialAddress?: string`:

El componente actualmente muestra el badge solo cuando `hasLocation && selected !== null`. En modo edición, `selected` siempre empieza como `null` aunque el form tenga lat/lng pre-llenados. La prop `initialAddress` resuelve esto:

```typescript
const AddressAutocompleteField = ({
  form,
  initialAddress,
}: {
  form: UseFormReturn<CreateComplexFormType>
  initialAddress?: string
}) => {
  const [displayAddress, setDisplayAddress] = useState(initialAddress ?? '')
  // ...

  // Condición de badge: hasLocation + (selected O initialAddress)
  const showBadge = hasLocation && (selected !== null || displayAddress !== '')

  const handleClear = () => {
    setDisplayAddress('') // también limpiar initialAddress
    setSelected(null)
    // ... resto igual
  }

  // Badge usa: selected ? [selected.street, city, state].join(', ') : displayAddress
}
```

En `ComplexForm`, pasar `initialAddress` cuando está en modo edición:

```typescript
<FormFields.AddressAutocompleteField
  form={form}
  initialAddress={
    complexId
      ? [defaultValues?.street, defaultValues?.city, defaultValues?.state]
          .filter(Boolean)
          .join(', ')
      : undefined
  }
/>
```

### 7.2 `complexForm.tsx` — Lógica dual

```typescript
type ComplexFormProps = {
  onClose: () => void
  complexId?: string
  defaultValues?: CreateComplexFormType
}

const ComplexForm = ({ onClose, complexId, defaultValues }: ComplexFormProps) => {
  const { addComplexAsync, isPendingAddComplex } = useAddComplex()
  const { updateComplexAsync, isPendingUpdateComplex } = useUpdateComplex()

  const form = useForm({
    resolver: zodResolver(CreateComplexFormSchema),
    defaultValues: defaultValues ?? CREATE_COMPLEX_FORM_DEFAULT_VALUES,
  })

  const isLoading = isPendingAddComplex || isPendingUpdateComplex

  const onSubmit = async (data: CreateComplexFormType) => {
    const apiInput = {
      title: data.title,
      description: data.description,
      // ... misma transformación que create
    }

    try {
      if (complexId) {
        await updateComplexAsync({ ...apiInput, id: complexId })
        toast.success('Complejo actualizado exitosamente')
      } else {
        await addComplexAsync(apiInput)
        toast.success('Complejo creado exitosamente')
      }
      form.reset()
      onClose()
    } catch (error: unknown) {
      if (error instanceof ORPCError) {
        toast.error(error.message)
      } else {
        toast.error(
          complexId
            ? 'Error al actualizar el complejo. Intentá nuevamente.'
            : 'Error al crear el complejo. Intentá nuevamente.'
        )
      }
    }
  }

  return (
    // ... mismo JSX que create
    <FormFields.StepNavigationButtons
      // ...
      isEditMode={!!complexId}
    />
  )
}
```

### 7.3 `complexModal.tsx` — Wrapper dual-purpose

```typescript
type ComplexModalProps = {
  isOpen: boolean
  onClose: () => void
  complexId?: string  // presente = modo edición
}

const ComplexModal = ({ isOpen, onClose, complexId }: ComplexModalProps) => {
  // En modo edición: fetch data con useSuspenseQuery (via useComplexById)
  const editData = complexId ? useComplexById(complexId).complexById : undefined
  const defaultValues = editData ? mapComplexToFormDefaults(editData) : undefined

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent ...>
        <DialogHeader>
          <DialogTitle>
            {complexId ? 'Editar complejo' : 'Crear nuevo complejo'}
          </DialogTitle>
        </DialogHeader>
        <ComplexForm
          onClose={onClose}
          complexId={complexId}
          defaultValues={defaultValues}
        />
      </DialogContent>
    </Dialog>
  )
}
```

**Nota:** `useComplexById` usa `useSuspenseQuery`. El container debe envolver el modal de edición en `<Suspense>` (ver 7.4).

### 7.4 `complexesContainer.tsx` — Estado de edición

```typescript
const [editComplexId, setEditComplexId] = useState<ComplexType['id'] | null>(null)

const handleEditComplex = (complexId: ComplexType['id']) => {
  setEditComplexId(complexId)
}

// JSX:
<ComplexesTable
  onViewDetail={handleViewDetail}
  onEditComplex={handleEditComplex}
/>

{/* Modal de edición — usa Suspense porque ComplexModal hace fetch con useSuspenseQuery */}
{editComplexId && (
  <Suspense
    fallback={
      <ComplexDetailSkeletonModal
        isOpen={true}
        onClose={() => setEditComplexId(null)}
      />
    }
  >
    <ComplexModal
      isOpen={true}
      onClose={() => setEditComplexId(null)}
      complexId={editComplexId}
    />
  </Suspense>
)}

{/* Modal de creación — sin cambios */}
{isCreateModalOpen && (
  <ComplexModal
    isOpen={isCreateModalOpen}
    onClose={() => setIsCreateModalOpen(false)}
  />
)}
```

### 7.5 Tabla — Wiring del callback

**`columnsTable.tsx`** — Agregar `onEditComplex`:

```typescript
type GetColumnsTableParams = {
  onViewDetail: (complexId: ComplexType['id']) => void
  onEditComplex: (complexId: ComplexType['id']) => void
}

// En la celda de acciones:
<DropdownMenuItem onClick={() => onEditComplex(info.row.original.id)}>
  Editar
</DropdownMenuItem>
```

**`useComplexesTable.ts`**:

```typescript
type UseComplexesTableParams = {
  onViewDetail: (complexId: ComplexType['id']) => void
  onEditComplex: (complexId: ComplexType['id']) => void
}

// Pasar a getColumnsTable:
columns: getColumnsTable({ onViewDetail, onEditComplex }),
```

**`complexesTable.tsx`**:

```typescript
type Props = {
  onViewDetail: (complexId: ComplexType['id']) => void
  onEditComplex: (complexId: ComplexType['id']) => void
}
```

---

## 8. UX/UI — Especificaciones visuales

### 8.1 Modal en modo edición

- **Título:** `"Editar complejo"` (vs `"Crear nuevo complejo"`)
- **Botón final:** `"Guardar cambios"` con loading `"Guardando..."` (vs `"Crear complejo"` / `"Creando..."`)
- **Resto:** idéntico al modal de creación — mismo ancho, mismo `bg-ac-dark-gray`, mismo scroll

### 8.2 Step 2 — Badge de dirección pre-llenado

Al abrir el modal de edición en Step 2, el `AddressAutocompleteField` muestra directamente el badge de confirmación con la dirección existente (`street, city, state`), sin necesidad de que el usuario busque ni seleccione nada.

### 8.3 Feedback visual

| Situación             | Feedback                                                              |
| --------------------- | --------------------------------------------------------------------- |
| Actualización exitosa | `toast.success('Complejo actualizado exitosamente')`                  |
| Título duplicado      | `toast.error('Ya existe un complejo con ese nombre.')`                |
| Sin permisos          | `toast.error(error.message)` (403)                                    |
| Error genérico        | `toast.error('Error al actualizar el complejo. Intentá nuevamente.')` |
| Loading submit        | Botón disabled con spinner + "Guardando..."                           |

---

## 9. Flujo completo E2E (Edit)

```
1. Usuario en /profile/complexes
2. Click "Editar" en dropdown de un complejo → handleEditComplex(complexId)
3. setEditComplexId(complexId) → Suspense + ComplexModal renders
4. ComplexModal detecta complexId → useComplexById(complexId) con useSuspenseQuery
5. Suspense muestra ComplexDetailSkeletonModal mientras carga
6. Datos llegan → mapComplexToFormDefaults() → defaultValues al form
7. ComplexForm inicializa en Step 0 con todos los campos pre-llenados
8. Título: "Editar complejo"
9. Step 2: AddressAutocompleteField muestra badge pre-llenado con dirección existente
10. Usuario navega los 4 steps y modifica lo que necesita
11. Step 4: Click "Guardar cambios" → form.handleSubmit(onSubmit)

12. onSubmit detecta complexId → buildea UpdateComplexInputType:
    { ...apiInput, id: complexId }

13. updateComplexAsync(input) → POST /api/rpc (updateComplex)

14. Backend (updateComplex handler):
    - authorizedMiddleware: verifica sesión, inyecta context.user.id
    - findUnique: verifica que el complejo exista y ownerId === userId
    - findFirst: valida unicidad de título (WHERE title = x AND id != complexId)
    - $transaction: update complexAddress → update complexContact → update complex
    - Retorna 200 con { id, title, isActive, createdAt }

15. Frontend (onSuccess):
    - invalidateQueries(['complexesList', 'complexesMapList', 'complexById', id])
    - toast.success('Complejo actualizado exitosamente')
    - form.reset()
    - onClose() → setEditComplexId(null)
    - Tabla se refresca automáticamente via TanStack Query
```

---

## 10. Orden de implementación recomendado

| #   | Tarea                                                | Archivo(s)                                           | Dependencias |
| --- | ---------------------------------------------------- | ---------------------------------------------------- | ------------ |
| 1   | Schemas Zod (update + extend ById)                   | `src/orpc/schemas/complex.ts`                        | Ninguna      |
| 2   | Tipos TypeScript                                     | `src/types/complex.ts`                               | #1           |
| 3   | Extender `getComplexById` select                     | `src/orpc/router/complex.ts`                         | #1           |
| 4   | Procedimiento `updateComplex`                        | `src/orpc/router/complex.ts`                         | #1, #2       |
| 5   | Registrar en router                                  | `src/orpc/router/index.ts`                           | #4           |
| 6   | Hook `useUpdateComplex`                              | `src/data/complex/update-complex.ts`                 | #2, #5       |
| 7   | Helper `mapComplexToFormDefaults`                    | `src/config/complexes.ts`                            | #1           |
| 8   | `StepNavigationButtons` + `AddressAutocompleteField` | `src/components/profile/forms/complexFormFields.tsx` | Ninguna      |
| 9   | `ComplexForm` (lógica dual)                          | `src/components/profile/forms/complexForm.tsx`       | #6, #7, #8   |
| 10  | `ComplexModal` (dual-purpose)                        | `src/components/profile/modals/complexModal.tsx`     | #7, #9       |
| 11  | Wiring tabla + container                             | 4 archivos                                           | #10          |
| 12  | Verificar build                                      | `pnpm build`                                         | Todo         |

---

## 11. Fuera de alcance (v2+)

- **Eliminación de complejo** — soft delete con diálogo de confirmación
- **Edición de imágenes** — requiere infraestructura de storage (S3/Cloudflare R2)
- **Edición de canchas (Fields)** — flujo separado con schedules y price slots
- **Tags** — requiere CRUD de tags previo
- **Historial de cambios** — audit log de modificaciones al complejo

---

## 12. Consideraciones técnicas

1. **Sin cambios en el schema de Prisma.** `Complex`, `ComplexAddress`, `ComplexContact` ya tienen todos los campos. Solo se agrega lógica de update.

2. **`useComplexById` usa `useSuspenseQuery`.** El container debe envolver el modal de edición en `<Suspense>`. El skeleton existente `ComplexDetailSkeletonModal` se reutiliza como fallback.

3. **`form.reset()` en modo edición** resetea a los `defaultValues` originales (los datos del complejo antes de editar), no a los defaults vacíos de creación. Esto es correcto por el comportamiento de react-hook-form.

4. **Empty strings → undefined en `onSubmit`** — mismo patrón que create: los campos opcionales del form pueden ser empty strings y se convierten a `undefined` antes de enviar al API.

5. **Ambos hooks se llaman incondicionalmente** (`useAddComplex` + `useUpdateComplex`) por las reglas de React hooks. Solo uno se usa en `onSubmit` según `complexId`.

6. **`getComplexById` extendido** — agregar `currency`, `latitude`, `longitude` al select de Prisma no rompe el modal de detalle existente (`ComplexDetailModal`). Esos campos simplemente no se usan en la vista de detalle.

7. **Sentry** — wrappear `updateComplex` handler con `Sentry.startSpan(...)` siguiendo la convención del proyecto.
