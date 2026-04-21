/**
 * Tests para la transformación de datos del formulario al input del API.
 *
 * La lógica de transformación está en `complexForm.tsx` (onSubmit):
 *   form data (CreateComplexFormType) → API input (CreateComplexInputType)
 *
 * Se prueba aquí de forma aislada porque es la lógica de negocio más crítica
 * del componente: mapea una estructura plana a una estructura anidada y
 * convierte strings vacíos a undefined.
 */
import { describe, it, expect } from 'vitest'
import type {
  CreateComplexFormType,
  CreateComplexInputType,
} from '@/types/complex'
import { DEFAULT_WORKING_SCHEDULE } from '@/config/complexes'

// ---------------------------------------------------------------------------
// Implementación de referencia de la transformación (extraída del spec)
// Se mantiene aquí para documentar el contrato esperado.
// ---------------------------------------------------------------------------

function transformFormToApiInput(
  data: CreateComplexFormType,
): CreateComplexInputType {
  return {
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
    workingSchedules: data.workingSchedules,
  }
}

// ---------------------------------------------------------------------------
// Fixture base
// ---------------------------------------------------------------------------

const baseFormData: CreateComplexFormType = {
  title: 'Club Deportivo Córdoba',
  description: 'Un complejo deportivo completo con canchas de fútbol y tenis.',
  timezone: 'America/Argentina/Cordoba',
  currency: 'ARS',
  cancellationPolicy: 'Sin cancelaciones 24h antes del turno.',
  street: 'Av. Colón 1234',
  city: 'Córdoba',
  state: 'Córdoba',
  country: 'AR',
  zip: '5000',
  latitude: -31.4135,
  longitude: -64.1811,
  phone: '0351-4567890',
  website: 'https://clubcordoba.com',
  facebook: 'https://facebook.com/clubcordoba',
  twitter: '',
  instagram: '',
  youtube: '',
  features: ['PARKING', 'WIFI', 'RESTROOMS'],
  workingSchedules: DEFAULT_WORKING_SCHEDULE,
}

// ---------------------------------------------------------------------------
// Tests: estructura anidada
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — estructura anidada', () => {
  it('genera el objeto address anidado correctamente', () => {
    const result = transformFormToApiInput(baseFormData)

    expect(result.address).toEqual({
      street: 'Av. Colón 1234',
      city: 'Córdoba',
      state: 'Córdoba',
      country: 'AR',
      zip: '5000',
    })
  })

  it('genera el objeto contact anidado correctamente', () => {
    const result = transformFormToApiInput(baseFormData)

    expect(result.contact).toEqual({
      phone: '0351-4567890',
      website: 'https://clubcordoba.com',
      facebook: 'https://facebook.com/clubcordoba',
    })
  })

  it('mantiene los campos de nivel superior correctamente', () => {
    const result = transformFormToApiInput(baseFormData)

    expect(result.title).toBe('Club Deportivo Córdoba')
    expect(result.description).toBe(
      'Un complejo deportivo completo con canchas de fútbol y tenis.',
    )
    expect(result.timezone).toBe('America/Argentina/Cordoba')
    expect(result.currency).toBe('ARS')
    expect(result.latitude).toBe(-31.4135)
    expect(result.longitude).toBe(-64.1811)
  })

  it('NO incluye los campos planos de dirección en el nivel superior', () => {
    const result = transformFormToApiInput(baseFormData)

    expect(result).not.toHaveProperty('street')
    expect(result).not.toHaveProperty('city')
    expect(result).not.toHaveProperty('state')
    expect(result).not.toHaveProperty('zip')
  })

  it('NO incluye los campos de contacto en el nivel superior', () => {
    const result = transformFormToApiInput(baseFormData)

    expect(result).not.toHaveProperty('phone')
    expect(result).not.toHaveProperty('website')
    expect(result).not.toHaveProperty('facebook')
  })
})

// ---------------------------------------------------------------------------
// Tests: conversión de string vacío → undefined
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — strings vacíos a undefined', () => {
  it('convierte zip vacío a undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, zip: '' })
    expect(result.address.zip).toBeUndefined()
  })

  it('convierte website vacío a undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, website: '' })
    expect(result.contact.website).toBeUndefined()
  })

  it('convierte facebook vacío a undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, facebook: '' })
    expect(result.contact.facebook).toBeUndefined()
  })

  it('convierte twitter vacío a undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, twitter: '' })
    expect(result.contact.twitter).toBeUndefined()
  })

  it('convierte instagram vacío a undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, instagram: '' })
    expect(result.contact.instagram).toBeUndefined()
  })

  it('convierte youtube vacío a undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, youtube: '' })
    expect(result.contact.youtube).toBeUndefined()
  })

  it('preserva valores de URL no vacíos tal cual', () => {
    const result = transformFormToApiInput({
      ...baseFormData,
      website: 'https://club.com',
      twitter: '',
    })
    expect(result.contact.website).toBe('https://club.com')
    expect(result.contact.twitter).toBeUndefined()
  })

  it('cuando todos los campos opcionales están vacíos, contact solo tiene phone', () => {
    const result = transformFormToApiInput({
      ...baseFormData,
      website: '',
      facebook: '',
      twitter: '',
      instagram: '',
      youtube: '',
    })

    expect(result.contact).toEqual({ phone: '0351-4567890' })
  })
})

// ---------------------------------------------------------------------------
// Tests: features
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — features', () => {
  it('preserva el array de features sin modificación', () => {
    const result = transformFormToApiInput({
      ...baseFormData,
      features: ['PARKING', 'WIFI', 'SHOWERS'],
    })
    expect(result.features).toEqual(['PARKING', 'WIFI', 'SHOWERS'])
  })

  it('preserva array vacío de features', () => {
    const result = transformFormToApiInput({ ...baseFormData, features: [] })
    expect(result.features).toEqual([])
  })

  it('preserva todas las features válidas', () => {
    const allFeatures = [
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

    const result = transformFormToApiInput({
      ...baseFormData,
      features: [...allFeatures],
    })
    expect(result.features).toHaveLength(12)
  })
})

// ---------------------------------------------------------------------------
// Tests: validación del output contra CreateComplexInputSchema
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — output validado por CreateComplexInputSchema', () => {
  it('el output completo pasa la validación del schema del endpoint', async () => {
    const { CreateComplexInputSchema } = await import('@/orpc/schemas/complex')

    const result = transformFormToApiInput(baseFormData)
    const parsed = CreateComplexInputSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })

  it('el output con todos los opcionales vacíos también pasa la validación', async () => {
    const { CreateComplexInputSchema } = await import('@/orpc/schemas/complex')

    const result = transformFormToApiInput({
      ...baseFormData,
      zip: '',
      website: '',
      facebook: '',
      twitter: '',
      instagram: '',
      youtube: '',
      features: [],
    })

    const parsed = CreateComplexInputSchema.safeParse(result)
    expect(parsed.success).toBe(true)
  })
})
