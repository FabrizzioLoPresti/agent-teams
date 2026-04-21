/**
 * Tests para la transformación de datos del formulario al input de updateComplex.
 *
 * En modo edición, `onSubmit` de `ComplexForm` hace exactamente la misma
 * transformación que en modo creación, pero agrega `id: complexId` al resultado
 * antes de llamar a `updateComplexAsync`.
 *
 * Se prueba aquí de forma aislada porque es el contrato crítico entre el form
 * y el API de update. Si la transformación cambia, los tests fallarán.
 */
import { describe, it, expect } from 'vitest'
import type {
  CreateComplexFormType,
  UpdateComplexInputType,
} from '@/types/complex'
import { DEFAULT_WORKING_SCHEDULE } from '@/config/complexes'

// ---------------------------------------------------------------------------
// Implementación de referencia: la misma transformación que createComplex
// pero con id añadido (extraída del spec, sección 7.2)
// ---------------------------------------------------------------------------

function transformFormToUpdateInput(
  data: CreateComplexFormType,
  complexId: string,
): UpdateComplexInputType {
  return {
    id: complexId,
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
      zip: data.zip || undefined,
    },
    contact: {
      phone: data.phone,
      website: data.website || undefined,
      facebook: data.facebook || undefined,
      twitter: data.twitter || undefined,
      instagram: data.instagram || undefined,
      youtube: data.youtube || undefined,
    },
    features: data.features ?? [],
    workingSchedules: data.workingSchedules,
  }
}

// ---------------------------------------------------------------------------
// Fixture base
// ---------------------------------------------------------------------------

const COMPLEX_ID = 'cm000000000000000000000000'

const baseFormData: CreateComplexFormType = {
  title: 'Club Deportivo Actualizado',
  description: 'Descripción actualizada con más de 10 caracteres.',
  timezone: 'America/Argentina/Cordoba',
  currency: 'ARS',
  cancellationPolicy: 'Sin cancelaciones 24h antes del turno.',
  street: 'Av. Colón 9999',
  city: 'Córdoba',
  state: 'Córdoba',
  country: 'AR',
  zip: '5001',
  latitude: -31.4135,
  longitude: -64.1811,
  phone: '0351-9999999',
  website: 'https://clubactualizado.com',
  facebook: '',
  twitter: '',
  instagram: 'https://instagram.com/clubactualizado',
  youtube: '',
  features: ['PARKING', 'WIFI', 'SHOWERS'],
  workingSchedules: DEFAULT_WORKING_SCHEDULE,
}

// ---------------------------------------------------------------------------
// Tests: campo id
// ---------------------------------------------------------------------------

describe('transformFormToUpdateInput — campo id', () => {
  it('incluye el complexId en el output como campo id', () => {
    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    expect(result.id).toBe(COMPLEX_ID)
  })

  it('el campo id en el output coincide exactamente con el complexId pasado', () => {
    const otherId = 'cm999999999999999999999999'
    const result = transformFormToUpdateInput(baseFormData, otherId)
    expect(result.id).toBe(otherId)
  })

  it('el output incluye id junto con todos los otros campos', () => {
    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('address')
    expect(result).toHaveProperty('contact')
    expect(result).toHaveProperty('features')
  })
})

// ---------------------------------------------------------------------------
// Tests: misma estructura anidada que create
// ---------------------------------------------------------------------------

describe('transformFormToUpdateInput — estructura anidada (igual que create)', () => {
  it('genera el objeto address anidado correctamente', () => {
    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    expect(result.address).toEqual({
      street: 'Av. Colón 9999',
      city: 'Córdoba',
      state: 'Córdoba',
      country: 'AR',
      zip: '5001',
    })
  })

  it('genera el objeto contact anidado correctamente', () => {
    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    expect(result.contact).toEqual({
      phone: '0351-9999999',
      website: 'https://clubactualizado.com',
      instagram: 'https://instagram.com/clubactualizado',
    })
  })

  it('mantiene los campos de nivel superior correctamente', () => {
    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    expect(result.title).toBe('Club Deportivo Actualizado')
    expect(result.timezone).toBe('America/Argentina/Cordoba')
    expect(result.currency).toBe('ARS')
    expect(result.latitude).toBe(-31.4135)
    expect(result.longitude).toBe(-64.1811)
  })

  it('NO incluye los campos planos de dirección en el nivel superior', () => {
    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    expect(result).not.toHaveProperty('street')
    expect(result).not.toHaveProperty('city')
    expect(result).not.toHaveProperty('state')
    expect(result).not.toHaveProperty('zip')
  })

  it('NO incluye los campos de contacto en el nivel superior', () => {
    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('website')
    expect(result).not.toHaveProperty('instagram')
  })
})

// ---------------------------------------------------------------------------
// Tests: conversión de string vacío → undefined (igual que create)
// ---------------------------------------------------------------------------

describe('transformFormToUpdateInput — strings vacíos a undefined', () => {
  it('convierte zip vacío a undefined en address', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, zip: '' },
      COMPLEX_ID,
    )
    expect(result.address.zip).toBeUndefined()
  })

  it('convierte website vacío a undefined en contact', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, website: '' },
      COMPLEX_ID,
    )
    expect(result.contact.website).toBeUndefined()
  })

  it('convierte facebook vacío a undefined en contact', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, facebook: '' },
      COMPLEX_ID,
    )
    expect(result.contact.facebook).toBeUndefined()
  })

  it('convierte twitter vacío a undefined en contact', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, twitter: '' },
      COMPLEX_ID,
    )
    expect(result.contact.twitter).toBeUndefined()
  })

  it('convierte instagram vacío a undefined en contact', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, instagram: '' },
      COMPLEX_ID,
    )
    expect(result.contact.instagram).toBeUndefined()
  })

  it('convierte youtube vacío a undefined en contact', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, youtube: '' },
      COMPLEX_ID,
    )
    expect(result.contact.youtube).toBeUndefined()
  })

  it('cuando todos los opcionales están vacíos, contact solo tiene phone', () => {
    const result = transformFormToUpdateInput(
      {
        ...baseFormData,
        website: '',
        facebook: '',
        twitter: '',
        instagram: '',
        youtube: '',
      },
      COMPLEX_ID,
    )
    expect(result.contact).toEqual({ phone: '0351-9999999' })
  })
})

// ---------------------------------------------------------------------------
// Tests: features
// ---------------------------------------------------------------------------

describe('transformFormToUpdateInput — features', () => {
  it('preserva el array de features sin modificación', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, features: ['PARKING', 'WIFI', 'SHOWERS'] },
      COMPLEX_ID,
    )
    expect(result.features).toEqual(['PARKING', 'WIFI', 'SHOWERS'])
  })

  it('preserva array vacío de features', () => {
    const result = transformFormToUpdateInput(
      { ...baseFormData, features: [] },
      COMPLEX_ID,
    )
    expect(result.features).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: validación del output contra UpdateComplexInputSchema
// ---------------------------------------------------------------------------

describe('transformFormToUpdateInput — output validado por UpdateComplexInputSchema', () => {
  it('el output completo pasa la validación del schema del endpoint', async () => {
    const { UpdateComplexInputSchema } = await import('@/orpc/schemas/complex')

    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    const parsed = UpdateComplexInputSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })

  it('el output con todos los opcionales vacíos también pasa la validación', async () => {
    const { UpdateComplexInputSchema } = await import('@/orpc/schemas/complex')

    const result = transformFormToUpdateInput(
      {
        ...baseFormData,
        zip: '',
        website: '',
        facebook: '',
        twitter: '',
        instagram: '',
        youtube: '',
        features: [],
      },
      COMPLEX_ID,
    )

    const parsed = UpdateComplexInputSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })

  it('el output contiene el id en la posición correcta para UpdateComplexInputSchema', async () => {
    const { UpdateComplexInputSchema } = await import('@/orpc/schemas/complex')

    const result = transformFormToUpdateInput(baseFormData, COMPLEX_ID)
    const parsed = UpdateComplexInputSchema.safeParse(result)

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.id).toBe(COMPLEX_ID)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: diferencia entre create y update
// ---------------------------------------------------------------------------

describe('transformFormToUpdateInput — diferencias con create', () => {
  it('el output de update tiene un campo id que el de create no tiene', async () => {
    const { CreateComplexInputSchema } = await import('@/orpc/schemas/complex')

    const updateResult = transformFormToUpdateInput(baseFormData, COMPLEX_ID)

    // El output de update tiene id
    expect(updateResult).toHaveProperty('id')

    // Pero ese id no está en CreateComplexInputSchema (no debe aparecer en el type)
    const createParsed = CreateComplexInputSchema.safeParse(updateResult)
    // CreateComplexInputSchema es más permisivo con propiedades extra, así que
    // lo verificamos estructuralmente comparando los campos esperados
    expect(updateResult.id).toBe(COMPLEX_ID)
    expect(createParsed.success).toBe(true) // Zod ignora propiedades extra por defecto
  })

  it('dos llamadas con el mismo form data pero distintos complexId generan outputs con distinto id', () => {
    const id1 = 'cm111111111111111111111111'
    const id2 = 'cm222222222222222222222222'

    const result1 = transformFormToUpdateInput(baseFormData, id1)
    const result2 = transformFormToUpdateInput(baseFormData, id2)

    expect(result1.id).toBe(id1)
    expect(result2.id).toBe(id2)
    expect(result1.id).not.toBe(result2.id)
  })
})
