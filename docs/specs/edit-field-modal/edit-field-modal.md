# SPEC: Modal de Edición de Cancha

**Status:** Implemented ✓
**Fecha:** 2026-04-03
**Ubicación:** `/profile/fields`
**Alcance:** Edición de cancha existente. Reutiliza el mismo modal y form de creación en modo dual-purpose.

---

## 1. Resumen

Implementar la edición de una cancha deportiva reutilizando **exactamente el mismo modal y formulario** del flujo de creación (`FieldModal` + `FieldForm`). El modal se abre desde el menú de acciones "Editar" en la tabla de canchas. El formulario se pre-llena con los datos existentes y, al guardar, llama al procedimiento `updateField`.

El selector de complejo queda **disabled** en modo edición: no se puede mover una cancha de un complejo a otro.

---

## 2. Decisiones de diseño

| Decisión                     | Elección                                                         | Razón                                             |
| ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| Reutilización del modal/form | `fieldId?` prop hace el form dual-purpose                        | Mismo formulario, misma validación, misma UX      |
| Schema de update             | `UpdateFieldInputSchema = CreateFieldInputSchema.extend({ id })` | Cero duplicación; misma validación que create     |
| Fetch de datos para edit     | En `FieldModal`, con `useSuspenseQuery` (via `useFieldById`)     | Mismo patrón que edit complejo                    |
| Estado del modal de edición  | `editFieldId: string \| null` en `fieldsContainer`               | El ID actúa como flag de apertura + identificador |
| Selector de complejo         | Disabled en modo edición                                         | No se puede mover una cancha entre complejos      |
| Suspense                     | `<Suspense>` en `fieldsContainer` con skeleton fallback          | Mismo patrón que `ComplexModal` de edición        |

---

## 3. Arquitectura de archivos

### 3.1 Archivos nuevos a crear

```
src/
└── data/
    └── field/
        └── update-field.ts                                  # Hook: useUpdateField (mutation)
src/components/
└── profile/
    └── skeletons/
        └── fieldSkeletonModal.tsx                           # Skeleton de carga para edición
```

### 3.2 Archivos existentes a modificar

| Archivo                                              | Cambio                                                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/orpc/schemas/field.ts`                          | Agregar `GetFieldByIdInputSchema`, `FieldByIdResponseSchema`, `UpdateFieldInputSchema`, `UpdateFieldResponseSchema`                                 |
| `src/orpc/router/field.ts`                           | Agregar `getFieldById` y `updateField`                                                                                                              |
| `src/orpc/router/index.ts`                           | Registrar `getFieldById`, `updateField`                                                                                                             |
| `src/types/field.ts`                                 | Agregar `GetFieldByIdInputType`, `FieldByIdResponseType`, `UpdateFieldInputType`, `UpdateFieldResponseType`                                         |
| `src/utils/fields/index.ts`                          | Agregar helper `mapFieldToFormDefaults()`                                                                                                           |
| `src/data/field/get-fields.ts`                       | Agregar `useFieldById` (useSuspenseQuery)                                                                                                           |
| `src/components/profile/modals/fieldModal.tsx`       | Aceptar `fieldId?`, fetch condicional con `useFieldById`, título dinámico, pasar defaults al form; usa `mapFieldToFormDefaults` de `@/utils/fields` |
| `src/components/profile/forms/fieldForm.tsx`         | Aceptar `fieldId?` + `defaultValues?`, lógica dual create/update en `onSubmit`                                                                      |
| `src/components/profile/forms/fieldFormFields.tsx`   | `ComplexSelectorField`: agregar prop `disabled` para modo edición                                                                                   |
| `src/components/profile/general/fieldsContainer.tsx` | Agregar estado `editFieldId`, handler, render modal con `<Suspense>`                                                                                |

---

## 4. Backend — ORPC

### 4.1 Schemas Zod (`src/orpc/schemas/field.ts`)

**Agregar schemas de field by ID** (input + respuesta):

```typescript
// FIELD BY ID — Input
export const GetFieldByIdInputSchema = z.object({
  id: z.cuid(),
})

// FIELD BY ID — Respuesta completa para pre-llenar form de edición (derivado de FieldSchema)
export const FieldByIdResponseSchema = FieldSchema.pick({
  id: true,
  title: true,
  description: true,
  capacity: true,
  fieldType: true,
  isDividable: true,
  surface: true,
  isRooted: true,
  hasLighting: true,
  complexId: true,
  parentFieldId: true,
  createdAt: true,
}).extend({
  complexTitle: z.string(), // desnormalizado, para mostrar en modo edición (disabled)
})
```

**Agregar schemas de update:**

```typescript
// UPDATE FIELD — API input (create + id)
export const UpdateFieldInputSchema = CreateFieldInputSchema.extend({
  id: z.cuid(),
})

// UPDATE FIELD — Response (misma forma que create)
export const UpdateFieldResponseSchema = CreateFieldResponseSchema
```

### 4.2 Tipos TypeScript (`src/types/field.ts`)

```typescript
import {
  GetFieldByIdInputSchema,
  FieldByIdResponseSchema,
  UpdateFieldInputSchema,
  UpdateFieldResponseSchema,
} from '@/orpc/schemas/field'

// Field by ID (edit form pre-fill)
export type GetFieldByIdInputType = z.infer<typeof GetFieldByIdInputSchema>
export type FieldByIdResponseType = z.infer<typeof FieldByIdResponseSchema>

// Update field
export type UpdateFieldInputType = z.infer<typeof UpdateFieldInputSchema>
export type UpdateFieldResponseType = z.infer<typeof UpdateFieldResponseSchema>
```

### 4.3 Procedimiento ORPC `getFieldById` (`src/orpc/router/field.ts`)

```typescript
// ============================================================================
// GET FIELD BY ID
// ============================================================================
export const getFieldById = authorizedMiddleware
  .input(GetFieldByIdInputSchema)
  .output(FieldByIdResponseSchema)
  .handler(async ({ input, errors, context }) => {
    return await Sentry.startSpan({ name: 'getFieldById' }, async () => {
      const userId = context.user.id
      try {
        const field = await prisma.field.findUnique({
          where: { id: input.id, isActive: true },
          select: {
            id: true,
            title: true,
            description: true,
            capacity: true,
            fieldType: true,
            isDividable: true,
            surface: true,
            isRooted: true,
            hasLighting: true,
            complexId: true,
            parentFieldId: true,
            createdAt: true,
            complex: {
              select: { title: true, ownerId: true },
            },
          },
        })

        if (!field) {
          throw errors.NOT_FOUND({ message: 'Cancha no encontrada.' })
        }
        if (field.complex.ownerId !== userId) {
          throw errors.NOT_FOUND({ message: 'Cancha no encontrada.' }) // no revelar existencia
        }

        return {
          id: field.id,
          title: field.title,
          description: field.description,
          capacity: field.capacity,
          fieldType: field.fieldType,
          isDividable: field.isDividable,
          surface: field.surface,
          isRooted: field.isRooted,
          hasLighting: field.hasLighting,
          complexId: field.complexId,
          complexTitle: field.complex.title,
          parentFieldId: field.parentFieldId,
          createdAt: field.createdAt,
        }
      } catch (error) {
        console.error('Error al obtener cancha por ID:', error)
        if (error instanceof ORPCError) throw error
        throw errors.BAD_REQUEST()
      }
    })
  })
```

### 4.4 Procedimiento ORPC `updateField` (`src/orpc/router/field.ts`)

```typescript
// ============================================================================
// UPDATE FIELD
// ============================================================================
export const updateField = authorizedMiddleware
  .input(UpdateFieldInputSchema)
  .output(createApiResponseSchema(UpdateFieldResponseSchema))
  .handler(async ({ input, errors, context }) => {
    return await Sentry.startSpan({ name: 'updateField' }, async () => {
      const userId = context.user.id
      try {
        // 1. Verificar existencia, que esté activo, y ownership
        const existing = await prisma.field.findUnique({
          where: { id: input.id },
          select: {
            isActive: true,
            complex: {
              select: { ownerId: true },
            },
          },
        })
        if (!existing || !existing.isActive) {
          throw errors.NOT_FOUND({ message: 'Cancha no encontrada.' })
        }
        if (existing.complex.ownerId !== userId) {
          throw errors.FORBIDDEN({
            message: 'No tenés permisos para editar esta cancha.',
          })
        }

        // 2. Validar unicidad de título dentro del complejo (excluyendo self)
        const duplicate = await prisma.field.findFirst({
          where: {
            complexId: input.complexId,
            title: input.title,
            isActive: true,
            id: { not: input.id },
          },
          select: { id: true },
        })
        if (duplicate) {
          throw errors.CONFLICT({
            message: 'Ya existe una cancha con ese nombre en este complejo.',
          })
        }

        // 3. Actualizar la cancha
        const field = await prisma.field.update({
          where: { id: input.id },
          data: {
            title: input.title,
            description: input.description ?? null,
            capacity: input.capacity,
            surface: input.surface,
            isRooted: input.isRooted,
            hasLighting: input.hasLighting,
            isDividable: input.isDividable,
            // fieldType y complexId NO se actualizan
          },
          select: {
            id: true,
            title: true,
            isActive: true,
            createdAt: true,
          },
        })

        return {
          message: 'Cancha actualizada exitosamente',
          status: 200,
          data: {
            id: field.id,
            title: field.title,
            isActive: field.isActive,
            createdAt: field.createdAt,
          },
        }
      } catch (error) {
        console.error('Error al actualizar cancha:', error)
        if (error instanceof ORPCError) throw error
        throw errors.BAD_REQUEST()
      }
    })
  })
```

### 4.5 Registro en router (`src/orpc/router/index.ts`)

```typescript
import { ..., getFieldById, updateField } from './field'

export default {
  // ... existentes sin cambios
  getFieldById,
  updateField,
}
```

---

## 5. Frontend — Data Hook (`src/data/field/update-field.ts`)

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import { UpdateFieldInputType } from '@/types/field'

export const useUpdateField = () => {
  const queryClient = useQueryClient()

  const {
    mutate: updateField,
    mutateAsync: updateFieldAsync,
    data: updateFieldData,
    isPending: isPendingUpdateField,
    isError: isErrorUpdateField,
    error: updateFieldError,
    isSuccess: isSuccessUpdateField,
    status: updateFieldStatus,
  } = useMutation({
    mutationFn: (input: UpdateFieldInputType) => orpc.updateField.call(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldsList'] })
      queryClient.invalidateQueries({ queryKey: ['fieldById', variables.id] })
      queryClient.invalidateQueries({
        queryKey: ['complexById', variables.complexId],
      })
    },
    onError: (error) => {
      console.error('Error updating field:', JSON.stringify(error))
    },
  })

  return {
    updateField,
    updateFieldAsync,
    updateFieldData,
    isPendingUpdateField,
    isErrorUpdateField,
    updateFieldError,
    isSuccessUpdateField,
    updateFieldStatus,
  }
}
```

### `useFieldById` en `src/data/field/get-fields.ts`

```typescript
export const useFieldById = (fieldId: FieldType['id']) => {
  const {
    data: fieldById,
    refetch,
    isError: isErrorFieldById,
    error: fieldByIdError,
  } = useSuspenseQuery({
    queryKey: ['fieldById', fieldId],
    queryFn: () => orpc.getFieldById.call({ id: fieldId }),
    staleTime: 5 * 60 * 1000,
  })

  return {
    fieldById,
    refetch,
    isErrorFieldById,
    fieldByIdError,
  }
}
```

---

## 6. Frontend — Helper de mapeo (`src/utils/fields/index.ts`)

```typescript
import type { FieldByIdResponseType, CreateFieldFormType } from '@/types/field'

export function mapFieldToFormDefaults(
  field: FieldByIdResponseType,
): CreateFieldFormType {
  return {
    complexId: field.complexId,
    title: field.title,
    description: field.description ?? '',
    capacity: field.capacity,
    surface: field.surface as CreateFieldFormType['surface'],
    isRooted: field.isRooted,
    hasLighting: field.hasLighting,
    isDividable: field.isDividable,
  }
}
```

---

## 7. Frontend — Componentes

### 7.1 `fieldSkeletonModal.tsx` — Skeleton de carga

```typescript
type Props = {
  isOpen: boolean
  onClose: () => void
}

const FieldSkeletonModal = ({ isOpen, onClose }: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-ac-dark-gray border-ac-light-gray max-w-lg">
        <DialogHeader>
          <Skeleton className="h-6 w-32" />
        </DialogHeader>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
          <Skeleton className="h-24 w-full" />
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### 7.2 `fieldFormFields.tsx` — `ComplexSelectorField` con `disabled`

```typescript
const ComplexSelectorField = ({
  form,
  disabled = false,
}: {
  form: UseFormReturn<CreateFieldFormType>
  disabled?: boolean
}) => {
  const { myComplexes } = useMyComplexesList()
  // Si disabled, mostrar nombre del complejo como texto read-only (no dropdown interactivo)
  // Si no disabled, mostrar Select normal con los complejos del usuario (useMyComplexesList)
  // Nota: useComplexesMapList es público (para /search); useMyComplexesList es autenticado (para el form)
}
```

### 7.3 `fieldForm.tsx` — Lógica dual

```typescript
type FieldFormProps = {
  onClose: () => void
  fieldId?: FieldType['id']
  defaultValues?: CreateFieldFormType
}

const FieldForm = ({ onClose, fieldId, defaultValues }: FieldFormProps) => {
  const { addFieldAsync, isPendingAddField } = useAddField()
  const { updateFieldAsync, isPendingUpdateField } = useUpdateField()

  const form = useForm<CreateFieldFormType>({
    resolver: zodResolver(CreateFieldFormSchema),
    defaultValues: defaultValues ?? CREATE_FIELD_FORM_DEFAULT_VALUES,
  })

  const isLoading = isPendingAddField || isPendingUpdateField

  const onSubmit = async (data: CreateFieldFormType) => {
    const apiInput = {
      complexId: data.complexId,
      title: data.title,
      description: data.description || undefined,
      capacity: data.capacity,
      surface: data.surface,
      isRooted: data.isRooted,
      hasLighting: data.hasLighting,
      isDividable: data.isDividable,
    }

    try {
      if (fieldId) {
        await updateFieldAsync({ ...apiInput, id: fieldId })
        toast.success('Cancha actualizada exitosamente')
      } else {
        await addFieldAsync(apiInput)
        toast.success('Cancha creada exitosamente')
      }
      form.reset()
      onClose()
    } catch (error: unknown) {
      if (error instanceof ORPCError) {
        toast.error(error.message)
      } else {
        toast.error(
          fieldId
            ? 'Error al actualizar la cancha. Intentá nuevamente.'
            : 'Error al crear la cancha. Intentá nuevamente.',
        )
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormFields.ComplexSelectorField form={form} disabled={!!fieldId} />
        <FormFields.TitleField form={form} />
        <FormFields.DescriptionField form={form} />
        <FormFields.CapacityField form={form} />
        <FormFields.SurfaceField form={form} />
        <FormFields.FeaturesSection form={form} />
        <FormFields.SubmitButtons
          onClose={onClose}
          isLoading={isLoading}
          isEditMode={!!fieldId}
        />
      </form>
    </Form>
  )
}
```

### 7.4 `fieldModal.tsx` — Wrapper dual-purpose

```typescript
type FieldModalProps = {
  isOpen: boolean
  onClose: () => void
  fieldId?: FieldType['id']  // presente = modo edición
}

// Componente interno que hace el fetch (solo se monta cuando fieldId está presente)
const FieldEditContent = ({
  fieldId,
  onClose,
}: {
  fieldId: FieldType['id']
  onClose: () => void
}) => {
  const { fieldById } = useFieldById(fieldId)
  const defaultValues = mapFieldToFormDefaults(fieldById)

  return (
    <FieldForm
      onClose={onClose}
      fieldId={fieldId}
      defaultValues={defaultValues}
    />
  )
}

const FieldModal = ({ isOpen, onClose, fieldId }: FieldModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-ac-dark-gray border-ac-light-gray max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {fieldId ? 'Editar cancha' : 'Crear nueva cancha'}
          </DialogTitle>
        </DialogHeader>
        {fieldId ? (
          <FieldEditContent fieldId={fieldId} onClose={onClose} />
        ) : (
          <FieldForm onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  )
}
```

**Nota:** `useFieldById` usa `useSuspenseQuery`. El container envuelve el modal de edición en `<Suspense>` (ver 7.5).

### 7.5 `fieldsContainer.tsx` — Estado de edición

```typescript
const [editFieldId, setEditFieldId] = useState<FieldType['id'] | null>(null)

const handleEditField = (fieldId: FieldType['id']) => {
  setEditFieldId(fieldId)
}

// JSX:
<FieldsTable
  onEditField={handleEditField}
  onDeleteField={handleDeleteField}
/>

{/* Modal de edición — usa Suspense porque FieldModal hace fetch con useSuspenseQuery */}
{editFieldId && (
  <Suspense
    fallback={
      <FieldSkeletonModal
        isOpen={true}
        onClose={() => setEditFieldId(null)}
      />
    }
  >
    <FieldModal
      isOpen={true}
      onClose={() => setEditFieldId(null)}
      fieldId={editFieldId}
    />
  </Suspense>
)}

{/* Modal de creación — sin Suspense */}
{isCreateModalOpen && (
  <FieldModal
    isOpen={isCreateModalOpen}
    onClose={() => setIsCreateModalOpen(false)}
  />
)}
```

---

## 8. UX/UI — Especificaciones visuales

### 8.1 Modal en modo edición

- **Título:** `"Editar cancha"` (vs `"Crear nueva cancha"`)
- **Selector de complejo:** Disabled, muestra el nombre del complejo en texto read-only
- **Botón final:** `"Guardar cambios"` / loading `"Guardando..."` (vs `"Crear cancha"` / `"Creando..."`)
- **Resto:** idéntico al modal de creación

### 8.2 Feedback visual

| Situación                    | Feedback                                                               |
| ---------------------------- | ---------------------------------------------------------------------- |
| Actualización exitosa        | `toast.success('Cancha actualizada exitosamente')`                     |
| Título duplicado en complejo | `toast.error('Ya existe una cancha con ese nombre en este complejo.')` |
| Sin permisos                 | `toast.error(error.message)` (403)                                     |
| Cancha no encontrada         | `toast.error(error.message)` (404)                                     |
| Error genérico               | `toast.error('Error al actualizar la cancha. Intentá nuevamente.')`    |
| Loading submit               | Botón disabled + spinner + "Guardando..."                              |

---

## 9. Flujo completo E2E (Edit)

```
1. Usuario en /profile/fields
2. Click "Editar" en dropdown de una cancha → handleEditField(fieldId)
3. setEditFieldId(fieldId) → Suspense + FieldModal renders
4. FieldModal detecta fieldId → monta FieldEditContent → useFieldById(fieldId) con useSuspenseQuery
5. Suspense muestra FieldSkeletonModal mientras carga
6. Datos llegan → mapFieldToFormDefaults() → defaultValues al form
7. FieldForm inicializa con todos los campos pre-llenados
8. Título: "Editar cancha"
9. Selector de complejo: disabled con nombre del complejo como texto
10. Usuario modifica los campos que necesita
11. Click "Guardar cambios" → form.handleSubmit(onSubmit)

12. onSubmit detecta fieldId → buildea UpdateFieldInputType:
    { complexId, title, description?, capacity, surface, isRooted, hasLighting, isDividable, id: fieldId }

13. updateFieldAsync(input) → POST /api/rpc (updateField)

14. Backend (updateField handler):
    - authorizedMiddleware: verifica sesión, inyecta context.user.id
    - findUnique: verifica existencia, isActive, y complex.ownerId === userId
    - findFirst: valida unicidad de título (WHERE complexId + title + isActive + id != input.id)
    - update: actualiza campos editables (NO actualiza fieldType, complexId, parentFieldId)
    - Retorna 200 con { id, title, isActive, createdAt }

15. Frontend (onSuccess):
    - invalidateQueries(['fieldsList'])
    - invalidateQueries(['fieldById', id])
    - invalidateQueries(['complexById', complexId])
    - toast.success('Cancha actualizada exitosamente')
    - form.reset()
    - onClose() → setEditFieldId(null)
    - Tabla se refresca automáticamente via TanStack Query
```

---

## 10. Orden de implementación recomendado

| #   | Tarea                                            | Archivo(s)                                           | Dependencias |
| --- | ------------------------------------------------ | ---------------------------------------------------- | ------------ |
| 1   | Schemas Zod (byId + update)                      | `src/orpc/schemas/field.ts`                          | Spec create  |
| 2   | Tipos TypeScript                                 | `src/types/field.ts`                                 | #1           |
| 3   | Procedimiento `getFieldById`                     | `src/orpc/router/field.ts`                           | #1           |
| 4   | Procedimiento `updateField`                      | `src/orpc/router/field.ts`                           | #1, #2       |
| 5   | Registrar en router                              | `src/orpc/router/index.ts`                           | #3, #4       |
| 6   | Hook `useUpdateField`                            | `src/data/field/update-field.ts`                     | #2, #5       |
| 7   | Hook `useFieldById` (agregar a get-fields.ts)    | `src/data/field/get-fields.ts`                       | #2, #5       |
| 8   | Helper `mapFieldToFormDefaults`                  | `src/config/fields.ts`                               | #2           |
| 9   | `FieldSkeletonModal`                             | `src/components/profile/skeletons/`                  | Ninguna      |
| 10  | `ComplexSelectorField` con `disabled`            | `src/components/profile/forms/fieldFormFields.tsx`   | Spec create  |
| 11  | `FieldForm` (lógica dual)                        | `src/components/profile/forms/fieldForm.tsx`         | #6, #8, #10  |
| 12  | `FieldModal` (dual-purpose con FieldEditContent) | `src/components/profile/modals/fieldModal.tsx`       | #7, #9, #11  |
| 13  | Container (estado + handler + Suspense)          | `src/components/profile/general/fieldsContainer.tsx` | #12          |
| 14  | Verificar build                                  | `pnpm build`                                         | Todo         |

---

## 11. Fuera de alcance (v2+)

- **Mover cancha entre complejos** — requiere validaciones adicionales y migración de schedules/bookings
- **Editar `fieldType`** — cambiar FULL → HALF requiere parent field y es una operación estructural
- **Editar working schedules** — flujo separado con su propia spec
- **Editar precios (price slots)** — sub-feature de schedules

---

## 12. Consideraciones técnicas

1. **`fieldType` y `complexId` NO se actualizan en `updateField`.** El backend los ignora aunque vengan en el input. Esto es intencional.

2. **`useFieldById` usa `useSuspenseQuery`.** El container debe envolver el modal de edición en `<Suspense>`.

3. **`form.reset()` en modo edición** resetea a los `defaultValues` originales (datos de la cancha pre-edición), no a los defaults vacíos de creación. Comportamiento estándar de react-hook-form.

4. **`FieldEditContent` como componente separado** permite que el fetch (`useSuspenseQuery`) solo se ejecute cuando el modal está en modo edición. Si se hiciera en `FieldModal`, el hook siempre correría condicionalmente (viola las reglas de hooks).

5. **Ambos hooks se llaman incondicionalmente** (`useAddField` + `useUpdateField`) en `FieldForm`.

6. **Sentry:** wrappear `getFieldById` y `updateField` handlers con `Sentry.startSpan(...)`.

7. **`ComplexSelectorField` usa `useMyComplexesList` (autenticado).** `useComplexesMapList` es público y se usa en `/search` para el mapa; `useMyComplexesList` filtra por `ownerId` del usuario autenticado. En modo edición el campo queda `disabled` mostrando el nombre del complejo actual como texto read-only.

8. **`description` en `UpdateFieldInputSchema` requiere `.min(1)` (heredado de `CreateFieldInputSchema`).** Si la descripción está vacía, el form envía `undefined` (conversión `'' → undefined` en `onSubmit`). Esto evita almacenar strings vacíos en la BD en lugar de `null`.
