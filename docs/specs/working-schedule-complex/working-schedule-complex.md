# SPEC: Horarios de Complejo (ComplexWorkingSchedule)

**Status:** Draft
**Fecha:** 2026-04-13
**Rama sugerida:** `feature/working-schedule-complex`
**Alcance:** DB + API (ORPC) + UI (wizard step + price slot por cancha).

---

## 1. Resumen

Los horarios operativos de un complejo deportivo son uniformes para todas sus canchas: si el complejo abre a las 08:00 y cierra a las 22:00 los lunes, todas las canchas tienen esa disponibilidad horaria. Lo que varía por cancha es el **precio por tramo horario**, dado que una cancha de pádel sobre cemento tiene una tarifa distinta a una cancha de fútbol con césped natural con iluminación.

Este spec introduce:

1. Un nuevo modelo `ComplexWorkingSchedule` (7 entradas por complejo, una por día de la semana) definido **durante la creación del complejo**.
2. Propagación automática a `FieldWorkingSchedule` al crear una cancha dentro de ese complejo.
3. Configuración de `PriceSlot` por cancha, separada del flujo de horarios.
4. Un endpoint `updateComplexSchedule` para actualizar horarios del complejo y propagar a canchas.

---

## 2. Contexto del modelo actual

### 2.1 Lo que ya existe

| Modelo                 | Descripción                                            | Relación                          |
| ---------------------- | ------------------------------------------------------ | --------------------------------- |
| `Complex`              | Entidad raíz con `timezone` (IANA string) y `currency` | `fields[]`, sin schedules propios |
| `Field`                | Cancha individual o mitad (`FULL`, `HALF_A`, `HALF_B`) | `fieldWorkingSchedules[]`         |
| `FieldWorkingSchedule` | Horario por día para una cancha específica             | `priceSlots[]`, `field`           |
| `PriceSlot`            | Tramo de precio dentro de un schedule                  | `schedule` (FieldWorkingSchedule) |

### 2.2 El problema actual

`FieldWorkingSchedule` actualmente se crea manualmente por cancha. No existe un mecanismo de definición de horarios a nivel complejo, lo que genera:

- Repetición manual del mismo horario para cada cancha del complejo.
- Riesgo de inconsistencia (cancha A abre a las 08:00, cancha B a las 09:00 sin intención).
- No hay UI para configurar horarios en el wizard de creación de complejo.

### 2.3 Lo que permanece igual

- El handler `addBooking` lee `field.fieldWorkingSchedules` — **sin cambios**.
- La resolución de precio usa `PriceSlot` por `FieldWorkingSchedule` — **sin cambios**.
- Los timestamps de `Booking` se almacenan en UTC; la conversión local usa `Complex.timezone` — **sin cambios**.
- El modelo `FieldWorkingSchedule` y sus índices permanecen intactos.

---

## 3. Decisiones de diseño

| Decisión                        | Elección                                                                                                                   | Razón                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Nivel de horarios               | Complejo (nuevo modelo `ComplexWorkingSchedule`)                                                                           | Semánticamente correcto: el complejo define cuándo opera; las canchas heredan eso        |
| Nivel de precios                | Cancha (`PriceSlot` en `FieldWorkingSchedule`)                                                                             | Distintos deportes, superficies e iluminación generan tarifas distintas por cancha       |
| Granularidad                    | 7 registros obligatorios (uno por día), con `isWorking=false` para días no operativos                                      | Simple, exhaustivo, sin lógica de "rangos de días"                                       |
| Override por cancha             | No soportado en v1                                                                                                         | Añade complejidad sin caso de uso definido; se puede agregar en v2                       |
| Propagación al actualizar       | Sí: actualizar complejo propaga `openTime`/`closeTime`/`isWorking` a todos los `FieldWorkingSchedule` activos              | Evita divergencia silenciosa; los `PriceSlot` NO se tocan                                |
| Propagación parcial             | Si un field ya tiene `PriceSlot` en un tramo que queda fuera del nuevo horario, se registra advertencia pero no se bloquea | No destruye precios configurados; el dueño debe revisar                                  |
| Al crear cancha                 | Auto-generar `FieldWorkingSchedule` desde `ComplexWorkingSchedule` del complejo                                            | El dueño ya definió los horarios; crear la cancha sin schedules sería un estado inválido |
| PriceSlot en creación de cancha | No se crean automáticamente                                                                                                | Sin precios predeterminados: cada cancha tiene su tarifa propia                          |
| Wizard de complejo              | Agregar paso 5 "Horarios" al wizard existente de 4 pasos                                                                   | Es el momento correcto: sin horarios no tiene sentido operar canchas                     |
| Inmutabilidad de estructura     | `ComplexWorkingSchedule` no usa `effectiveFrom`/`effectiveTo` en v1                                                        | Reduce complejidad; versioning de horarios es v2                                         |

---

## 4. Cambios en la base de datos

### 4.1 Nuevo modelo: `ComplexWorkingSchedule`

```prisma
model ComplexWorkingSchedule {
  id        String    @id @default(cuid())
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  dayOfWeek DayOfWeek
  isWorking Boolean   @default(true)

  /// Horario en timezone LOCAL del complejo (string HH:MM, e.g. "08:00")
  openTime  String    @db.VarChar(5)
  /// Horario en timezone LOCAL del complejo (string HH:MM, e.g. "22:00")
  closeTime String    @db.VarChar(5)

  complex   Complex   @relation(fields: [complexId], references: [id], onDelete: Cascade)
  complexId String

  @@unique([complexId, dayOfWeek])
  @@index([complexId])
}
```

**Notas:**

- `openTime`/`closeTime` son strings `HH:MM` en el timezone local del complejo, consistente con `FieldWorkingSchedule.openTime`/`closeTime` y ADR-008.
- `@@unique([complexId, dayOfWeek])` garantiza exactamente una entrada por día por complejo.
- `onDelete: Cascade` — al eliminar el complejo se eliminan sus schedules.
- No tiene `PriceSlot` — los precios son exclusivamente por cancha.

### 4.2 Modificación: `Complex`

Agregar relación inversa:

```prisma
model Complex {
  // ... campos existentes ...
  complexWorkingSchedules ComplexWorkingSchedule[]
}
```

### 4.3 Sin cambios en `FieldWorkingSchedule` ni `PriceSlot`

El booking handler (`addBooking`) continúa leyendo `field.fieldWorkingSchedules` sin modificaciones.

### 4.4 Migración

- Migración aditiva — no altera datos existentes.
- Los `Field` ya existentes con `FieldWorkingSchedule` no se ven afectados.
- Los `Complex` existentes quedarán sin `ComplexWorkingSchedule` hasta que el dueño los configure (estado válido en v1 — el wizard de edición lo puede cubrir).
- Ejecutar `pnpm db:generate` después de aplicar la migración.

---

## 5. Schemas Zod

### 5.1 Nuevo: `ComplexWorkingScheduleInputSchema` (`src/orpc/schemas/complex.ts`)

```typescript
// Validación de formato HH:MM
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

export const ComplexWorkingScheduleInputSchema = z
  .object({
    dayOfWeek: z.enum(DAY_OF_WEEK_VALUES), // ['MONDAY', 'TUESDAY', ...]
    isWorking: z.boolean(),
    openTime: z.string().regex(timeRegex, 'Formato HH:MM requerido'),
    closeTime: z.string().regex(timeRegex, 'Formato HH:MM requerido'),
  })
  .refine(
    (data) => {
      if (!data.isWorking) return true // días no operativos no validan horarios
      const [openH, openM] = data.openTime.split(':').map(Number)
      const [closeH, closeM] = data.closeTime.split(':').map(Number)
      return openH * 60 + openM < closeH * 60 + closeM
    },
    {
      message: 'El horario de apertura debe ser anterior al de cierre',
      path: ['openTime'],
    },
  )
```

### 5.2 Nuevo: `ComplexWorkingScheduleSchema` (respuesta)

```typescript
export const ComplexWorkingScheduleSchema = z.object({
  id: z.cuid(),
  dayOfWeek: z.enum(DAY_OF_WEEK_VALUES),
  isWorking: z.boolean(),
  openTime: z.string(),
  closeTime: z.string(),
})
```

### 5.3 Actualización: `CreateComplexInputSchema`

Agregar campo obligatorio `workingSchedules`:

```typescript
export const CreateComplexInputSchema = z.object({
  // ... campos existentes ...
  workingSchedules: z
    .array(ComplexWorkingScheduleInputSchema)
    .length(7, 'Se deben definir los 7 días de la semana')
    .refine(
      (schedules) => {
        const days = schedules.map((s) => s.dayOfWeek)
        const allDays: DayOfWeek[] = [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ]
        return allDays.every((d) => days.includes(d))
      },
      {
        message: 'Deben estar presentes los 7 días de la semana (sin repetir)',
      },
    ),
})
```

### 5.4 Actualización: `CreateComplexFormSchema`

El form usa los mismos 7 días. El campo en el form tiene el mismo shape que `CreateComplexInputSchema.workingSchedules` — no requiere transformación.

### 5.5 Actualización: `ComplexByIdResponseSchema`

```typescript
export const ComplexByIdResponseSchema = ComplexSchema.extend({
  // ... campos existentes ...
  complexWorkingSchedules: z.array(ComplexWorkingScheduleSchema),
})
```

### 5.6 Nuevo: `UpdateComplexScheduleInputSchema`

```typescript
export const UpdateComplexScheduleInputSchema = z.object({
  complexId: z.cuid(),
  workingSchedules: z
    .array(ComplexWorkingScheduleInputSchema)
    .length(7)
    .refine(/* misma validación de 7 días únicos */),
})
```

---

## 6. ORPC — Cambios en handlers

### 6.1 `createComplex` (modificar — `src/orpc/router/complex.ts`)

Dentro de la transacción existente, después de crear el `Complex`:

```typescript
// Crear los 7 registros de ComplexWorkingSchedule
await tx.complexWorkingSchedule.createMany({
  data: input.workingSchedules.map((schedule) => ({
    complexId: complex.id,
    dayOfWeek: schedule.dayOfWeek,
    isWorking: schedule.isWorking,
    openTime: schedule.openTime,
    closeTime: schedule.closeTime,
  })),
})
```

**Nota:** Los `FieldWorkingSchedule` se crean en `createField` — no aquí, porque al crear el complejo aún no hay canchas.

### 6.2 `createField` (modificar — `src/orpc/router/field.ts`)

Después de crear el `Field` (y los sub-fields si `isDividable=true`), dentro de la misma transacción, generar `FieldWorkingSchedule` para cada field creado:

```typescript
// 1. Leer ComplexWorkingSchedule del complejo padre
const complexSchedules = await tx.complexWorkingSchedule.findMany({
  where: { complexId: input.complexId },
})

if (complexSchedules.length === 0) {
  throw errors.BAD_REQUEST({
    message:
      'El complejo no tiene horarios configurados. Configura los horarios antes de agregar canchas.',
  })
}

// 2. Crear FieldWorkingSchedule para cada field (FULL y sub-fields si aplica)
const fieldIds = [field.id, ...subFields.map((sf) => sf.id)] // subFields = [] si !isDividable

for (const fieldId of fieldIds) {
  await tx.fieldWorkingSchedule.createMany({
    data: complexSchedules.map((cs) => ({
      fieldId,
      dayOfWeek: cs.dayOfWeek,
      isWorking: cs.isWorking,
      openTime: cs.openTime,
      closeTime: cs.closeTime,
      effectiveFrom: new Date(),
      isActive: true,
    })),
  })
}
```

**Invariante:** Un `Field` creado en este sistema siempre tendrá exactamente 7 `FieldWorkingSchedule` (uno por día), sin `PriceSlot` inicialmente.

### 6.3 Nuevo endpoint: `updateComplexSchedule`

```typescript
// Input: UpdateComplexScheduleInputSchema
// Middleware: authorizedMiddleware
// Ownership check: complex.ownerId === context.user.id
```

Lógica:

1. Verificar ownership del complejo.
2. Dentro de `$transaction`:
   a. Hacer `upsert` de los 7 `ComplexWorkingSchedule`.
   b. Para cada `Field` activo del complejo (`isActive=true`), hacer `updateMany` en sus `FieldWorkingSchedule` activos — actualizar solo `openTime`, `closeTime`, `isWorking`.
   c. **No tocar `PriceSlot`** — los precios ya configurados se respetan.
3. Retornar el complejo actualizado con schedules.

**Advertencia de precios fuera de rango:** Si al reducir un horario algún `PriceSlot` queda con `startTime` o `endTime` fuera del nuevo rango, el endpoint **no falla** pero incluye en la respuesta un campo `warnings: string[]` listando las canchas afectadas. El owner deberá revisar y ajustar los price slots manualmente.

```typescript
// Detección de price slots fuera de rango (solo cuando isWorking cambia a false o se reduce horario)
const affectedFields: string[] = []
for (const updatedSchedule of input.workingSchedules) {
  if (!updatedSchedule.isWorking) {
    const affected = await tx.priceSlot.findMany({
      where: {
        schedule: {
          field: { complexId: input.complexId },
          dayOfWeek: updatedSchedule.dayOfWeek,
          isActive: true,
        },
      },
      include: {
        schedule: { include: { field: { select: { title: true } } } },
      },
    })
    affectedFields.push(...affected.map((ps) => ps.schedule.field.title))
  }
  // Similar para horario reducido (openTime posterior o closeTime anterior)
}
```

### 6.4 `getComplexById` (modificar — `src/orpc/router/complex.ts`)

Incluir `complexWorkingSchedules` en el select:

```typescript
complexWorkingSchedules: {
  orderBy: { dayOfWeek: 'asc' },
}
```

**Nota sobre orden de `dayOfWeek`:** El enum de Prisma es alfabético; para orden lunes-domingo usar un sort en aplicación o mapear a número mediante `DAY_OF_WEEK_VALUES`.

---

## 7. Tipos TypeScript

Todos los tipos se derivan de schemas Zod con `z.infer<>` (regla del proyecto):

```typescript
// src/types/complex.ts
export type ComplexWorkingScheduleInputType = z.infer<
  typeof ComplexWorkingScheduleInputSchema
>
export type ComplexWorkingScheduleType = z.infer<
  typeof ComplexWorkingScheduleSchema
>
export type UpdateComplexScheduleInputType = z.infer<
  typeof UpdateComplexScheduleInputSchema
>

// Actualizar CreateComplexFormType para incluir:
// workingSchedules: ComplexWorkingScheduleInputType[]
```

---

## 8. Config — Constantes nuevas

### 8.1 `src/config/complexes.ts`

```typescript
// Orden de visualización de días (lunes primero — convención argentina)
export const DAY_OF_WEEK_DISPLAY_ORDER: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
}

// Valores default para el paso de horarios del wizard
export const DEFAULT_WORKING_SCHEDULE: ComplexWorkingScheduleInputType[] = [
  {
    dayOfWeek: 'MONDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'TUESDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'WEDNESDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'THURSDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'FRIDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'SATURDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'SUNDAY',
    isWorking: false,
    openTime: '08:00',
    closeTime: '22:00',
  },
]

// Actualizar CREATE_COMPLEX_FORM_STEPS — agregar paso 5
// { id: 'schedule', title: 'Horarios', description: 'Días y horarios de operación', fields: ['workingSchedules'] }
```

### 8.2 `CREATE_COMPLEX_FORM_DEFAULT_VALUES`

Agregar `workingSchedules: DEFAULT_WORKING_SCHEDULE`.

---

## 9. UI — Arquitectura de componentes

### 9.1 Paso nuevo en el wizard: "Horarios" (paso 5)

El wizard de creación de complejo pasa de 4 a 5 pasos:

```
Paso 1: Información básica
Paso 2: Dirección y ubicación
Paso 3: Contacto y redes
Paso 4: Amenidades
Paso 5: Horarios  ← NUEVO
```

**Componente principal:** `complexFormScheduleFields.tsx` (presentational)

Renderiza una tabla/lista con 7 filas (una por día), cada fila con:

- Toggle `isWorking` (Switch de Shadcn)
- `openTime` (Select o input de hora — deshabilitado si `!isWorking`)
- `closeTime` (Select o input de hora — deshabilitado si `!isWorking`)

**Notas de UX:**

- Valores default: lunes-sábado operativos (08:00-22:00), domingo no operativo.
- Al deshabilitar un día, `openTime`/`closeTime` se ocultan visualmente pero siguen en el form state (evita reset al re-habilitar).
- Error inline por fila si `openTime >= closeTime`.
- El paso no es omitible — es obligatorio para crear el complejo.

### 9.2 Configuración de PriceSlot por cancha (flujo separado)

Los price slots se configuran en el flujo de **edición de cancha**, no durante la creación del complejo ni de la cancha. Esto evita sobrecargar el wizard de creación.

**Componente sugerido:** `fieldPriceSlotForm.tsx` — modal o sección en la vista de detalle de cancha.

Cada `PriceSlot` requiere:

- `startTime` (HH:MM) — hora de inicio del tramo
- `endTime` (HH:MM) — hora de fin del tramo
- `hourlyRate` (number, precisión Decimal en backend) — tarifa por hora en la moneda del complejo

**Validaciones UI:**

- Tramos no deben solaparse dentro del mismo schedule.
- `startTime` y `endTime` deben estar dentro del `openTime`/`closeTime` del día correspondiente.
- `hourlyRate > 0`.

**Endpoint necesario:** `addPriceSlot` / `updatePriceSlot` / `deletePriceSlot` (a definir en spec separada).

### 9.3 Data hook nuevo

```typescript
// src/data/complex/update-complex-schedule.ts
export const useUpdateComplexSchedule = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateComplexScheduleInputType) =>
      orpc.complex.updateComplexSchedule.call(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['complex', variables.complexId],
      })
    },
  })
}
```

---

## 10. Orden de implementación

```
1. DB
   └── Agregar modelo ComplexWorkingSchedule en prisma/schema.prisma
   └── Agregar relación inversa en Complex
   └── pnpm db:generate
   └── Crear migración con db-migration skill

2. Schemas & Types
   └── ComplexWorkingScheduleInputSchema
   └── ComplexWorkingScheduleSchema
   └── UpdateComplexScheduleInputSchema
   └── Actualizar CreateComplexInputSchema (campo workingSchedules obligatorio)
   └── Actualizar ComplexByIdResponseSchema
   └── Actualizar src/types/complex.ts

3. Config
   └── DAY_OF_WEEK_DISPLAY_ORDER, DAY_OF_WEEK_LABELS
   └── DEFAULT_WORKING_SCHEDULE
   └── Agregar paso 5 en CREATE_COMPLEX_FORM_STEPS
   └── Actualizar CREATE_COMPLEX_FORM_DEFAULT_VALUES

4. Backend ORPC
   └── Modificar createComplex — crear ComplexWorkingSchedule en transacción
   └── Modificar createField — auto-generar FieldWorkingSchedule desde ComplexWorkingSchedule
   └── Agregar updateComplexSchedule handler
   └── Modificar getComplexById — incluir complexWorkingSchedules en select
   └── Registrar updateComplexSchedule en router/index.ts

5. Frontend
   └── complexFormScheduleFields.tsx (presentational — tabla de 7 días)
   └── Paso 5 en complexForm.tsx / complexFormFields.tsx
   └── Actualizar CREATE_COMPLEX_FORM_STEPS en config
   └── useUpdateComplexSchedule hook
   └── Mostrar schedules en ComplexDetailModal o vista de detalle

6. Tests
   └── createComplex — verifica que crea 7 ComplexWorkingSchedule
   └── createField — verifica que genera 7 FieldWorkingSchedule desde complejo
   └── createField sin schedules — verifica que lanza BAD_REQUEST
   └── updateComplexSchedule — propaga a field schedules sin tocar PriceSlot
   └── updateComplexSchedule — detecta PriceSlot fuera de rango (warnings)
   └── Validación Zod — openTime >= closeTime falla cuando isWorking=true
   └── Validación Zod — menos de 7 días falla
   └── Validación Zod — días duplicados fallan

7. Security review
   └── Verificar ownership check en updateComplexSchedule
   └── Verificar que solo el owner puede actualizar schedules del complejo
```

---

## 11. Consideraciones adicionales

### 11.1 Compatibilidad con el booking handler

El handler `addBooking` en `src/orpc/router/booking.ts` lee `field.fieldWorkingSchedules` — no requiere cambios. La propagación de `ComplexWorkingSchedule` a `FieldWorkingSchedule` es transparente.

### 11.2 Campos divididos (HALF_A / HALF_B)

Al crear un `Field` con `isDividable=true`, se crean FULL + HALF_A + HALF_B (ADR-012). Los 3 fields deben recibir `FieldWorkingSchedule` generados desde el complejo. El loop en `createField` debe iterar sobre `[field.id, subFieldA.id, subFieldB.id]`.

### 11.3 `effectiveFrom` / `effectiveTo` en `FieldWorkingSchedule`

Estos campos existen en el schema pero no se usan en el booking handler (hay un TODO en `complex.ts` router). Al crear `FieldWorkingSchedule` desde complejo:

- `effectiveFrom = new Date()` (ahora)
- `effectiveTo = null` (vigente indefinidamente)

Esto es consistente con el comportamiento actual del handler.

### 11.4 Complexes existentes sin `ComplexWorkingSchedule`

Los complexes creados antes de este feature no tendrán `ComplexWorkingSchedule`. En el endpoint `createField`, si no hay schedules configurados se lanza `BAD_REQUEST` con mensaje claro. La UI de edición de complejo debe guiar al owner a configurarlos.

En la vista de detalle del complejo existente, mostrar un banner de advertencia si `complexWorkingSchedules.length === 0`.

### 11.5 Timezone

`ComplexWorkingSchedule.openTime`/`closeTime` siguen la misma convención que `FieldWorkingSchedule`: strings `HH:MM` en el **timezone local del complejo** (`Complex.timezone`). El frontend no necesita conversión para mostrarlos al owner.

### 11.6 `PriceSlot.hourlyRate` — tipo en schema vs handler

El campo `PriceSlot.hourlyRate` es `Float` en Prisma (no `Decimal`). En el booking handler se convierte a `Decimal` al iniciar el cálculo: `new Decimal(priceSlot.hourlyRate)`. Este comportamiento no cambia.

### 11.7 Fuera de alcance en v1

- Override de horario por cancha individual (campo puede tener horario distinto al complejo)
- Versioning temporal de horarios (`effectiveFrom`/`effectiveTo` en `ComplexWorkingSchedule`)
- Horarios especiales por fechas (feriados, eventos)
- Herencia de price slots desde una cancha plantilla
- Bulk update de price slots para todas las canchas del complejo

---

## 12. Filtrado de complejos sin canchas activas en el mapa público

### 12.1 Requisito

Los complejos que no tengan al menos una `Field` activa (`isActive = true`) **no deben aparecer** en el mapa público de complejos. Un complejo sin canchas no es reservable y tampoco tendrá horarios operativos útiles para el usuario final — por coherencia con este spec (que hace que los horarios del complejo sean la base de los horarios de las canchas), también se excluyen del listado del mapa.

### 12.2 Dónde se aplica

- **Handler afectado:** `getComplexesMapList` en `src/orpc/router/complex.ts` — es el endpoint que alimenta el mapa público de complejos (consumido desde `src/data/complex/get-complexes.ts`).
- **Capa:** Backend exclusivamente. El filtrado se aplica en la query Prisma, no en el frontend. Esto evita transferir complejos que luego serán descartados por el cliente y mantiene la lógica de visibilidad centralizada en el servidor.

### 12.3 Cambio en la query

Se agrega a la cláusula `where` existente una condición de relación anidada:

```typescript
const complexes = await prisma.complex.findMany({
  where: {
    isActive: true,
    fields: {
      some: { isActive: true },
    },
  },
  select: {
    id: true,
    title: true,
    latitude: true,
    longitude: true,
  },
})
```

**Notas:**

- `fields: { some: { isActive: true } }` — Prisma traduce esto a un `EXISTS` en SQL, lo que es eficiente y aprovecha el índice `@@index([complexId, isActive])` existente en el modelo `Field`.
- El contrato de tipos (`ComplexListResponseSchema`) no cambia — solo se filtra qué filas se devuelven.
- No se requiere migración de base de datos.
- No se requiere cambio en `getMyComplexesList` (vista interna del owner — debe seguir viendo todos sus complejos, incluso sin canchas, para poder gestionarlos).

### 12.4 Tests

- Verificar que un complejo sin canchas no aparece en la respuesta de `getComplexesMapList`.
- Verificar que un complejo con al menos una cancha activa aparece.
- Verificar que un complejo con canchas pero todas con `isActive=false` no aparece.
- Verificar que `getMyComplexesList` sigue devolviendo complejos sin canchas para el owner.
