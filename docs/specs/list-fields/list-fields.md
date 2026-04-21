# SPEC: Listado de Canchas (Tabla Paginada con Sub-filas Expandibles)

**Status:** Implemented
**Fecha:** 2026-04-03
**Actualización:** 2026-04-04
**Ubicación:** `/profile/fields`
**Alcance:** Tabla paginada y sorteable de todas las canchas activas del usuario. Canchas `FULL` son filas principales; sus mitades (`HALF_A`/`HALF_B`) se muestran como sub-filas expandibles.

---

## 1. Resumen

Implementar la pantalla `/profile/fields` con una tabla paginada que muestra solo las canchas de tipo `FULL` del usuario a través de todos sus complejos activos. Si una cancha es divisible y tiene sub-canchas (`HALF_A`/`HALF_B`), aparece un botón de expansión (►) en la fila que despliega las mitades como sub-filas.

El `fieldsContainer.tsx` (stub vacío) se convierte en un container funcional. La tabla **no usa `DataTable`** — se construye directamente con los primitivos de Shadcn (`Table`, `TableBody`, etc.) para soportar la expansión de sub-filas.

---

## 2. Decisiones de diseño

| Decisión                 | Elección                                                   | Razón                                                                                             |
| ------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Scope de datos (backend) | Solo canchas `FULL` con `subFields` anidados               | Las mitades son derivadas de la cancha principal; mostrarlas como top-level rows sería redundante |
| Sub-filas expandibles    | Expansión manual con `Set<id>` en `useFieldsTable`         | `DataTable` no soporta sub-filas; tabla custom evita modificar componente compartido              |
| Paginación               | Server-side sobre canchas `FULL` solamente                 | Las mitades no cuentan como filas independientes para la paginación                               |
| Columnas mostradas       | Nombre, Complejo, Tipo, Superficie, Capacidad, Fecha       | Iluminación y techado son detalle de edición, no datos de gestión diaria                          |
| `columnsTable.tsx`       | Eliminado — columnas definidas inline en `fieldsTable.tsx` | La tabla custom con sub-filas requiere render propio; `createColumnHelper` no aplica              |
| Schemas                  | Nuevo `src/orpc/schemas/field.ts`                          | Separar schemas de fields de los de complexes                                                     |
| Tipado de IDs y props    | `FieldType['id']`, `FieldType['title']` (indexed access)   | `FieldType` es la entidad dominio; los schemas de tabla se derivan de ella vía `.pick()`          |

---

## 3. Arquitectura de archivos

### 3.1 Archivos creados

```
src/
├── orpc/schemas/field.ts              # Schemas Zod: sort, table, subFields, pagination
└── data/field/get-fields.ts           # Hook: useFieldsList
src/components/profile/
├── tables/fields/
│   ├── useFieldsTable.ts              # Hook: pagination, sorting, expandedIds, toggleExpand
│   └── fieldsTable.tsx                # Tabla custom con sub-filas expandibles
└── general/fieldsContainer.tsx        # Container con estado create/edit/delete
```

### 3.2 Archivos modificados

| Archivo                       | Cambio                                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/orpc/router/field.ts`    | Reemplazado `getFieldsList` no-paginado con versión paginada + filtro `FULL` + `subFields`                                                                      |
| `src/orpc/router/index.ts`    | Registrado `getFieldsList`                                                                                                                                      |
| `src/types/field.ts`          | Renombrado `FieldType` (enum alias) a `FieldKind`; agregado `FieldType` como entidad dominio; `FieldByComplexIdType` derivado de `ComplexFieldSchema`           |
| `src/orpc/schemas/complex.ts` | `FieldSchema` reemplazado por `ComplexFieldSchema`, derivado del dominio con `.pick().extend({ fieldWorkingSchedules })`; importa `FieldSchema` desde `./field` |

---

## 4. Backend — ORPC

### 4.1 Schemas Zod (`src/orpc/schemas/field.ts`)

El archivo define primero `FieldSchema` como entidad base, y los schemas de tabla se derivan de él con `.pick()`. Esto garantiza que cualquier cambio en la entidad se propague automáticamente sin duplicar definiciones.

```typescript
// Entidad dominio Field (refleja el modelo Prisma completo)
export const FieldSchema = z.object({
  id: z.cuid(),
  title: z.string(),
  description: z.string().nullable(),
  capacity: z.number().int(),
  fieldType: z.enum(FIELD_TYPE_VALUES),
  isDividable: z.boolean(),
  surface: z.enum(SURFACE_VALUES),
  isRooted: z.boolean(),
  hasLighting: z.boolean(),
  isActive: z.boolean(),
  parentFieldId: z.cuid().nullable(),
  complexId: z.cuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

// Schema para sub-canchas (HALF_A / HALF_B) — derivado de FieldSchema
export const SubFieldsTableResponseSchema = FieldSchema.pick({
  id: true,
  title: true,
  complexId: true,
  fieldType: true,
  surface: true,
  capacity: true,
})

// Schema para filas principales (solo canchas FULL) — derivado de FieldSchema
export const FieldsTableResponseSchema = FieldSchema.pick({
  id: true,
  title: true,
  complexId: true,
  fieldType: true,
  surface: true,
  capacity: true,
  createdAt: true,
}).extend({
  complexName: z.string(),
  subFields: z.array(SubFieldsTableResponseSchema),
})
```

**Convención de nomenclatura de schemas:**

| Schema                         | Archivo                       | Descripción                                                                            |
| ------------------------------ | ----------------------------- | -------------------------------------------------------------------------------------- |
| `FieldSchema`                  | `src/orpc/schemas/field.ts`   | Entidad dominio completa (fuente de verdad)                                            |
| `SubFieldsTableResponseSchema` | `src/orpc/schemas/field.ts`   | `.pick()` de `FieldSchema` para sub-filas                                              |
| `FieldsTableResponseSchema`    | `src/orpc/schemas/field.ts`   | `.pick().extend()` de `FieldSchema` para filas principales                             |
| `ComplexFieldSchema`           | `src/orpc/schemas/complex.ts` | `.pick().extend({ fieldWorkingSchedules })` de `FieldSchema`; usado en el booking flow |

**Convención de tipado:** En todos los archivos del dominio `field`, los IDs y propiedades se tipan vía indexed access sobre `FieldType` (la entidad dominio), no sobre schemas de tabla:

```typescript
// ✅ Correcto
FieldType['id'] // para cualquier ID de una cancha
FieldType['title'] // para el título de una cancha

// ❌ Incorrecto
FieldsTableResponseType['id']
string
```

export const GetFieldsByUserIdInputSchema = paginationSchema
.extend(sortSchema.shape)
.extend({ sortBy: z.enum(fieldSortFieldsEnum).default('createdAt') })

export const FieldsWithPaginationResponseSchema = z.object({
fields: FieldsTableResponseSchema.array(),
pagination: paginationResponseSchema,
})

````

### 4.2 Procedimiento ORPC `getFieldsList` (`src/orpc/router/field.ts`)

```typescript
const where = {
  isActive: true,
  fieldType: 'FULL' as const, // solo canchas principales
  complex: { ownerId: userId, isActive: true },
}

// Promise.all: count + findMany en paralelo
prisma.field.findMany({
  where,
  select: {
    id,
    title,
    complexId,
    complex: { select: { title: true } },
    fieldType,
    surface,
    capacity,
    createdAt,
    subFields: {
      where: { isActive: true },
      select: { id, title, complexId, fieldType, surface, capacity },
      orderBy: { fieldType: 'asc' }, // HALF_A antes que HALF_B
    },
  },
  orderBy: { [input.sortBy]: input.sortOrder },
  skip: input.pageIndex * input.pageSize,
  take: input.pageSize,
})
````

**Nota de diseño:** La paginación y el `total` se calculan sobre canchas `FULL` solamente. Las sub-canchas no incrementan el conteo de páginas.

---

## 5. Frontend — Data Hook (`src/data/field/get-fields.ts`)

```typescript
export const useFieldsList = ({
  pageIndex,
  pageSize,
  sortBy,
  sortOrder,
  enabled,
} = {}) => {
  const { data, refetch, isLoading, isError, error } = useQuery({
    queryKey: ['fieldsList', pageIndex, pageSize, sortBy, sortOrder],
    queryFn: () =>
      orpc.getFieldsList.call({ pageIndex, pageSize, sortBy, sortOrder }),
    staleTime: 1000 * 60 * 5,
    enabled,
  })

  return {
    fields: data?.data?.fields ?? [],
    pagination: data?.data?.pagination,
    refetchFields: refetch,
    isLoadingFields: isLoading,
    isErrorFields: isError,
    fieldsError: error,
  }
}
```

---

## 6. Frontend — Componentes

### 6.1 `useFieldsTable.ts`

```typescript
const [expandedIds, setExpandedIds] = useState<Set<FieldType['id']>>(new Set())
const [sorting, setSorting] = useState<{ id: string; desc: boolean }>({
  id: 'createdAt',
  desc: true,
})

const toggleExpand = (fieldId) => {
  setExpandedIds((prev) => {
    const next = new Set(prev)
    next.has(fieldId) ? next.delete(fieldId) : next.add(fieldId)
    return next
  })
}

const handleSort = (columnId) => {
  setSorting((prev) => {
    if (prev.id !== columnId) return { id: columnId, desc: false }
    if (!prev.desc) return { id: columnId, desc: true }
    return { id: 'createdAt', desc: true } // reset
  })
}

// Retorna: data, pagination, setPagination, sorting, handleSort,
//          pageCount, expandedIds, toggleExpand, refetchFields, isLoading
```

### 6.2 `fieldsTable.tsx` — Tabla custom con expansión

Tabla construida con primitivos de Shadcn (no usa `DataTable`):

**Columnas de la cabecera:**

| #   | Header              | Sortable | Ancho |
| --- | ------------------- | -------- | ----- |
| —   | (expand toggle)     | No       | 40px  |
| 1   | `Nombre`            | Sí       | 200px |
| 2   | `Complejo`          | No       | 180px |
| 3   | `Tipo`              | No       | 100px |
| 4   | `Superficie`        | No       | 140px |
| 5   | `Capacidad`         | No       | 110px |
| 6   | `Fecha de creación` | Sí       | 150px |
| —   | (acciones)          | No       | 50px  |

**Fila principal (FULL field):**

- Columna expand: `ChevronRight` / `ChevronDown` (solo visible si `subFields.length > 0`)
- Nombre en `font-medium`
- Acciones: DropdownMenu con Editar + Eliminar

**Sub-fila (HALF_A / HALF_B, cuando expandida):**

- `bg-muted/20` con `hover:bg-muted/30`
- Columna nombre: `pl-4` + ícono `CornerDownRight` + texto en `text-sm`
- Columna tipo: `Badge variant="outline"` con `getFieldTypeLabel`
- Columnas Complejo y Fecha vacías (heredadas del padre)
- Acciones propias (editar/eliminar la mitad independientemente)

**Estado vacío:** `colSpan={8}` con mensaje centrado.

**Paginación:** Botones «, ‹, numerados, ›, » — misma lógica visual que `DataTable`.

### 6.3 `fieldsContainer.tsx`

```typescript
const [editFieldId, setEditFieldId] = useState<FieldType['id'] | null>(null)
const [deleteField, setDeleteField] = useState<{
  id: FieldType['id']
  title: FieldType['title']
} | null>(null)
const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

// Renders: nav + botón "Crear nueva cancha" + FieldsTable
// Modales/dialogs se agregan en specs create, edit y delete
```

---

## 7. UX/UI — Especificaciones visuales

### 7.1 Expansión de sub-canchas

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ▶  Cancha Norte   | Atlántida | Completa | Sintético | 10 jug | 01/2025 │
└─────────────────────────────────────────────────────────────────────────┘
  ↓ Expandida:
┌─────────────────────────────────────────────────────────────────────────┐
│ ▼  Cancha Norte   | Atlántida | Completa | Sintético | 10 jug | 01/2025 │
├─────────────────────────────────────────────────────────────────────────┤
│     └─ Mitad A    |           | [Mitad A]| Sintético |  5 jug |         │ bg-muted/20
│     └─ Mitad B    |           | [Mitad B]| Sintético |  5 jug |         │ bg-muted/20
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tabla vacía

- Fila con `colSpan={8}`, texto `"No tenés canchas registradas."` centrado en `text-muted-foreground`

### 7.3 Sorting visual

- Header sortable: `cursor-pointer select-none`
- Indicadores: `↑` (asc) / `↓` (desc) añadidos al texto del header

---

## 8. Flujo completo E2E (List)

```
1. Usuario navega a /profile/fields
2. FieldsContainer renderiza — nav + FieldsTable
3. useFieldsTable inicializa: pageIndex=0, pageSize=10, sortBy='createdAt', desc=true, expandedIds={}
4. useFieldsList dispara query: orpc.getFieldsList.call(input)
5. Backend: WHERE fieldType='FULL' AND isActive=true AND complex.ownerId=userId AND complex.isActive=true
6. Retorna canchas FULL con subFields anidados + pagination
7. FieldsTable renderiza filas solo para canchas FULL
8. Si campo.subFields.length > 0: muestra ChevronRight → click togglea expandedIds
9. Al expandir: sub-filas se renderizan con bg-muted/20 debajo del padre
10. Click "Editar" en fila o sub-fila → handleEditField(id)
11. Click "Eliminar" en fila o sub-fila → handleDeleteField(id, title)
```

---

## 9. Orden de implementación

| #   | Tarea                                                                        | Archivo(s)                              | Estado |
| --- | ---------------------------------------------------------------------------- | --------------------------------------- | ------ |
| 1   | `SubFieldsTableResponseSchema` + `FieldsTableResponseSchema` con `subFields` | `src/orpc/schemas/field.ts`             | ✅     |
| 2   | Tipos TypeScript                                                             | `src/types/field.ts`                    | ✅     |
| 3   | `getFieldsList` paginado + filtro FULL + subFields                           | `src/orpc/router/field.ts`              | ✅     |
| 4   | Registrar en router                                                          | `src/orpc/router/index.ts`              | ✅     |
| 5   | `useFieldsList` hook                                                         | `src/data/field/get-fields.ts`          | ✅     |
| 6   | `useFieldsTable` con `expandedIds` y `toggleExpand`                          | `src/components/profile/tables/fields/` | ✅     |
| 7   | `fieldsTable.tsx` custom con sub-filas expandibles                           | `src/components/profile/tables/fields/` | ✅     |
| 8   | `fieldsContainer.tsx` funcional                                              | `src/components/profile/general/`       | ✅     |

---

## 10. Fuera de alcance (v2+)

- Filtros en la tabla (por complejo, tipo, superficie)
- Vista de detalle de cancha
- Búsqueda por nombre
- Bulk actions
