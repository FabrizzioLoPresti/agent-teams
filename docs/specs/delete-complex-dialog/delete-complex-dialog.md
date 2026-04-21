# SPEC: Eliminación de Complejo Deportivo (Soft Delete)

**Status:** Implemented
**Fecha:** 2026-03-31
**Ubicación:** `/profile/complexes`
**Alcance:** Soft delete de un complejo existente desde la tabla. Usa un `AlertDialog` de confirmación sin formulario — recibe ID y título directamente desde la fila.

---

## 1. Resumen

Implementar la eliminación lógica (soft delete) de un complejo deportivo mediante un **AlertDialog de confirmación**. El flujo se dispara desde el `DropdownMenuItem` "Eliminar" (ya existente con `variant="destructive"` pero sin `onClick`) en la tabla de complejos. El dialog muestra el nombre del complejo, un mensaje de advertencia, y dos botones: "Cancelar" y "Eliminar". El backend verifica ownership, chequea si hay reservas activas futuras, y ejecuta el soft delete en una transacción.

A diferencia del modal de edición, **no se necesita `<Suspense>`** porque el dialog no hace fetch de datos — recibe `complexId` y `complexTitle` directamente desde la fila de la tabla.

---

## 2. Decisiones de diseño

| Decisión                 | Elección                                                                                   | Razón                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Tipo de eliminación      | Soft delete (`isActive = false`, `deletedAt`, `deletedBy`)                                 | Preserva bookings, pagos y reseñas asociados. Reversible por admin.                                         |
| Componente UI            | Shadcn `AlertDialog` (instalar con `pnpx shadcn@latest add alert-dialog`)                  | Semánticamente correcto para confirmaciones destructivas. Distinto de `Dialog` que se usa para formularios. |
| Datos del dialog         | `complexId` + `complexTitle` como props desde la tabla                                     | Sin fetch adicional — el dato ya está en `info.row.original`. Sin Suspense.                                 |
| Verificación de reservas | Chequear bookings `PENDING`/`CONFIRMED` con `startDateTime > now()` en fields del complejo | Evita eliminar complejos con compromisos activos futuros. Retorna `CONFLICT` con mensaje descriptivo.       |
| Soft delete de fields    | Marcar `isActive = false` en todos los fields del complejo en la misma transacción         | Coherencia: las canchas de un complejo "eliminado" no deben aparecer disponibles.                           |
| Estado en container      | `deleteComplex: { id: string; title: string } \| null`                                     | Necesita ambos valores (ID para la mutación, título para mostrar en el dialog sin fetch).                   |
| Archivo del dialog       | `src/components/profile/modals/deleteComplexDialog.tsx`                                    | Sigue la convención de la carpeta `modals/` existente.                                                      |

---

## 3. Arquitectura de archivos

### 3.1 Archivos nuevos a crear

```
src/
├── components/
│   └── ui/
│       └── alert-dialog.tsx              # Shadcn AlertDialog (pnpx shadcn@latest add alert-dialog)
├── components/
│   └── profile/
│       └── modals/
│           └── deleteComplexDialog.tsx   # Dialog de confirmación de eliminación
└── data/
    └── complex/
        └── delete-complex.ts             # Hook: useDeleteComplex (mutation)
```

### 3.2 Archivos existentes a modificar

| Archivo                                                        | Cambio                                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `src/orpc/schemas/complex.ts`                                  | Agregar `DeleteComplexInputSchema`, `DeleteComplexResponseSchema`                     |
| `src/types/complex.ts`                                         | Agregar `DeleteComplexInputType`, `DeleteComplexResponseType`                         |
| `src/orpc/router/complex.ts`                                   | Agregar procedimiento `deleteComplex`                                                 |
| `src/orpc/router/index.ts`                                     | Registrar `deleteComplex`                                                             |
| `src/components/profile/tables/complexes/columnsTable.tsx`     | Agregar `onDeleteComplex` al type y wiring `onClick` en "Eliminar"                    |
| `src/components/profile/tables/complexes/useComplexesTable.ts` | Aceptar y pasar `onDeleteComplex` a `getColumnsTable`                                 |
| `src/components/profile/tables/complexes/complexesTable.tsx`   | Aceptar y forwardear prop `onDeleteComplex`                                           |
| `src/components/profile/general/complexesContainer.tsx`        | Agregar estado `deleteComplex`, handler, render condicional del `DeleteComplexDialog` |

---

## 4. Backend — ORPC

### 4.1 Schemas Zod (`src/orpc/schemas/complex.ts`)

Agregar al final del archivo:

```typescript
// ============================================================================
// DELETE COMPLEX — Soft delete
// ============================================================================
export const DeleteComplexInputSchema = z.object({
  id: z.cuid(),
})

export const DeleteComplexResponseSchema = z.object({
  id: z.cuid(),
  title: z.string(),
  deletedAt: z.date(),
})
```

### 4.2 Tipos TypeScript (`src/types/complex.ts`)

```typescript
import {
  // ... imports existentes
  DeleteComplexInputSchema,
  DeleteComplexResponseSchema,
} from '@/orpc/schemas/complex'

export type DeleteComplexInputType = z.infer<typeof DeleteComplexInputSchema>
export type DeleteComplexResponseType = z.infer<
  typeof DeleteComplexResponseSchema
>
```

### 4.3 Procedimiento ORPC `deleteComplex` (`src/orpc/router/complex.ts`)

```typescript
// ============================================================================
// DELETE COMPLEX (Soft Delete)
// ============================================================================
export const deleteComplex = authorizedMiddleware
  .input(DeleteComplexInputSchema)
  .output(createApiResponseSchema(DeleteComplexResponseSchema))
  .handler(async ({ input, errors, context }) => {
    const userId = context.user.id
    try {
      // 1. Verificar existencia, que esté activo, y ownership
      const existing = await prisma.complex.findUnique({
        where: { id: input.id },
        select: {
          ownerId: true,
          title: true,
          isActive: true,
          fields: {
            where: { isActive: true },
            select: { id: true },
          },
        },
      })
      if (!existing) {
        throw errors.NOT_FOUND({ message: 'Complejo no encontrado.' })
      }
      if (!existing.isActive) {
        throw errors.NOT_FOUND({ message: 'El complejo ya fue eliminado.' })
      }
      if (existing.ownerId !== userId) {
        throw errors.FORBIDDEN({
          message: 'No tenés permisos para eliminar este complejo.',
        })
      }

      // 2. Verificar que no haya reservas activas futuras
      const activeFieldIds = existing.fields.map((f) => f.id)
      if (activeFieldIds.length > 0) {
        const futureBookings = await prisma.booking.count({
          where: {
            fieldId: { in: activeFieldIds },
            status: { in: ['PENDING', 'CONFIRMED'] },
            startDateTime: { gt: new Date() },
          },
        })
        if (futureBookings > 0) {
          throw errors.CONFLICT({
            message: `No se puede eliminar el complejo porque tiene ${futureBookings} reserva${futureBookings > 1 ? 's' : ''} activa${futureBookings > 1 ? 's' : ''} a futuro. Cancelá o completá las reservas primero.`,
          })
        }
      }

      // 3. Soft delete en transacción: desactivar fields + marcar complejo como eliminado
      const now = new Date()
      const complex = await prisma.$transaction(async (tx) => {
        if (activeFieldIds.length > 0) {
          await tx.field.updateMany({
            where: { complexId: input.id, isActive: true },
            data: { isActive: false },
          })
        }

        return await tx.complex.update({
          where: { id: input.id },
          data: {
            isActive: false,
            deletedAt: now,
            deletedBy: userId,
          },
          select: {
            id: true,
            title: true,
            deletedAt: true,
          },
        })
      })

      return {
        message: 'Complejo eliminado exitosamente',
        status: 200,
        data: {
          id: complex.id,
          title: complex.title,
          deletedAt: complex.deletedAt!,
        },
      }
    } catch (error) {
      console.error('Error al eliminar complejo:', error)
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST()
    }
  })
```

**Notas de diseño del procedimiento:**

- El step 1 usa un único `findUnique` con `select` que incluye los field IDs activos, evitando una query separada.
- El step 2 solo ejecuta la query de bookings si el complejo tiene fields activos (optimización para complejos sin canchas).
- `deletedAt` se setea explícitamente con `new Date()` en vez de confiar en un `@default(now())` que no existe en el schema de Prisma (es un campo nullable, no auto-generado).
- **Bug fix post-implementación:** `getComplexesMapList` no filtraba por `isActive: true`, devolviendo complejos eliminados al mapa. Se agregó `where: { isActive: true }` al `findMany`. La invalidación de `['complexesMapList']` en `useDeleteComplex` ya estaba correcta.

### 4.4 Registro en router (`src/orpc/router/index.ts`)

```typescript
import {
  // ... imports existentes
  deleteComplex,
} from './complex'

export default {
  // ... existentes sin cambios
  deleteComplex,
}
```

---

## 5. Frontend — Data Hook (`src/data/complex/delete-complex.ts`)

Patrón idéntico a `update-complex.ts`. Invalida `dashboardMetrics` adicionalmente porque el dashboard filtra por `deletedAt: null`.

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import { DeleteComplexInputType } from '@/types/complex'

export const useDeleteComplex = () => {
  const queryClient = useQueryClient()

  const {
    mutate: deleteComplex,
    mutateAsync: deleteComplexAsync,
    data: deleteComplexData,
    isPending: isPendingDeleteComplex,
    isError: isErrorDeleteComplex,
    error: deleteComplexError,
    isSuccess: isSuccessDeleteComplex,
    status: deleteComplexStatus,
  } = useMutation({
    mutationFn: (input: DeleteComplexInputType) =>
      orpc.deleteComplex.call(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['complexesList'] })
      queryClient.invalidateQueries({ queryKey: ['complexesMapList'] })
      queryClient.invalidateQueries({ queryKey: ['complexById', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['dashboardMetrics'] })
    },
    onError: (error) => {
      console.error('Error deleting complex:', JSON.stringify(error))
    },
  })

  return {
    deleteComplex,
    deleteComplexAsync,
    deleteComplexData,
    isPendingDeleteComplex,
    isErrorDeleteComplex,
    deleteComplexError,
    isSuccessDeleteComplex,
    deleteComplexStatus,
  }
}
```

---

## 6. Frontend — Componentes

### 6.1 Instalar AlertDialog de Shadcn

```bash
pnpx shadcn@latest add alert-dialog
```

Genera `src/components/ui/alert-dialog.tsx` con: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`, `AlertDialogCancel`.

### 6.2 `deleteComplexDialog.tsx` — Dialog de confirmación

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
import { useDeleteComplex } from '@/data/complex/delete-complex'

type DeleteComplexDialogProps = {
  complexId: string
  complexTitle: string
  isOpen: boolean
  onClose: () => void
}

const DeleteComplexDialog = ({
  complexId,
  complexTitle,
  isOpen,
  onClose,
}: DeleteComplexDialogProps) => {
  const { deleteComplexAsync, isPendingDeleteComplex } = useDeleteComplex()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault() // Evita que AlertDialogAction cierre el dialog antes de que termine la mutación
    try {
      await deleteComplexAsync({ id: complexId })
      toast.success('Complejo eliminado exitosamente')
      onClose()
    } catch (error: unknown) {
      if (error instanceof ORPCError) {
        toast.error(error.message)
      } else {
        toast.error('Error al eliminar el complejo. Intentá nuevamente.')
      }
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar complejo</AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que querés eliminar{' '}
            <span className="font-semibold text-foreground">
              {complexTitle}
            </span>
            ? Esta acción desactivará el complejo y todas sus canchas. Las
            reservas pasadas se mantendrán en el historial.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPendingDeleteComplex}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isPendingDeleteComplex}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPendingDeleteComplex ? 'Eliminando...' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default DeleteComplexDialog
```

### 6.3 `complexesContainer.tsx` — Estado de eliminación

```typescript
import DeleteComplexDialog from '@/components/profile/modals/deleteComplexDialog'

// Estado:
const [deleteComplex, setDeleteComplex] = useState<{
  id: ComplexType['id']
  title: string
} | null>(null)

const handleDeleteComplex = (
  complexId: ComplexType['id'],
  complexTitle: string,
) => {
  setDeleteComplex({ id: complexId, title: complexTitle })
}

// JSX:
<ComplexesTable
  onViewDetail={handleViewDetail}
  onEditComplex={handleEditComplex}
  onDeleteComplex={handleDeleteComplex}
/>

{/* Dialog de eliminación — sin Suspense, no hace fetch */}
{deleteComplex && (
  <DeleteComplexDialog
    complexId={deleteComplex.id}
    complexTitle={deleteComplex.title}
    isOpen={true}
    onClose={() => setDeleteComplex(null)}
  />
)}
```

### 6.4 Tabla — Wiring del callback

**`columnsTable.tsx`** — Agregar `onDeleteComplex`:

```typescript
type GetColumnsTableParams = {
  onViewDetail: (complexId: ComplexType['id']) => void
  onEditComplex: (complexId: ComplexType['id']) => void
  onDeleteComplex: (complexId: ComplexType['id'], complexTitle: string) => void
}

export const getColumnsTable = ({
  onViewDetail,
  onEditComplex,
  onDeleteComplex,
}: GetColumnsTableParams) => [
  // ... columnas existentes sin cambios

  // En la celda de acciones:
  <DropdownMenuItem
    variant="destructive"
    onClick={() =>
      onDeleteComplex(info.row.original.id, info.row.original.title)
    }
  >
    Eliminar
  </DropdownMenuItem>
]
```

**`useComplexesTable.ts`**:

```typescript
type UseComplexesTableParams = {
  onViewDetail: (complexId: ComplexType['id']) => void
  onEditComplex: (complexId: ComplexType['id']) => void
  onDeleteComplex: (complexId: ComplexType['id'], complexTitle: string) => void
}

// Pasar a getColumnsTable:
columns: getColumnsTable({ onViewDetail, onEditComplex, onDeleteComplex }),
```

**`complexesTable.tsx`**:

```typescript
type Props = {
  onViewDetail: (complexId: ComplexType['id']) => void
  onEditComplex: (complexId: ComplexType['id']) => void
  onDeleteComplex: (complexId: ComplexType['id'], complexTitle: string) => void
}
```

---

## 7. UX/UI — Especificaciones visuales

### 7.1 AlertDialog de confirmación

- **Título:** `"Eliminar complejo"`
- **Descripción:** `"¿Estás seguro de que querés eliminar **{complexTitle}**? Esta acción desactivará el complejo y todas sus canchas. Las reservas pasadas se mantendrán en el historial."`
- **Nombre del complejo:** `font-semibold text-foreground` para resaltarlo (el `AlertDialogDescription` usa `text-muted-foreground` por defecto).
- **Botón "Cancelar":** Estilo secundario (default de `AlertDialogCancel`). Disabled durante loading.
- **Botón "Eliminar":** `bg-destructive text-white hover:bg-destructive/90`. Loading: `"Eliminando..."`. Disabled durante loading.
- **Cierre:** ESC y click fuera del dialog llaman `onClose()`, excepto durante `isPendingDeleteComplex`.

### 7.2 Feedback visual

| Situación              | Feedback                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Eliminación exitosa    | `toast.success('Complejo eliminado exitosamente')`                                                                                       |
| Tiene reservas futuras | `toast.error('No se puede eliminar el complejo porque tiene N reserva(s) activa(s) a futuro. Cancelá o completá las reservas primero.')` |
| Sin permisos           | `toast.error(error.message)` (403)                                                                                                       |
| Complejo no encontrado | `toast.error(error.message)` (404)                                                                                                       |
| Ya eliminado           | `toast.error(error.message)` (404 — "El complejo ya fue eliminado.")                                                                     |
| Error genérico         | `toast.error('Error al eliminar el complejo. Intentá nuevamente.')`                                                                      |
| Loading                | Botón disabled con texto "Eliminando...", botón "Cancelar" también disabled                                                              |

---

## 8. Flujo completo E2E

```
1. Usuario en /profile/complexes
2. Click en MoreHorizontal (⋯) de un complejo → DropdownMenu se abre
3. Click "Eliminar" → onDeleteComplex(complexId, complexTitle)
4. setDeleteComplex({ id, title }) → DeleteComplexDialog se renderiza
5. AlertDialog se abre mostrando el nombre del complejo y mensaje de advertencia

6. Opción A: Click "Cancelar" o ESC
   → onClose() → setDeleteComplex(null) → Dialog se cierra

7. Opción B: Click "Eliminar"
   → handleDelete(e) → e.preventDefault()
   → isPendingDeleteComplex = true
   → Botones se deshabilitan, texto cambia a "Eliminando..."
   → deleteComplexAsync({ id: complexId }) → POST /api/rpc (deleteComplex)

8. Backend (deleteComplex handler):
   a. authorizedMiddleware: verifica sesión, inyecta context.user.id
   b. findUnique: verifica existencia, isActive, y ownerId === userId
   c. Si el complejo tiene fields activos: count bookings PENDING/CONFIRMED con startDateTime > now()
   d. Si hay bookings activos: throw CONFLICT con mensaje descriptivo pluralizado
   e. $transaction:
      - updateMany fields: isActive = false
      - update complex: isActive = false, deletedAt = now(), deletedBy = userId
   f. Retorna 200 con { id, title, deletedAt }

9. Frontend (onSuccess):
   a. invalidateQueries(['complexesList', 'complexesMapList', 'complexById', id, 'dashboardMetrics'])
   b. toast.success('Complejo eliminado exitosamente')
   c. onClose() → setDeleteComplex(null) → Dialog se cierra
   d. Tabla se refresca automáticamente via TanStack Query — el complejo desaparece
      (porque getComplexesList filtra por isActive: true)
```

---

## 9. Orden de implementación recomendado

| #   | Tarea                                 | Archivo(s)                                                       | Dependencias |
| --- | ------------------------------------- | ---------------------------------------------------------------- | ------------ |
| 1   | Instalar AlertDialog de Shadcn        | `pnpx shadcn@latest add alert-dialog`                            | Ninguna      |
| 2   | Schemas Zod                           | `src/orpc/schemas/complex.ts`                                    | Ninguna      |
| 3   | Tipos TypeScript                      | `src/types/complex.ts`                                           | #2           |
| 4   | Procedimiento `deleteComplex`         | `src/orpc/router/complex.ts`                                     | #2           |
| 5   | Registrar en router                   | `src/orpc/router/index.ts`                                       | #4           |
| 6   | Hook `useDeleteComplex`               | `src/data/complex/delete-complex.ts`                             | #3, #5       |
| 7   | `DeleteComplexDialog`                 | `src/components/profile/modals/deleteComplexDialog.tsx`          | #1, #6       |
| 8   | Wiring tabla                          | `columnsTable.tsx`, `useComplexesTable.ts`, `complexesTable.tsx` | Ninguna      |
| 9   | Container (estado + handler + render) | `src/components/profile/general/complexesContainer.tsx`          | #7, #8       |
| 10  | Verificar build                       | `pnpm build`                                                     | Todo         |

---

## 10. Fuera de alcance (v2+)

- **Restauración de complejo eliminado** — panel de admin para reactivar complejos con soft-deleted.
- **Notificación a usuarios con reservas pasadas** — email/push avisando que el complejo fue desactivado.
- **Hard delete** — eliminación permanente con cascade a bookings/payments/reviews.
- **Soft delete de fields independiente** — eliminar canchas individuales sin eliminar el complejo.
- **Audit log** — registro detallado más allá del campo `deletedBy`.
- **Confirmación por texto** — pedir al usuario que escriba el nombre del complejo para confirmar.
- **Bulk delete** — seleccionar múltiples complejos y eliminarlos de una vez.

---

## 11. Consideraciones técnicas

1. **Sin cambios en el schema de Prisma.** Los campos `deletedAt` (DateTime?), `deletedBy` (String?), e `isActive` (Boolean) ya existen en `Complex`. Los fields también tienen `isActive`.

2. **Sin Suspense necesario.** A diferencia del modal de edición, el dialog de eliminación recibe `complexId` y `complexTitle` como props directas desde la fila de la tabla. El render condicional `{deleteComplex && <DeleteComplexDialog ... />}` es suficiente.

3. **Coherencia de filtros existentes.** `getComplexesList` filtra por `isActive: true`. `getDashboardMetrics` filtra por `deletedAt: null`. Ambos filtros son satisfechos por el soft delete sin cambios en queries existentes.

4. **`AlertDialogAction` y cierre automático.** Por defecto, `AlertDialogAction` cierra el dialog al click. Se usa `e.preventDefault()` en `handleDelete` para evitar que se cierre antes de que la mutación termine. El cierre se ejecuta manualmente vía `onClose()` en el bloque `try`.

5. **Callback con dos parámetros.** `onDeleteComplex` recibe `(complexId, complexTitle)` a diferencia de `onEditComplex` que solo recibe `(complexId)`. Esto evita un fetch adicional — el título ya está disponible en `info.row.original.title`.

6. **Invalidación de `dashboardMetrics`.** A diferencia de create/update, el delete también invalida `dashboardMetrics` porque el dashboard cuenta complejos con `deletedAt: null`.

7. **Mensaje pluralizado.** El error por reservas activas usa pluralización básica con operador ternario: `reserva${n > 1 ? 's' : ''} activa${n > 1 ? 's' : ''}`.

8. **Variable de estado nombrada `deleteComplex`.** No nombrar `deleteComplexId` (como `editComplexId`) porque también necesita el título. El objeto `{ id, title }` como estado es más expresivo.
