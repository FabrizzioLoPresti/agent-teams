# SPEC: Eliminación de Cancha (Soft Delete)

**Status:** Implemented ✓
**Fecha:** 2026-04-03
**Ubicación:** `/profile/fields`
**Alcance:** Soft delete de una cancha existente desde la tabla. Usa un `AlertDialog` de confirmación sin formulario — recibe ID y título directamente desde la fila.

---

## 1. Resumen

Implementar la eliminación lógica (soft delete) de una cancha mediante un **AlertDialog de confirmación**. El flujo se dispara desde el `DropdownMenuItem` "Eliminar" en la tabla de canchas. El dialog muestra el nombre de la cancha, un mensaje de advertencia, y dos botones: "Cancelar" y "Eliminar". El backend verifica ownership, chequea si hay reservas activas futuras, y ejecuta el soft delete.

A diferencia del modal de edición, **no se necesita `<Suspense>`** porque el dialog no hace fetch de datos — recibe `fieldId` y `fieldTitle` directamente desde la fila de la tabla.

**Diferencia clave con delete complejo:** El modelo `Field` tiene `isActive` pero NO tiene `deletedAt`/`deletedBy`. El soft delete es simplemente `isActive = false`.

---

## 2. Decisiones de diseño

| Decisión                 | Elección                                                   | Razón                                                              |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| Tipo de eliminación      | Soft delete (`isActive = false`)                           | El modelo Field no tiene `deletedAt`/`deletedBy` — solo `isActive` |
| Componente UI            | Shadcn `AlertDialog`                                       | Semánticamente correcto para confirmaciones destructivas           |
| Datos del dialog         | `fieldId` + `fieldTitle` como props                        | Sin fetch adicional — el dato ya está en `info.row.original`       |
| Verificación de reservas | Bookings `PENDING`/`CONFIRMED` con `startDateTime > now()` | Misma lógica que delete complejo, pero solo para esta cancha       |
| Sin cascade              | Solo desactiva la cancha individual                        | A diferencia del delete complejo que cascadea a todos sus fields   |
| Estado en container      | `deleteField: { id: string; title: string } \| null`       | Necesita ambos valores sin fetch adicional                         |

---

## 3. Arquitectura de archivos

### 3.1 Archivos nuevos a crear

```
src/
└── data/
    └── field/
        └── delete-field.ts                              # Hook: useDeleteField (mutation)
src/components/
└── profile/
    └── modals/
        └── deleteFieldDialog.tsx                        # AlertDialog de confirmación
```

### 3.2 Archivos existentes a modificar

| Archivo                                              | Cambio                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `src/orpc/schemas/field.ts`                          | Agregar `DeleteFieldInputSchema`, `DeleteFieldResponseSchema`        |
| `src/orpc/router/field.ts`                           | Agregar procedimiento `deleteField`                                  |
| `src/orpc/router/index.ts`                           | Registrar `deleteField`                                              |
| `src/types/field.ts`                                 | Agregar `DeleteFieldInputType`, `DeleteFieldResponseType`            |
| `src/components/profile/general/fieldsContainer.tsx` | Agregar estado `deleteField`, handler, render condicional del dialog |

---

## 4. Backend — ORPC

### 4.1 Schemas Zod (`src/orpc/schemas/field.ts`)

```typescript
// ============================================================================
// DELETE FIELD — Soft delete
// ============================================================================
export const DeleteFieldInputSchema = FieldSchema.pick({
  id: true,
})

// Sin deletedAt porque Field no tiene ese campo en Prisma (derivado de FieldSchema)
export const DeleteFieldResponseSchema = FieldSchema.pick({
  id: true,
  title: true,
})
```

### 4.2 Tipos TypeScript (`src/types/field.ts`)

```typescript
import {
  DeleteFieldInputSchema,
  DeleteFieldResponseSchema,
} from '@/orpc/schemas/field'

export type DeleteFieldInputType = z.infer<typeof DeleteFieldInputSchema>
export type DeleteFieldResponseType = z.infer<typeof DeleteFieldResponseSchema>
```

### 4.3 Procedimiento ORPC `deleteField` (`src/orpc/router/field.ts`)

```typescript
// ============================================================================
// DELETE FIELD (Soft Delete)
// ============================================================================
export const deleteField = authorizedMiddleware
  .input(DeleteFieldInputSchema)
  .output(createApiResponseSchema(DeleteFieldResponseSchema))
  .handler(async ({ input, errors, context }) => {
    return await Sentry.startSpan({ name: 'deleteField' }, async () => {
      const userId = context.user.id
      try {
        // 1. Verificar existencia, que esté activo, y ownership
        const existing = await prisma.field.findUnique({
          where: { id: input.id },
          select: {
            title: true,
            isActive: true,
            complex: {
              select: { ownerId: true },
            },
          },
        })
        if (!existing) {
          throw errors.NOT_FOUND({ message: 'Cancha no encontrada.' })
        }
        if (!existing.isActive) {
          throw errors.NOT_FOUND({ message: 'La cancha ya fue eliminada.' })
        }
        if (existing.complex.ownerId !== userId) {
          throw errors.FORBIDDEN({
            message: 'No tenés permisos para eliminar esta cancha.',
          })
        }

        // 2. Verificar reservas activas futuras en la cancha y sus sub-canchas
        const futureBookings = await prisma.booking.count({
          where: {
            field: {
              OR: [{ id: input.id }, { parentFieldId: input.id }],
            },
            status: { in: ['PENDING', 'CONFIRMED'] },
            startDateTime: { gt: new Date() },
          },
        })
        if (futureBookings > 0) {
          throw errors.CONFLICT({
            message: `No se puede eliminar la cancha porque tiene ${futureBookings} reserva${futureBookings > 1 ? 's' : ''} activa${futureBookings > 1 ? 's' : ''} a futuro. Cancelá o completá las reservas primero.`,
          })
        }

        // 3. Soft delete en cascada: desactiva la cancha principal y sus sub-canchas
        const field = await prisma.$transaction(async (tx) => {
          await tx.field.updateMany({
            where: { parentFieldId: input.id },
            data: { isActive: false },
          })
          return tx.field.update({
            where: { id: input.id },
            data: { isActive: false },
            select: { id: true, title: true },
          })
        })

        return {
          message: 'Cancha eliminada exitosamente',
          status: 200,
          data: {
            id: field.id,
            title: field.title,
          },
        }
      } catch (error) {
        console.error('Error al eliminar cancha:', error)
        if (error instanceof ORPCError) throw error
        throw errors.BAD_REQUEST()
      }
    })
  })
```

**Notas de diseño del procedimiento:**

- Un único `findUnique` con `select` que incluye `complex.ownerId` — evita query separada de verificación de ownership.
- La query de bookings siempre se ejecuta (a diferencia del delete complejo que la omite si no hay fields activos).
- `deletedAt` no existe en el modelo `Field` — solo se setea `isActive = false`.
- Mensaje de conflicto pluralizado con operador ternario.

### 4.4 Registro en router (`src/orpc/router/index.ts`)

```typescript
import { ..., deleteField } from './field'

export default {
  // ... existentes sin cambios
  deleteField,
}
```

---

## 5. Frontend — Data Hook (`src/data/field/delete-field.ts`)

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import { DeleteFieldInputType } from '@/types/field'

export const useDeleteField = () => {
  const queryClient = useQueryClient()

  const {
    mutate: deleteField,
    mutateAsync: deleteFieldAsync,
    data: deleteFieldData,
    isPending: isPendingDeleteField,
    isError: isErrorDeleteField,
    error: deleteFieldError,
    isSuccess: isSuccessDeleteField,
    status: deleteFieldStatus,
  } = useMutation({
    mutationFn: (input: DeleteFieldInputType) => orpc.deleteField.call(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldsList'] })
      queryClient.invalidateQueries({ queryKey: ['fieldById', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['complexById'] }) // invalida todos los complexById
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] })
    },
    onError: (error) => {
      console.error('Error deleting field:', JSON.stringify(error))
    },
  })

  return {
    deleteField,
    deleteFieldAsync,
    deleteFieldData,
    isPendingDeleteField,
    isErrorDeleteField,
    deleteFieldError,
    isSuccessDeleteField,
    deleteFieldStatus,
  }
}
```

---

## 6. Frontend — Componentes

### 6.1 `deleteFieldDialog.tsx` — Dialog de confirmación

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ORPCError } from '@orpc/client'
import { toast } from 'sonner'
import { useDeleteField } from '@/data/field/delete-field'

type DeleteFieldDialogProps = {
  fieldId: FieldType['id']
  fieldTitle: FieldType['title']
  isOpen: boolean
  onClose: () => void
}

const DeleteFieldDialog = ({
  fieldId,
  fieldTitle,
  isOpen,
  onClose,
}: DeleteFieldDialogProps) => {
  const { deleteFieldAsync, isPendingDeleteField } = useDeleteField()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault() // Evita que AlertDialogAction cierre el dialog antes de la mutación
    try {
      await deleteFieldAsync({ id: fieldId })
      toast.success('Cancha eliminada exitosamente')
      onClose()
    } catch (error: unknown) {
      if (error instanceof ORPCError) {
        toast.error(error.message)
      } else {
        toast.error('Error al eliminar la cancha. Intentá nuevamente.')
      }
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar cancha</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que querés eliminar{' '}
            <span className="font-semibold text-foreground">
              {fieldTitle}
            </span>
            ? Esta acción desactivará la cancha. Las reservas pasadas se
            mantendrán en el historial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPendingDeleteField}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPendingDeleteField}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPendingDeleteField ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteFieldDialog
```

### 6.2 `fieldsContainer.tsx` — Estado de eliminación

```typescript
import DeleteFieldDialog from '@/components/profile/modals/deleteFieldDialog'

// Estado:
const [deleteField, setDeleteField] = useState<{
  id: FieldType['id']
  title: FieldType['title']
} | null>(null)

const handleDeleteField = (
  fieldId: FieldType['id'],
  fieldTitle: FieldType['title'],
) => {
  setDeleteField({ id: fieldId, title: fieldTitle })
}

// JSX:
<FieldsTable
  onEditField={handleEditField}
  onDeleteField={handleDeleteField}
/>

{/* Dialog de eliminación — sin Suspense, no hace fetch */}
{deleteField && (
  <DeleteFieldDialog
    fieldId={deleteField.id}
    fieldTitle={deleteField.title}
    isOpen={true}
    onClose={() => setDeleteField(null)}
  />
)}
```

---

## 7. UX/UI — Especificaciones visuales

### 7.1 AlertDialog de confirmación

- **Título:** `"Eliminar cancha"`
- **Descripción:** `"¿Estás seguro de que querés eliminar **{fieldTitle}**? Esta acción desactivará la cancha. Las reservas pasadas se mantendrán en el historial."`
- **Nombre de la cancha:** `font-semibold text-foreground` (el `AlertDialogDescription` usa `text-muted-foreground` por defecto).
- **Botón "Cancelar":** Estilo secundario (default de `AlertDialogCancel`). Disabled durante loading.
- **Botón "Eliminar":** `bg-destructive text-white hover:bg-destructive/90`. Loading: `"Eliminando..."`. Disabled durante loading.
- **Cierre:** ESC y click fuera del dialog llaman `onClose()`, excepto durante `isPendingDeleteField`.

### 7.2 Feedback visual

| Situación              | Feedback                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Eliminación exitosa    | `toast.success('Cancha eliminada exitosamente')`                                                                                       |
| Tiene reservas futuras | `toast.error('No se puede eliminar la cancha porque tiene N reserva(s) activa(s) a futuro. Cancelá o completá las reservas primero.')` |
| Sin permisos           | `toast.error(error.message)` (403)                                                                                                     |
| Cancha no encontrada   | `toast.error(error.message)` (404)                                                                                                     |
| Ya eliminada           | `toast.error('La cancha ya fue eliminada.')` (404)                                                                                     |
| Error genérico         | `toast.error('Error al eliminar la cancha. Intentá nuevamente.')`                                                                      |
| Loading                | Botón "Eliminar" disabled + "Eliminando...", botón "Cancelar" también disabled                                                         |

---

## 8. Flujo completo E2E

```
1. Usuario en /profile/fields
2. Click en (⋯) de una cancha → DropdownMenu se abre
3. Click "Eliminar" → onDeleteField(fieldId, fieldTitle)
4. setDeleteField({ id, title }) → DeleteFieldDialog se renderiza
5. AlertDialog se abre mostrando el nombre de la cancha y mensaje de advertencia

6. Opción A: Click "Cancelar" o ESC
   → onClose() → setDeleteField(null) → Dialog se cierra

7. Opción B: Click "Eliminar"
   → handleDelete(e) → e.preventDefault()
   → isPendingDeleteField = true
   → Botones se deshabilitan, texto cambia a "Eliminando..."
   → deleteFieldAsync({ id: fieldId }) → POST /api/rpc (deleteField)

8. Backend (deleteField handler):
   a. authorizedMiddleware: verifica sesión, inyecta context.user.id
   b. findUnique: verifica existencia, isActive, y complex.ownerId === userId
   c. count: bookings PENDING/CONFIRMED con startDateTime > now() para esta cancha
   d. Si hay bookings activos: throw CONFLICT con mensaje descriptivo pluralizado
   e. $transaction: updateMany sub-canchas (parentFieldId = id) → isActive = false; update field principal → isActive = false

9. Frontend (onSuccess):
   a. invalidateQueries(['fieldsList'])
   b. invalidateQueries(['fieldById', id])
   c. invalidateQueries(['complexById'])    → invalida todos los detalles de complejo
   d. invalidateQueries(['dashboardMetrics'])
   e. toast.success('Cancha eliminada exitosamente')
   f. onClose() → setDeleteField(null) → Dialog se cierra
   g. Tabla se refresca automáticamente via TanStack Query — la cancha desaparece
      (porque getFieldsList filtra por isActive: true)
```

---

## 9. Orden de implementación recomendado

| #   | Tarea                                 | Archivo(s)                                            | Dependencias |
| --- | ------------------------------------- | ----------------------------------------------------- | ------------ |
| 1   | Schemas Zod (delete)                  | `src/orpc/schemas/field.ts`                           | Spec list    |
| 2   | Tipos TypeScript                      | `src/types/field.ts`                                  | #1           |
| 3   | Procedimiento `deleteField`           | `src/orpc/router/field.ts`                            | #1           |
| 4   | Registrar en router                   | `src/orpc/router/index.ts`                            | #3           |
| 5   | Hook `useDeleteField`                 | `src/data/field/delete-field.ts`                      | #2, #4       |
| 6   | `DeleteFieldDialog`                   | `src/components/profile/modals/deleteFieldDialog.tsx` | #5           |
| 7   | Container (estado + handler + render) | `src/components/profile/general/fieldsContainer.tsx`  | #6           |
| 9   | Verificar build                       | `pnpm build`                                          | Todo         |

---

## 10. Fuera de alcance (v2+)

- **Restauración de cancha eliminada** — panel de admin para reactivar con `isActive = true`.
- **Notificación a usuarios con reservas pasadas** — email/push sobre cancha desactivada.
- **Hard delete** — eliminación permanente con cascade a bookings/schedules.
- **Bulk delete** — seleccionar múltiples canchas y eliminarlas de una vez.
- **Confirmación por texto** — pedir al usuario que escriba el nombre de la cancha para confirmar.

---

## 11. Consideraciones técnicas

1. **`Field` no tiene `deletedAt`/`deletedBy`.** A diferencia del modelo `Complex`, el soft delete en `Field` es solo `isActive = false`. Si se necesita auditoría, se requiere una migración de Prisma (v2).

2. **Soft delete en cascada.** Al eliminar una cancha FULL divisible, se desactivan también sus sub-canchas (`HALF_A`/`HALF_B`) en la misma transacción (`$transaction` con `updateMany` sobre `parentFieldId = input.id` + `update` de la principal). El `updateMany` sobre sub-canchas que no existen es no-op — no falla.

3. **El conteo de reservas incluye sub-canchas.** El `booking.count` filtra por `field.OR: [{ id }, { parentFieldId: id }]` para bloquear el delete si alguna sub-cancha también tiene reservas futuras activas.

4. **Sin Suspense necesario.** El dialog recibe `fieldId` y `fieldTitle` como props directas desde la fila de la tabla. No hace fetch.

5. **`AlertDialogAction` y cierre automático.** Se usa `e.preventDefault()` en `handleDelete` para evitar que el dialog se cierre antes de que la mutación termine.

6. **Invalidación de `complexById` sin ID específico.** Se invalida toda la caché de `complexById` porque no se sabe desde qué complejo viene la cancha sin un estado adicional. Esto es un trade-off aceptable.

7. **Callback con dos parámetros.** `onDeleteField(fieldId, fieldTitle)` — mismo patrón que `onDeleteComplex(complexId, complexTitle)`.

8. **Filtros de `getFieldsList` ya manejan la ausencia.** La query filtra por `isActive: true`, así que la cancha eliminada desaparece automáticamente de la tabla en el próximo refetch (triggerado por la invalidación).

9. **Pluralización del mensaje de conflicto.** `reserva${n > 1 ? 's' : ''} activa${n > 1 ? 's' : ''}` — mismo patrón que delete complejo.
