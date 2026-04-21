# SPEC: Modal de Creación de Cancha

**Status:** Implemented
**Fecha:** 2026-04-03
**Ubicación:** `/profile/fields`
**Alcance:** Creación de una nueva cancha dentro de un complejo existente del usuario. Modal con formulario de un solo paso.

---

## 1. Resumen

Implementar la creación de una cancha deportiva mediante un modal con formulario simple de un solo paso. Se abre desde el botón "Crear nueva cancha" en `fieldsContainer.tsx`. El formulario permite seleccionar el complejo al que pertenece, ingresar las propiedades básicas de la cancha, y al confirmar llama al procedimiento `createField`.

A diferencia de la creación de complejos (4 pasos), la creación de canchas es un formulario de un solo paso: los datos son simples y no tienen sub-entidades (no hay dirección, contacto, ni geocodificación).

**`fieldType` bloqueado a `FULL` en la creación directa.** Cuando `isDividable: true`, el backend crea automáticamente las sub-canchas `HALF_A` y `HALF_B` en la misma transacción.

---

## 2. Decisiones de diseño

| Decisión             | Elección                                          | Razón                                                                                                               |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Steps del form       | Un solo paso                                      | Solo ~8 campos, sin sub-entidades como address/contact                                                              |
| Selector de complejo | Dropdown con complejos activos del usuario        | La cancha DEBE pertenecer a un complejo                                                                             |
| Query para selector  | Nuevo `useMyComplexesList` → `getMyComplexesList` | `useComplexesMapList` es público (usado en `/search`); se necesita un endpoint autenticado que filtre por `ownerId` |
| `fieldType`          | Bloqueado a `FULL` en el input                    | El usuario no elige el tipo; las mitades se crean automáticamente                                                   |
| `isDividable`        | Switch visible                                    | Si `true`, el backend crea `HALF_A` y `HALF_B` en la misma transacción                                              |
| Unicidad de título   | Por complejo (`complexId + title`)                | Dos canchas en el mismo complejo no deben compartir nombre                                                          |
| Modal vs page        | Modal (Dialog)                                    | Consistente con el flujo de creación de complejos                                                                   |

---

## 3. Arquitectura de archivos

### 3.1 Archivos nuevos a crear

```
src/
└── data/
    └── field/
        └── add-field.ts                                 # Hook: useAddField (mutation)
src/components/
└── profile/
    ├── modals/
    │   └── fieldModal.tsx                               # Modal wrapper (dual create/edit, ver spec edit)
    └── forms/
        ├── fieldForm.tsx                                # Form container con lógica dual create/update
        └── fieldFormFields.tsx                          # Componentes de campos reutilizables
```

### 3.2 Archivos existentes a modificar

| Archivo                                              | Cambio                                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/orpc/schemas/field.ts`                          | Agregar `CreateFieldFormSchema`, `CreateFieldInputSchema`, `CreateFieldResponseSchema` |
| `src/orpc/router/field.ts`                           | Agregar procedimiento `createField`                                                    |
| `src/orpc/router/complex.ts`                         | Agregar procedimiento `getMyComplexesList` (autenticado, filtra por `ownerId`)         |
| `src/orpc/router/index.ts`                           | Registrar `createField` y `getMyComplexesList`                                         |
| `src/types/field.ts`                                 | Agregar `CreateFieldFormType`, `CreateFieldInputType`, `CreateFieldResponseType`       |
| `src/config/fields.ts`                               | Agregar `CREATE_FIELD_FORM_DEFAULT_VALUES`                                             |
| `src/data/complex/get-complexes.ts`                  | Agregar `useMyComplexesList` hook                                                      |
| `src/components/profile/general/fieldsContainer.tsx` | Agregar estado `isCreateModalOpen` + render modal                                      |

---

## 4. Backend — ORPC

### 4.1 Schemas Zod (`src/orpc/schemas/field.ts`)

```typescript
// ============================================================================
// CREATE FIELD — Form schema (plano para react-hook-form)
// ============================================================================
export const CreateFieldFormSchema = z.object({
  complexId: z.cuid({ message: 'Seleccioná un complejo.' }),
  title: z
    .string()
    .min(3, 'El nombre debe tener al menos 3 caracteres.')
    .max(255, 'El nombre no puede superar los 255 caracteres.'),
  description: z
    .string()
    .max(2000, 'La descripción no puede superar los 2000 caracteres.')
    .optional()
    .or(z.literal('')),
  capacity: z
    .number({
      error: 'La capacidad debe ser un número.',
    })
    .int('La capacidad debe ser un número entero.')
    .min(1, 'La capacidad mínima es 1.')
    .max(100, 'La capacidad máxima es 100.'),
  surface: z.enum(SURFACE_VALUES, {
    error: 'Seleccioná una superficie válida.',
  }),
  isRooted: z.boolean(),
  hasLighting: z.boolean(),
  isDividable: z.boolean(),
})

// ============================================================================
// CREATE FIELD — API input schema
// ============================================================================
export const CreateFieldInputSchema = z.object({
  complexId: z.cuid(),
  title: z.string().min(3).max(255),
  description: z.string().min(1).max(2000).optional(),
  capacity: z.number().int().min(1).max(100),
  surface: z.enum(SURFACE_VALUES),
  isRooted: z.boolean().default(false),
  hasLighting: z.boolean().default(false),
  isDividable: z.boolean().default(false),
  // fieldType bloqueado a FULL en v1 — no es input del usuario
})

// ============================================================================
// CREATE FIELD — Response schema (derivado de FieldSchema)
// ============================================================================
export const CreateFieldResponseSchema = FieldSchema.pick({
  id: true,
  title: true,
  isActive: true,
  createdAt: true,
})
```

### 4.2 Tipos TypeScript (`src/types/field.ts`)

```typescript
import {
  CreateFieldFormSchema,
  CreateFieldInputSchema,
  CreateFieldResponseSchema,
} from '@/orpc/schemas/field'

export type CreateFieldFormType = z.infer<typeof CreateFieldFormSchema>
export type CreateFieldInputType = z.infer<typeof CreateFieldInputSchema>
export type CreateFieldResponseType = z.infer<typeof CreateFieldResponseSchema>
```

### 4.3 Procedimiento ORPC `createField` (`src/orpc/router/field.ts`)

```typescript
// ============================================================================
// CREATE FIELD
// ============================================================================
export const createField = authorizedMiddleware
  .input(CreateFieldInputSchema)
  .output(createApiResponseSchema(CreateFieldResponseSchema))
  .handler(async ({ input, errors, context }) => {
    return await Sentry.startSpan({ name: 'createField' }, async () => {
      const userId = context.user.id
      try {
        // 1. Verificar que el complejo existe, está activo, y pertenece al usuario
        const complex = await prisma.complex.findUnique({
          where: { id: input.complexId },
          select: { ownerId: true, isActive: true },
        })
        if (!complex || !complex.isActive) {
          throw errors.NOT_FOUND({ message: 'Complejo no encontrado.' })
        }
        if (complex.ownerId !== userId) {
          throw errors.FORBIDDEN({
            message: 'No tenés permisos para agregar canchas a este complejo.',
          })
        }

        // 2. Validar unicidad de título dentro del complejo
        const duplicate = await prisma.field.findFirst({
          where: {
            complexId: input.complexId,
            title: input.title,
            isActive: true,
          },
          select: { id: true },
        })
        if (duplicate) {
          throw errors.CONFLICT({
            message: 'Ya existe una cancha con ese nombre en este complejo.',
          })
        }

        // 3. Crear la cancha y sus mitades (si es divisible) en una transacción
        const field = await prisma.$transaction(async (tx) => {
          const fullField = await tx.field.create({
            data: {
              complexId: input.complexId,
              title: input.title,
              description: input.description ?? null,
              capacity: input.capacity,
              surface: input.surface,
              isRooted: input.isRooted,
              hasLighting: input.hasLighting,
              isDividable: input.isDividable,
              fieldType: 'FULL',
              isActive: true,
            },
            select: { id: true, title: true, isActive: true, createdAt: true },
          })

          if (input.isDividable) {
            const halfCapacity = Math.floor(input.capacity / 2)
            const sharedData = {
              complexId: input.complexId,
              parentFieldId: fullField.id,
              capacity: halfCapacity,
              surface: input.surface,
              isRooted: input.isRooted,
              hasLighting: input.hasLighting,
              isDividable: false,
              isActive: true,
            }
            await tx.field.createMany({
              data: [
                {
                  ...sharedData,
                  title: `${input.title} - Mitad A`,
                  fieldType: 'HALF_A',
                },
                {
                  ...sharedData,
                  title: `${input.title} - Mitad B`,
                  fieldType: 'HALF_B',
                },
              ],
            })
          }

          return fullField
        })

        return {
          message: 'Cancha creada exitosamente',
          status: 201,
          data: {
            id: field.id,
            title: field.title,
            isActive: field.isActive,
            createdAt: field.createdAt,
          },
        }
      } catch (error) {
        console.error('Error al crear cancha:', error)
        if (error instanceof ORPCError) throw error
        throw errors.BAD_REQUEST()
      }
    })
  })
```

### 4.4 Registro en router (`src/orpc/router/index.ts`)

```typescript
import { ..., createField } from './field'

export default {
  // ... existentes sin cambios
  createField,
}
```

---

## 5. Frontend — Data Hook (`src/data/field/add-field.ts`)

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import { CreateFieldInputType } from '@/types/field'

export const useAddField = () => {
  const queryClient = useQueryClient()

  const {
    mutate: addField,
    mutateAsync: addFieldAsync,
    data: addFieldData,
    isPending: isPendingAddField,
    isError: isErrorAddField,
    error: addFieldError,
    isSuccess: isSuccessAddField,
    status: addFieldStatus,
  } = useMutation({
    mutationFn: (input: CreateFieldInputType) => orpc.createField.call(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldsList'] })
      queryClient.invalidateQueries({
        queryKey: ['complexById', variables.complexId],
      })
    },
    onError: (error) => {
      console.error('Error creating field:', JSON.stringify(error))
    },
  })

  return {
    addField,
    addFieldAsync,
    addFieldData,
    isPendingAddField,
    isErrorAddField,
    addFieldError,
    isSuccessAddField,
    addFieldStatus,
  }
}
```

---

## 6. Frontend — Config (`src/config/fields.ts`)

```typescript
import type { CreateFieldFormType } from '@/types/field'

export const CREATE_FIELD_FORM_DEFAULT_VALUES: CreateFieldFormType = {
  complexId: '',
  title: '',
  description: '',
  capacity: 10,
  surface: 'SYNTHETIC',
  isRooted: false,
  hasLighting: false,
  isDividable: false,
}
```

---

## 7. Frontend — Componentes

### 7.1 `fieldFormFields.tsx` — Campos reutilizables

Componentes de campo individuales que aceptan el form via prop (mismo patrón que `complexFormFields.tsx`):

```typescript
// Campos exportados:
// ComplexSelectorField — Select dropdown con complejos del usuario
// TitleField — Input texto
// DescriptionField — Textarea opcional
// CapacityField — Input numérico
// SurfaceField — Select dropdown
// FeaturesSection — Switches: isRooted, hasLighting, isDividable
// SubmitButtons — Cancelar + Submit con loading state
```

**`ComplexSelectorField`** — reutiliza `useMyComplexesList()` (autenticado, filtra por `ownerId`) para obtener `{ id, title }[]`. `useComplexesMapList` es público y se usa en `/search`; no aplica aquí. En modo edición, el campo está `disabled` (ver spec edit).

**`FeaturesSection`** — agrupa los 3 switches en un bloque visual:

- `isRooted` → "Techada" (icono: `Home`)
- `hasLighting` → "Iluminación" (icono: `Lightbulb`)
- `isDividable` → "Divisible en mitades" (icono: `Layers`)

### 7.2 `fieldForm.tsx` — Form container (dual-purpose create/update)

```typescript
type FieldFormProps = {
  onClose: () => void
  fieldId?: FieldType['id']            // presente = modo edición
  defaultValues?: CreateFieldFormType  // pre-llenado en edición
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
    const apiInput: CreateFieldInputType = {
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
        <div className="grid grid-cols-2 gap-4">
          <FormFields.CapacityField form={form} />
          <FormFields.SurfaceField form={form} />
        </div>
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

### 7.3 `fieldModal.tsx` — Modal wrapper (dual-purpose)

```typescript
type FieldModalProps = {
  isOpen: boolean
  onClose: () => void
  fieldId?: FieldType['id']  // presente = modo edición
}

// Componente interno que hace el fetch (solo se monta cuando fieldId está presente)
// Permite que useSuspenseQuery no corra condicionalmente — respeta las reglas de hooks
const FieldEditContent = ({
  fieldId,
  onClose,
}: {
  fieldId: FieldType['id']
  onClose: () => void
}) => {
  const { fieldById } = useFieldById(fieldId)
  const defaultValues = mapFieldToFormDefaults(fieldById) // mapFieldToFormDefaults en @/utils/fields
  return <FieldForm onClose={onClose} fieldId={fieldId} defaultValues={defaultValues} />
}

const FieldModal = ({ isOpen, onClose, fieldId }: FieldModalProps) => (
  <FieldModalShell
    isOpen={isOpen}
    onClose={onClose}
    title={fieldId ? 'Editar cancha' : 'Crear nueva cancha'}
  >
    {fieldId ? (
      <FieldEditContent fieldId={fieldId} onClose={onClose} />
    ) : (
      <FieldForm onClose={onClose} />
    )}
  </FieldModalShell>
)
```

**Nota:** En modo edición `FieldEditContent` usa `useSuspenseQuery` (via `useFieldById`). El container envuelve el modal de edición en `<Suspense>` con `<FieldSkeletonModal>` como fallback (ver spec edit).

### 7.4 `fieldsContainer.tsx` — Estado de creación

```typescript
{/* Modal de creación — sin Suspense */}
{isCreateModalOpen && (
  <FieldModal
    isOpen={isCreateModalOpen}
    onClose={() => setIsCreateModalOpen(false)}
  />
)}

{/* Modal de edición — con Suspense (fetch interno via useSuspenseQuery) */}
{/* Ver spec edit-field-modal para el patrón completo con FieldSkeletonModal */}
```

---

## 8. UX/UI — Especificaciones visuales

### 8.1 Layout del formulario

- **Selector de complejo** (ancho completo)
- **Nombre** (ancho completo)
- **Descripción** (ancho completo, textarea)
- **Capacidad** (50%) + **Superficie** (50%) en la misma fila
- **Sección de features** — 3 switches con label e ícono:

```
╔══════════════════════════════════════╗
║  🏠 Techada          [switch]        ║
║  💡 Iluminación      [switch]        ║
║  ⚡ Divisible        [switch]        ║
╚══════════════════════════════════════╝
```

- **Botones** — `Cancelar` (outline) + `Crear cancha` (primary) alineados a la derecha

### 8.2 Feedback visual

| Situación                      | Feedback                                                               |
| ------------------------------ | ---------------------------------------------------------------------- |
| Creación exitosa               | `toast.success('Cancha creada exitosamente')`                          |
| Título duplicado en complejo   | `toast.error('Ya existe una cancha con ese nombre en este complejo.')` |
| Complejo no encontrado         | `toast.error(error.message)` (404)                                     |
| Sin permisos sobre el complejo | `toast.error(error.message)` (403)                                     |
| Error genérico                 | `toast.error('Error al crear la cancha. Intentá nuevamente.')`         |
| Loading submit                 | Botón disabled + spinner + "Creando..."                                |

---

## 9. Flujo completo E2E (Create)

```
1. Usuario en /profile/fields
2. Click "Crear nueva cancha" → setIsCreateModalOpen(true)
3. FieldModal abre con título "Crear nueva cancha"
4. FieldForm inicializa con CREATE_FIELD_FORM_DEFAULT_VALUES
5. Usuario selecciona complejo del dropdown (cargado via useComplexesMapList)
6. Usuario completa: nombre, descripción (opcional), capacidad, superficie, switches
7. Click "Crear cancha" → form.handleSubmit(onSubmit)

8. onSubmit construye CreateFieldInputType:
   { complexId, title, description?, capacity, surface, isRooted, hasLighting, isDividable }

9. addFieldAsync(apiInput) → POST /api/rpc (createField)

10. Backend (createField handler):
    - authorizedMiddleware: verifica sesión, inyecta context.user.id
    - findUnique: verifica complejo existe, está activo, y ownerId === userId
    - findFirst: valida unicidad de título en el complejo (WHERE complexId + title + isActive)
    - $transaction:
      - create: FULL field con fieldType='FULL', isActive=true
      - Si isDividable=true: createMany con HALF_A y HALF_B (parentFieldId=fullField.id, capacity=Math.floor(capacity/2), título="${title} - Mitad A/B")
      - Si la transacción falla, ningún field se persiste

11. Frontend (onSuccess):
    - invalidateQueries(['fieldsList'])
    - invalidateQueries(['complexById', complexId])
    - toast.success('Cancha creada exitosamente')
    - form.reset()
    - onClose() → setIsCreateModalOpen(false)
    - Tabla se refresca automáticamente via TanStack Query
```

---

## 10. Orden de implementación recomendado

| #   | Tarea                           | Archivo(s)                        | Dependencias   |
| --- | ------------------------------- | --------------------------------- | -------------- |
| 1   | Schemas Zod (create)            | `src/orpc/schemas/field.ts`       | Spec list (#1) |
| 2   | Tipos TypeScript                | `src/types/field.ts`              | #1             |
| 3   | Procedimiento `createField`     | `src/orpc/router/field.ts`        | #1             |
| 4   | Registrar en router             | `src/orpc/router/index.ts`        | #3             |
| 5   | Hook `useAddField`              | `src/data/field/add-field.ts`     | #2, #4         |
| 6   | Default values                  | `src/config/fields.ts`            | #2             |
| 7   | `fieldFormFields.tsx`           | `src/components/profile/forms/`   | Ninguna        |
| 8   | `fieldForm.tsx`                 | `src/components/profile/forms/`   | #5, #6, #7     |
| 9   | `fieldModal.tsx`                | `src/components/profile/modals/`  | #8             |
| 10  | Wiring en `fieldsContainer.tsx` | `src/components/profile/general/` | #9             |
| 11  | Verificar build                 | `pnpm build`                      | Todo           |

---

## 11. Fuera de alcance (v2+)

- **Working schedules al crear** — ingresar horarios y precios durante la creación
- **Imágenes al crear** — requiere infraestructura de storage (Cloudflare R2)
- **`fieldType` configurable** — actualmente bloqueado a `FULL`

---

## 12. Consideraciones técnicas

1. **`fieldType = 'FULL'` hardcodeado en el backend.** No se acepta como input para prevenir la creación accidental de HALF fields sin un padre. Las sub-canchas (`HALF_A`/`HALF_B`) se crean automáticamente cuando `isDividable: true`.

2. **`description` como empty string → undefined.** El form usa `z.literal('')` para permitir el campo vacío. En `onSubmit`, se convierte: `data.description || undefined`.

3. **`useMyComplexesList` para el dropdown.** Llama al endpoint `getMyComplexesList` (usa `authorizedMiddleware`, filtra por `ownerId: userId`). Retorna `{ id, title, latitude, longitude }[]` solo del usuario autenticado. `getComplexesMapList` se mantiene intacto y público para el mapa de `/search`. Si el usuario no tiene complejos activos, el dropdown muestra "No tenés complejos activos".

4. **Ambos hooks se llaman incondicionalmente** (`useAddField` + `useUpdateField`) en `FieldForm` por las reglas de React hooks.

5. **Sentry:** wrappear el handler con `Sentry.startSpan(...)`.
