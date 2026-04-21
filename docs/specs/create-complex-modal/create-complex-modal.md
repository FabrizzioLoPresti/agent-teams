# SPEC: Modal de Creación de Complejo Deportivo

**Status:** Implemented — v1.1
**Fecha:** 2026-03-26 · Revisado: 2026-03-27
**Ubicación:** `/profile/complexes`
**Alcance:** Creación de complejo (sin canchas — flujo separado). Sin upload de imágenes (v1).

---

## 1. Resumen

Implementar un modal multi-step (wizard) en la página `/profile/complexes` que permita a usuarios autenticados crear un nuevo complejo deportivo. El modal se abre desde el botón "Crear nuevo complejo" existente en `complexesContainer.tsx` y guía al usuario a través de 4 pasos:

1. **Información básica** — título, descripción, timezone, moneda, política de cancelación
2. **Dirección y ubicación** — autocompletado de dirección con Nominatim (debounced) que completa los campos y captura lat/lng automáticamente
3. **Contacto y redes sociales** — teléfono, website, redes sociales
4. **Amenidades** — selección múltiple de features del complejo

---

## 2. Decisiones de diseño

| Decisión              | Elección                                                     | Razón                                                                                                                      |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Patrón del formulario | Multi-step wizard con indicador de progreso                  | UX: reduce carga cognitiva al dividir campos en pasos lógicos                                                              |
| Geocodificación       | Nominatim (OpenStreetMap) — API gratuita, sin key            | No existe servicio de geocodificación en el proyecto; Nominatim es gratuito y cumple                                       |
| UX de dirección       | Autocompletado con debounce (500ms) en lugar de botón manual | El owner del complejo no debe manejar coordenadas ni presionar botones para geocodificar — el input sugiere en tiempo real |
| Coordenadas visibles  | Ocultas al usuario (campos `hidden`)                         | lat/lng son datos técnicos irrelevantes para el owner; la confirmación es visual (badge con dirección)                     |
| Imágenes              | Omitidas en v1                                               | No existe infraestructura de upload; se añadirá en una iteración posterior                                                 |
| Canchas (Fields)      | Flujo separado posterior                                     | Reduce complejidad del modal; las canchas tienen su propio dominio (schedules, prices)                                     |
| Estado del modal      | `useState` en `complexesContainer.tsx`                       | Consistente con el patrón actual de `ComplexDetailModal` (no URL-driven)                                                   |
| Tags                  | Omitidos en v1                                               | El sistema de tags no tiene UI de gestión; se añadirá cuando exista un CRUD de tags                                        |

---

## 3. Arquitectura de archivos

### 3.1 Archivos nuevos a crear

```
src/
├── config/
│   └── complexes.ts                          # Constantes: COMPLEX_FEATURE_MAP, COMPLEX_FEATURE_VALUES, TIMEZONE_MAP, etc.
├── data/
│   └── complex/
│       └── add-complex.ts                    # Hook: useAddComplex (mutation)
└── lib/
    └── geocoding/
        └── nominatim.ts                      # Servicio de geocodificación con Nominatim
```

### 3.2 Archivos existentes a modificar

| Archivo                                                 | Cambio                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/orpc/schemas/complex.ts`                           | Agregar `CreateComplexFormSchema`, `CreateComplexInputSchema`, `CreateComplexResponseSchema` |
| `src/orpc/router/complex.ts`                            | Agregar procedimiento `createComplex`                                                        |
| `src/orpc/router/index.ts`                              | Registrar `createComplex` en el router                                                       |
| `src/types/complex.ts`                                  | Agregar tipos inferidos del nuevo schema                                                     |
| `src/components/profile/general/complexesContainer.tsx` | Conectar botón + estado del modal de creación                                                |
| `src/components/profile/modals/complexModal.tsx`        | Implementar modal wrapper (actualmente stub)                                                 |
| `src/components/profile/forms/complexForm.tsx`          | Implementar form container (actualmente vacío)                                               |
| `src/components/profile/forms/complexFormFields.tsx`    | Implementar form fields (actualmente vacío)                                                  |

---

## 4. Backend — ORPC

### 4.1 Constantes nuevas (`src/config/complexes.ts`)

```typescript
export const COMPLEX_FEATURE_MAP = [
  { value: 'PARKING', label: 'Estacionamiento' },
  { value: 'RESTROOMS', label: 'Baños' },
  { value: 'SHOWERS', label: 'Duchas' },
  { value: 'LOCKER_ROOMS', label: 'Vestuarios' },
  { value: 'BARBECUE_AREA', label: 'Área de asadores' },
  { value: 'RESTAURANT', label: 'Restaurante' },
  { value: 'CAFETERIA', label: 'Cafetería' },
  { value: 'FIRST_AID', label: 'Primeros auxilios' },
  { value: 'SECURITY_SERVICE', label: 'Servicio de seguridad' },
  { value: 'WIFI', label: 'Wi-Fi gratuito' },
  { value: 'AIR_CONDITIONING', label: 'Aire acondicionado' },
  { value: 'EQUIPMENT_RENTAL', label: 'Alquiler de equipos' },
] as const

export const COMPLEX_FEATURE_VALUES = [
  'PARKING',
  'RESTROOMS',
  'SHOWERS',
  'LOCKER_ROOMS',
  'BARBECUE_AREA',
  'RESTAURANT',
  'CAFETERIA',
  'FIRST_AID',
  'SECURITY_SERVICE',
  'WIFI',
  'AIR_CONDITIONING',
  'EQUIPMENT_RENTAL',
] as const

export const TIMEZONE_MAP = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Argentina/Cordoba', label: 'Córdoba (GMT-3)' },
  { value: 'America/Argentina/Mendoza', label: 'Mendoza (GMT-3)' },
] as const

export const TIMEZONE_VALUES = [
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Mendoza',
] as const

export const COUNTRY_MAP = [{ value: 'AR', label: 'Argentina' }] as const

export const COUNTRY_VALUES = ['AR'] as const
```

**Nota:** Las monedas se reutilizan desde `src/config/bookings.ts` (`BOOKING_CURRENCY_MAP`, `BOOKING_CURRENCY_VALUES`).

### 4.2 Schemas Zod (`src/orpc/schemas/complex.ts` — agregar al final del archivo)

**Schema del formulario UI** (estructura plana, para react-hook-form):

```typescript
export const CreateComplexFormSchema = z.object({
  // Step 1: Información básica
  title: z
    .string()
    .min(3, 'El título debe tener al menos 3 caracteres.')
    .max(255, 'El título no puede superar los 255 caracteres.'),
  description: z
    .string()
    .min(10, 'La descripción debe tener al menos 10 caracteres.')
    .max(2000, 'La descripción no puede superar los 2000 caracteres.'),
  timezone: z.enum(TIMEZONE_VALUES, {
    errorMap: () => ({ message: 'Seleccioná una zona horaria válida.' }),
  }),
  currency: z.enum(BOOKING_CURRENCY_VALUES, {
    errorMap: () => ({ message: 'Seleccioná una moneda válida.' }),
  }),
  cancellationPolicy: z
    .string()
    .min(5, 'La política de cancelación debe tener al menos 5 caracteres.')
    .max(
      255,
      'La política de cancelación no puede superar los 255 caracteres.',
    ),

  // Step 2: Dirección y ubicación
  street: z
    .string()
    .min(3, 'La dirección debe tener al menos 3 caracteres.')
    .max(255),
  city: z
    .string()
    .min(2, 'La ciudad debe tener al menos 2 caracteres.')
    .max(100),
  state: z
    .string()
    .min(2, 'La provincia debe tener al menos 2 caracteres.')
    .max(100),
  country: z.enum(COUNTRY_VALUES, {
    errorMap: () => ({ message: 'Seleccioná un país válido.' }),
  }),
  zip: z.string().max(20).optional().or(z.literal('')),
  latitude: z
    .number({ required_error: 'Seleccioná una ubicación en el mapa.' })
    .min(-90)
    .max(90),
  longitude: z
    .number({ required_error: 'Seleccioná una ubicación en el mapa.' })
    .min(-180)
    .max(180),

  // Step 3: Contacto y redes sociales
  phone: z
    .string()
    .min(8, 'El teléfono debe tener al menos 8 caracteres.')
    .max(20, 'El teléfono no puede superar los 20 caracteres.'),
  website: z
    .string()
    .url('URL inválida.')
    .max(100)
    .optional()
    .or(z.literal('')),
  facebook: z
    .string()
    .url('URL inválida.')
    .max(100)
    .optional()
    .or(z.literal('')),
  twitter: z
    .string()
    .url('URL inválida.')
    .max(100)
    .optional()
    .or(z.literal('')),
  instagram: z
    .string()
    .url('URL inválida.')
    .max(100)
    .optional()
    .or(z.literal('')),
  youtube: z
    .string()
    .url('URL inválida.')
    .max(100)
    .optional()
    .or(z.literal('')),

  // Step 4: Amenidades/Features
  features: z.array(z.enum(COMPLEX_FEATURE_VALUES)).default([]),
})
```

**Schema de INPUT para el endpoint ORPC** (estructura anidada):

```typescript
export const CreateComplexInputSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(10).max(2000),
  timezone: z.enum(TIMEZONE_VALUES),
  currency: z.enum(BOOKING_CURRENCY_VALUES),
  cancellationPolicy: z.string().min(5).max(255),
  address: z.object({
    street: z.string().min(3).max(255),
    city: z.string().min(2).max(100),
    state: z.string().min(2).max(100),
    country: z.enum(COUNTRY_VALUES),
    zip: z.string().max(20).optional(),
  }),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  contact: z.object({
    phone: z.string().min(8).max(20),
    website: z.string().url().max(100).optional(),
    facebook: z.string().url().max(100).optional(),
    twitter: z.string().url().max(100).optional(),
    instagram: z.string().url().max(100).optional(),
    youtube: z.string().url().max(100).optional(),
  }),
  features: z.array(z.enum(COMPLEX_FEATURE_VALUES)).default([]),
})

export const CreateComplexResponseSchema = z.object({
  id: z.cuid(),
  title: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
})
```

**Nota de diseño:** Dos schemas separados (consistente con `AddBookingFormSchema` vs `CreateBookingInputSchema`):

- `CreateComplexFormSchema` — estructura plana para el UI (react-hook-form)
- `CreateComplexInputSchema` — estructura anidada para el endpoint ORPC (address/contact como objetos)

### 4.3 Tipos inferidos (`src/types/complex.ts` — agregar)

```typescript
export type CreateComplexFormType = z.infer<typeof CreateComplexFormSchema>
export type CreateComplexInputType = z.infer<typeof CreateComplexInputSchema>
export type CreateComplexResponseType = z.infer<
  typeof CreateComplexResponseSchema
>
```

### 4.4 Procedimiento ORPC (`src/orpc/router/complex.ts` — agregar al final)

```typescript
// ============================================================================
// CREATE COMPLEX
// ============================================================================
export const createComplex = authorizedMiddleware
  .input(CreateComplexInputSchema)
  .output(createApiResponseSchema(CreateComplexResponseSchema))
  .handler(async ({ input, errors, context }) => {
    const userId = context.user.id
    try {
      // Validar unicidad del título (el constraint @unique de Prisma daría un error genérico)
      const existing = await prisma.complex.findUnique({
        where: { title: input.title },
        select: { id: true },
      })
      if (existing) {
        throw errors.CONFLICT({
          message: 'Ya existe un complejo con ese nombre.',
        })
      }

      // Crear en transacción: address → contact → complex
      const complex = await prisma.$transaction(async (tx) => {
        const address = await tx.complexAddress.create({
          data: {
            street: input.address.street,
            city: input.address.city,
            state: input.address.state,
            country: input.address.country,
            zip: input.address.zip,
          },
        })

        const contact = await tx.complexContact.create({
          data: {
            phone: input.contact.phone,
            website: input.contact.website,
            facebook: input.contact.facebook,
            twitter: input.contact.twitter,
            instagram: input.contact.instagram,
            youtube: input.contact.youtube,
          },
        })

        return await tx.complex.create({
          data: {
            title: input.title,
            description: input.description,
            timezone: input.timezone,
            currency: input.currency,
            cancellationPolicy: input.cancellationPolicy,
            latitude: input.latitude,
            longitude: input.longitude,
            // GeoJSON Point: coordenadas en orden [lng, lat] (estándar GeoJSON RFC 7946)
            geojson: {
              type: 'Point',
              coordinates: [input.longitude, input.latitude],
            },
            features: input.features,
            ownerId: userId,
            complexAddressId: address.id,
            complexContactId: contact.id,
            isActive: true,
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
        message: 'Complejo creado exitosamente',
        status: 201,
        data: {
          id: complex.id,
          title: complex.title,
          isActive: complex.isActive,
          createdAt: complex.createdAt,
        },
      }
    } catch (error) {
      console.error('Error al crear complejo:', error)
      if (error instanceof ORPCError) throw error
      throw errors.BAD_REQUEST({
        message:
          error instanceof Error ? error.message : 'Error al crear complejo',
      })
    }
  })
```

### 4.5 Registro en router (`src/orpc/router/index.ts`)

```typescript
import { createComplex, ... } from './complex'

export default {
  // ... existentes sin cambios
  createComplex,
}
```

---

## 5. Servicio de geocodificación (`src/lib/geocoding/nominatim.ts`)

### Función exportada: `searchAddress(query: string)`

Reemplaza el enfoque anterior de campos separados por una **búsqueda de texto libre** más amigable:

```typescript
export interface GeocodingResult {
  latitude: number
  longitude: number
  displayName: string
  // Campos parseados para auto-rellenar el formulario
  street: string
  city: string
  state: string
  country: string
  zip: string
}

export async function searchAddress(query: string): Promise<GeocodingResult[]>
```

**Parámetros de la API:**

- `q`: texto libre ingresado por el usuario
- `format: json`
- `limit: 6`
- `addressdetails: 1` — activa el objeto `address` en la respuesta para parsear campos individuales
- `countrycodes: ar` — limita resultados a Argentina

**Validación de respuesta:** `Array.isArray()` + type guard por item + `isNaN()` filter en coordenadas.

**Consideraciones de implementación:**

- Se ejecuta **en el cliente** (Nominatim es API pública — sin backend requerido).
- Se usa con **debounce de 500ms** — no se llama en cada keystroke.
- Solo se activa cuando el query tiene **4+ caracteres** para evitar llamadas vacías.
- Limitado a Argentina (`countrycodes: ar`) — ampliar en v2 si el producto crece.

---

## 6. Frontend — Data Hook (`src/data/complex/add-complex.ts`)

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import { CreateComplexInputType } from '@/types/complex'

export const useAddComplex = () => {
  const queryClient = useQueryClient()

  const {
    mutate: addComplex,
    mutateAsync: addComplexAsync,
    data: addComplexData,
    isPending: isPendingAddComplex,
    isError: isErrorAddComplex,
    error: addComplexError,
    isSuccess: isSuccessAddComplex,
    status: addComplexStatus,
  } = useMutation({
    mutationFn: (input: CreateComplexInputType) =>
      orpc.createComplex.call(input),
    onSuccess: () => {
      // Refrescar tabla de complejos y mapa de búsqueda
      queryClient.invalidateQueries({ queryKey: ['complexesList'] })
      queryClient.invalidateQueries({ queryKey: ['complexesMapList'] })
    },
    onError: (error) => {
      console.error('Error creating complex:', JSON.stringify(error))
    },
  })

  return {
    addComplex,
    addComplexAsync,
    addComplexData,
    isPendingAddComplex,
    isErrorAddComplex,
    addComplexError,
    isSuccessAddComplex,
    addComplexStatus,
  }
}
```

---

## 7. Frontend — Componentes

### 7.1 `complexesContainer.tsx` — Cambios mínimos

Agregar estado `isCreateModalOpen` (separado del modal de detalle existente) y conectar el botón:

```typescript
// AGREGAR: Estado para modal de creación
const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

// MODIFICAR: Conectar botón al estado
<Button onClick={() => setIsCreateModalOpen(true)}>
  Crear nuevo complejo
</Button>

// AGREGAR: Renderizar ComplexModal
{isCreateModalOpen && (
  <ComplexModal
    isOpen={isCreateModalOpen}
    onClose={() => setIsCreateModalOpen(false)}
  />
)}
```

El modal de detalle existente (`ComplexDetailModal`) no cambia.

### 7.2 `complexModal.tsx` — Modal wrapper

Reemplaza el stub actual. Solo responsable de envolver `ComplexForm` en un `Dialog` de Shadcn:

```typescript
type ComplexModalProps = {
  isOpen: boolean
  onClose: () => void
}

const ComplexModal = ({ isOpen, onClose }: ComplexModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="z-50 bg-ac-dark-gray border-ac-dark-gray sm:max-w-[700px] max-h-[90vh] overflow-y-auto scrollbar-hide">
        <DialogHeader>
          <DialogTitle>Crear nuevo complejo</DialogTitle>
        </DialogHeader>
        <ComplexForm onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}
```

### 7.3 `complexForm.tsx` — Form container (wizard)

Responsabilidades:

1. Inicializar `useForm<CreateComplexFormType>` con `zodResolver(CreateComplexFormSchema)` y `defaultValues`
2. Manejar estado `currentStep: number` (0-3)
3. Validar campos del step actual con `form.trigger(STEPS[currentStep].fields)` antes de avanzar
4. En el último step, ejecutar `form.handleSubmit(onSubmit)`
5. Transformar la estructura plana del form a la estructura anidada del API en `onSubmit`
6. Llamar `addComplexAsync(apiInput)` y manejar success/error con `toast`
7. En success: cerrar modal, resetear form

**Definición de steps:**

```typescript
const STEPS = [
  {
    id: 'basic-info',
    title: 'Información básica',
    description: 'Datos generales del complejo',
    fields: [
      'title',
      'description',
      'timezone',
      'currency',
      'cancellationPolicy',
    ] as const,
  },
  {
    id: 'address',
    title: 'Dirección y ubicación',
    description: 'Ubicación geográfica del complejo',
    fields: [
      'street',
      'city',
      'state',
      'country',
      'zip',
      'latitude',
      'longitude',
    ] as const,
  },
  {
    id: 'contact',
    title: 'Contacto y redes',
    description: 'Información de contacto y redes sociales',
    fields: [
      'phone',
      'website',
      'facebook',
      'twitter',
      'instagram',
      'youtube',
    ] as const,
  },
  {
    id: 'features',
    title: 'Amenidades',
    description: 'Servicios y comodidades disponibles',
    fields: ['features'] as const,
  },
] as const
```

**Navegación entre steps:**

```typescript
const handleNext = async () => {
  const fieldsToValidate = STEPS[currentStep].fields
  const isValid = await form.trigger(fieldsToValidate)
  if (isValid) setCurrentStep((prev) => prev + 1)
}

const handleBack = () => {
  setCurrentStep((prev) => Math.max(0, prev - 1))
}
```

**Transformación form → API input en submit:**

```typescript
const onSubmit = async (data: CreateComplexFormType) => {
  const apiInput: CreateComplexInputType = {
    title: data.title,
    description: data.description,
    timezone: data.timezone,
    currency: data.currency,
    cancellationPolicy: data.cancellationPolicy,
    latitude: data.latitude,
    longitude: data.longitude,
    address: {
      street: data.street,
      city: data.city,
      state: data.state,
      country: data.country,
      zip: data.zip || undefined, // empty string → undefined
    },
    contact: {
      phone: data.phone,
      website: data.website || undefined,
      facebook: data.facebook || undefined,
      twitter: data.twitter || undefined,
      instagram: data.instagram || undefined,
      youtube: data.youtube || undefined,
    },
    features: data.features,
  }

  try {
    await addComplexAsync(apiInput)
    toast.success('Complejo creado exitosamente')
    form.reset()
    onClose()
  } catch {
    toast.error('Error al crear el complejo. Intentá nuevamente.')
  }
}
```

**Estructura del JSX:**

```
<Form {...form}>
  <form>
    <FormFields.StepProgress currentStep={currentStep} steps={STEPS} />

    {currentStep === 0 && <Step1BasicInfo control={form.control} />}
    {currentStep === 1 && <Step2Address control={form.control} form={form} />}
    {currentStep === 2 && <Step3Contact control={form.control} />}
    {currentStep === 3 && <Step4Features control={form.control} />}

    <FormFields.StepNavigationButtons
      currentStep={currentStep}
      totalSteps={STEPS.length}
      onBack={handleBack}
      onNext={handleNext}
      onSubmit={form.handleSubmit(onSubmit)}
      isLoading={isPendingAddComplex}
    />
  </form>
</Form>
```

### 7.4 `complexFormFields.tsx` — Campos del formulario

Namespace `FormFields` con todos los componentes de campo. Todos los componentes son genéricos `<T extends FieldValues>` y aceptan `BaseFieldProps<T>` de `src/types/forms.ts`.

**Componentes a implementar:**

```typescript
export const FormFields = {
  // Campos de texto básico (reutilizar patrón de bookingFormFields.tsx)
  TextField, // <Input> genérico

  // Campos de texto largo
  TextAreaField, // <Textarea> genérico

  // Select
  SelectField, // <Select> de Shadcn con opciones { value, label }[]

  // Campo URL con icono de red social
  UrlField, // <Input type="url"> con slot para icono izquierdo

  // Autocompletado de dirección (Step 2) — reemplaza GeocodingField
  AddressAutocompleteField, // Input libre + dropdown debounced + badge confirmación + hidden lat/lng

  // Grid de amenidades (Step 4)
  FeaturesCheckboxGrid, // Grid de Checkbox con iconos de getFeatureConfig()

  // Navegación del wizard
  StepNavigationButtons, // Anterior | Siguiente | Crear complejo (último step)

  // Indicador de progreso
  StepProgress, // Indicador visual de pasos con numeración y líneas
}
```

**Detalle de campos por step:**

#### Step 1 — Información básica

| Campo                | Componente      | Config de opciones                                                    |
| -------------------- | --------------- | --------------------------------------------------------------------- |
| `title`              | `TextField`     | label: "Nombre del complejo", placeholder: "Club Deportivo..."        |
| `description`        | `TextAreaField` | label: "Descripción", placeholder: "Describí el complejo...", rows: 4 |
| `timezone`           | `SelectField`   | label: "Zona horaria", opciones: `TIMEZONE_MAP`                       |
| `currency`           | `SelectField`   | label: "Moneda", opciones: `BOOKING_CURRENCY_MAP`                     |
| `cancellationPolicy` | `TextAreaField` | label: "Política de cancelación", rows: 3                             |

#### Step 2 — Dirección y ubicación

El step tiene dos secciones:

**Sección 1 — Búsqueda de dirección (`AddressAutocompleteField`)**

Input de texto libre que activa `searchAddress(query)` con debounce de 500ms cuando el usuario escribe 4+ caracteres. Los resultados aparecen como dropdown. Al seleccionar una sugerencia, el componente:

- Setea `latitude` y `longitude` en el form (campos ocultos)
- Rellena automáticamente `street`, `city`, `state`, `zip` en el form
- Muestra un badge de confirmación con la dirección completa y un botón X para limpiar

| Elemento              | Comportamiento                                                                                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input de búsqueda     | Visible solo cuando **no hay** dirección confirmada. Texto libre, placeholder: "Av. Colón 1234, Córdoba..."                                                                                                                        |
| Ícono izquierdo       | `Search` (normal) / `Loader2` (buscando)                                                                                                                                                                                           |
| Botón X derecho       | Limpia query, resultados y selección                                                                                                                                                                                               |
| Dropdown              | Aparece con 4+ chars, desaparece al seleccionar o click outside                                                                                                                                                                    |
| Badge de confirmación | **Reemplaza completamente al input** al confirmar. Borde `ac-lime/30`, fondo `ac-lime/10`, `MapPin` + texto corto (`street, city, state`) + botón X para cambiar. **No usa `displayName`** para evitar el texto largo de Nominatim |
| Campos lat/lng        | `<input type="hidden">` — el usuario nunca los ve                                                                                                                                                                                  |
| Error de ubicación    | Mensaje `text-destructive` si se intenta avanzar sin selección                                                                                                                                                                     |

> **Nota de implementación — control de overflow:**
>
> - Input y badge son **mutuamente excluyentes** — cuando `hasLocation && selected` es `true` el input desaparece y solo se muestra el badge.
> - El badge **no muestra `displayName`** (que es el texto técnico largo de Nominatim). En su lugar muestra `[street, city, state].filter(Boolean).join(', ')` — texto corto y legible como `"Paysandú 1051, Cordoba, Córdoba"`. El `displayName` queda como fallback solo si los tres campos están vacíos.
> - Esta es la solución definitiva al overflow: CSS no puede truncar de forma confiable un texto arbitrariamente largo en un contenedor con ancho relativo. La solución correcta es controlar la fuente del texto.

**Sección 2 — Campos de dirección editables (auto-rellenados, ajustables)**

Los campos se completan solos al seleccionar una sugerencia pero el usuario puede editarlos manualmente:

| Campo     | Componente    | Notas                                  |
| --------- | ------------- | -------------------------------------- |
| `street`  | `TextField`   | label: "Calle y número"                |
| `city`    | `TextField`   | label: "Ciudad"                        |
| `state`   | `TextField`   | label: "Provincia"                     |
| `country` | `SelectField` | label: "País", opciones: `COUNTRY_MAP` |
| `zip`     | `TextField`   | label: "Código postal (opcional)"      |

El `AddressAutocompleteField` interactúa con el form a través de `form.setValue` y `form.watch`. Recibe el objeto `form` completo como prop (específico de `CreateComplexFormType`).

#### Step 3 — Contacto y redes sociales

| Campo       | Componente  | Icono                                      |
| ----------- | ----------- | ------------------------------------------ |
| `phone`     | `TextField` | `Phone` (lucide)                           |
| `website`   | `UrlField`  | `Globe` (lucide)                           |
| `facebook`  | `UrlField`  | `FacebookIcon` de `src/components/icons/`  |
| `twitter`   | `UrlField`  | `TwitterIcon` de `src/components/icons/`   |
| `instagram` | `UrlField`  | `InstagramIcon` de `src/components/icons/` |
| `youtube`   | `UrlField`  | `Youtube` (lucide)                         |

#### Step 4 — Amenidades

El `FeaturesCheckboxGrid` renderiza un grid con todos los valores de `COMPLEX_FEATURE_VALUES`:

- Grid responsive: `grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3`
- Cada item: `Checkbox` de Shadcn + icono de `getFeatureConfig(feature)` + label en español
- El campo `features` en react-hook-form es un array de strings

```typescript
// Patrón de uso con react-hook-form Controller:
<Controller
  control={control}
  name="features"
  render={({ field }) => (
    <FeaturesCheckboxGrid
      value={field.value}
      onChange={field.onChange}
    />
  )}
/>
```

#### StepProgress

```
[1] ─── [2] ─── [3] ─── [4]
 ✓      ●       ○       ○
```

- Steps completados (index < currentStep): fondo `ac-lime`, icono `Check`
- Step actual (index === currentStep): fondo `ac-lime`, número en negro, texto resaltado
- Steps futuros (index > currentStep): fondo gris, número en gris
- Líneas conectoras: verde si el step de la izquierda está completado, gris si no

#### StepNavigationButtons

```typescript
type StepNavigationButtonsProps = {
  currentStep: number
  totalSteps: number
  onBack: () => void
  onNext: () => void
  onSubmit: () => void
  isLoading: boolean
}
```

- Step 0: Solo "Siguiente" (sin "Anterior")
- Steps 1-2: "Anterior" (izquierda) + "Siguiente" (derecha)
- Step 3 (último): "Anterior" (izquierda) + "Crear complejo" con loading state (derecha)

---

## 8. Valores por defecto del formulario

```typescript
const defaultValues: CreateComplexFormType = {
  // Step 1
  title: '',
  description: '',
  timezone: 'America/Argentina/Buenos_Aires',
  currency: 'ARS',
  cancellationPolicy: '',
  // Step 2
  street: '',
  city: '',
  state: '',
  country: 'AR',
  zip: '',
  latitude: 0,
  longitude: 0,
  // Step 3
  phone: '',
  website: '',
  facebook: '',
  twitter: '',
  instagram: '',
  youtube: '',
  // Step 4
  features: [],
}
```

---

## 9. UX/UI — Especificaciones visuales

### 9.1 Modal

- **Ancho:** `sm:max-w-[700px]` (más angosto que el modal de booking que tiene dos columnas)
- **Alto máximo:** `max-h-[90vh]` con `overflow-y-auto scrollbar-hide`
- **Background:** `bg-ac-dark-gray border-ac-dark-gray` (consistente con modals existentes)
- **Close button:** Esquina superior derecha (default de Shadcn Dialog)

### 9.2 Feedback visual

| Situación                  | Feedback                                                         |
| -------------------------- | ---------------------------------------------------------------- |
| Creación exitosa           | `toast.success('Complejo creado exitosamente')`                  |
| Título duplicado           | `toast.error('Ya existe un complejo con ese nombre.')`           |
| Error genérico             | `toast.error('Error al crear el complejo. Intentá nuevamente.')` |
| Loading submit             | Botón disabled con spinner y texto "Creando..."                  |
| Autocompletado buscando    | Ícono `Loader2` girando en el input de búsqueda                  |
| Dirección seleccionada     | Badge verde con `MapPin` + dirección completa + botón X          |
| Sin resultados de búsqueda | Texto muted: "Sin resultados. Probá con otra dirección."         |
| Error de red en búsqueda   | Texto muted: "Error al buscar. Intentá nuevamente."              |
| Sin ubicación al avanzar   | `text-destructive` inline: "Seleccioná una ubicación válida..."  |
| Validación de campo        | `<FormMessage />` debajo de cada campo (Shadcn)                  |

---

## 10. Flujo completo (E2E)

```
1. Usuario en /profile/complexes
2. Click "Crear nuevo complejo" → setIsCreateModalOpen(true)
3. ComplexModal abre → ComplexForm inicializa (Step 0)

4. Step 1 — Información básica:
   - Completa: título, descripción, timezone, moneda, política
   - Click "Siguiente" → form.trigger(['title', 'description', 'timezone', 'currency', 'cancellationPolicy'])
   - Si hay errores: muestra FormMessage inline, no avanza
   - Si OK: setCurrentStep(1)

5. Step 2 — Dirección y ubicación:
   - Usuario empieza a escribir en el input de búsqueda (ej: "Colón 1234 Córdoba")
   - Tras 500ms de pausa y 4+ chars → searchAddress(query) → Nominatim API
   - Dropdown muestra sugerencias con íconos MapPin
   - Usuario selecciona una → se rellenan automáticamente: street, city, state, zip, lat, lng
   - Badge verde confirma la dirección seleccionada
   - Usuario puede ajustar manualmente los campos de texto si lo necesita
   - Click "Siguiente" → form.trigger(['street', 'city', 'state', 'country', 'zip', 'latitude', 'longitude'])
   - Si lat/lng === 0 (nunca seleccionó): error "Seleccioná una ubicación válida..."
   - Si OK: setCurrentStep(2)

6. Step 3 — Contacto y redes:
   - Completa: teléfono (obligatorio), resto opcional
   - Click "Siguiente" → form.trigger(['phone', 'website', ...])
   - Si OK: setCurrentStep(3)

7. Step 4 — Amenidades:
   - Selecciona features (opcional)
   - Click "Crear complejo" → form.handleSubmit(onSubmit)

8. onSubmit:
   - Transforma datos planos → CreateComplexInputType (address/contact anidados)
   - Empty strings → undefined para campos opcionales
   - addComplexAsync(apiInput) → POST /api/rpc

9. Backend (createComplex handler):
   - authorizedMiddleware: verifica sesión, inyecta context.user.id
   - Valida unicidad de title (findUnique)
   - Si duplicado: throw CONFLICT → frontend muestra toast.error
   - $transaction: create ComplexAddress → create ComplexContact → create Complex
   - geojson: { type: 'Point', coordinates: [longitude, latitude] }
   - Retorna 201 con { id, title, isActive, createdAt }

10. Frontend (onSuccess):
    - queryClient.invalidateQueries(['complexesList', 'complexesMapList'])
    - toast.success('Complejo creado exitosamente')
    - form.reset()
    - onClose() → setIsCreateModalOpen(false)
    - Tabla se refresca automáticamente via TanStack Query
```

---

## 11. Orden de implementación recomendado

| #   | Tarea                                     | Archivo(s)                                              | Dependencias     |
| --- | ----------------------------------------- | ------------------------------------------------------- | ---------------- |
| 1   | Constantes de configuración               | `src/config/complexes.ts`                               | Ninguna          |
| 2   | Schemas Zod (form + API + response)       | `src/orpc/schemas/complex.ts`                           | #1               |
| 3   | Tipos TypeScript inferidos                | `src/types/complex.ts`                                  | #2               |
| 4   | Procedimiento ORPC `createComplex`        | `src/orpc/router/complex.ts`                            | #2, #3           |
| 5   | Registrar en router                       | `src/orpc/router/index.ts`                              | #4               |
| 6   | Servicio Nominatim                        | `src/lib/geocoding/nominatim.ts`                        | Ninguna          |
| 7   | Hook `useAddComplex`                      | `src/data/complex/add-complex.ts`                       | #3, #5           |
| 8   | Form fields (`complexFormFields.tsx`)     | `src/components/profile/forms/`                         | #1, #6           |
| 9   | Form container wizard (`complexForm.tsx`) | `src/components/profile/forms/`                         | #2, #7, #8       |
| 10  | Modal wrapper (`complexModal.tsx`)        | `src/components/profile/modals/`                        | #9               |
| 11  | Actualizar container                      | `src/components/profile/general/complexesContainer.tsx` | #10              |
| 12  | Verificar build                           | `pnpm build`                                            | Todo lo anterior |

---

## 12. Fuera de alcance (v2+)

- **Upload de imágenes** — requiere infraestructura de storage (S3/Cloudflare R2) + endpoint de upload
- **Creación de canchas (Fields)** — flujo separado con schedules, price slots, y lógica de canchas dividibles
- **Edición de complejo** — reutilizar el mismo modal en modo edit con datos precargados via `useComplexById`
- **Eliminación de complejo** — soft delete (`deletedAt`) con diálogo de confirmación
- **Tags** — requiere CRUD de tags previo; el campo `complexTags` no tiene UI de gestión
- **Mapa de previsualización** — mini-mapa Leaflet en Step 2 mostrando el pin de la ubicación seleccionada
- **Verificación de rol** — actualmente `authorizedMiddleware` solo verifica sesión; se puede agregar check de `context.user.role` en el handler para restringir a `ownerComplex`
- **Autocompletado de dirección** — geocodificación en tiempo real mientras el usuario escribe (requiere debounce y permisos adicionales de Nominatim)
- **Múltiples países** — ampliar `COUNTRY_VALUES` y `COUNTRY_MAP` según crecimiento del producto

---

## 13. Consideraciones técnicas

1. **No requiere cambios en el schema de Prisma.** Todos los modelos necesarios (`Complex`, `ComplexAddress`, `ComplexContact`) ya existen con los campos necesarios.

2. **`geojson` se construye automáticamente en el backend:** `{ type: 'Point', coordinates: [longitude, latitude] }`. Nota: GeoJSON usa orden `[lng, lat]` (opuesto a Leaflet que usa `[lat, lng]`).

3. **Unicidad de título validada explícitamente.** El campo `title` tiene constraint `@unique` en Prisma, pero un `findUnique` previo permite dar un mensaje de error descriptivo en lugar del error críptico de Prisma.

4. **Empty strings → undefined** en `onSubmit`. Los campos opcionales del form pueden ser empty strings. La transformación los convierte a `undefined` antes de enviar al API, ya que los schemas del backend usan `.optional()` sin `.or(z.literal(''))`.

5. **Cache invalidation en `onSuccess`.** El hook invalida `complexesList` y `complexesMapList`, provocando refetch automático de la tabla en `/profile/complexes` y los pins del mapa en `/search`.

6. **Sentry.** El handler debe wrapearse con `Sentry.startSpan(...)` durante la implementación (importar de `@sentry/tanstackstart-react`), siguiendo la convención existente en el resto de los handlers.

7. **Consistencia de patrones.** La implementación debe seguir fielmente los patrones existentes:
   - Schemas separados form/API (como `AddBookingFormSchema` vs `CreateBookingInputSchema`)
   - Hook de mutación en `src/data/` con renaming descriptivo (como `useAddBooking`)
   - `FormFields` como namespace exportado (como en `bookingFormFields.tsx`)
   - `BaseFieldProps<T>` genérico para cada campo (como en `src/types/forms.ts`)
   - `zodResolver` + `form.handleSubmit` + `<Form>` wrapper (como en todos los forms)
   - Toast con `sonner` para feedback (como en todos los forms)
   - `createApiResponseSchema()` wrapper para la respuesta (como en `addBooking`)
   - `authorizedMiddleware` para endpoints autenticados (como `getComplexesList`, `addBooking`)
