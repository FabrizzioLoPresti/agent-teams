/**
 * Tests para el helper `mapComplexToFormDefaults`.
 *
 * La función convierte la respuesta anidada de `getComplexById` (ComplexByIdResponseType)
 * a la estructura plana de `CreateComplexFormType` usada por react-hook-form.
 *
 * Casos críticos:
 *   - Mapeo correcto de campos anidados (complexAddress, complexContact) a estructura plana
 *   - Fallback a strings vacíos cuando los objetos anidados son null
 *   - Propagación correcta de currency, latitude y longitude (campos extendidos)
 *   - El resultado pasa la validación de CreateComplexFormSchema con ubicación válida
 */
import { describe, it, expect } from 'vitest'
import { mapComplexToFormDefaults } from '@/config/complexes'
import type { ComplexByIdResponseType } from '@/types/complex'

// ---------------------------------------------------------------------------
// Fixture base: complejo con todos los campos completos
// ---------------------------------------------------------------------------

const fullComplex: ComplexByIdResponseType = {
  id: 'cm000000000000000000000000',
  title: 'Club Deportivo Córdoba',
  description: 'Complejo deportivo completo con múltiples canchas.',
  timezone: 'America/Argentina/Cordoba',
  currency: 'ARS',
  cancellationPolicy: 'Sin cancelaciones 24h antes.',
  rating: 4.5,
  reviewsCount: 20,
  features: ['PARKING', 'WIFI', 'RESTROOMS'],
  latitude: -31.4135,
  longitude: -64.1811,
  owner: {
    email: 'owner@clubdeportivo.com',
    name: 'Juan Perez',
    username: 'jperez',
    displayUsername: '@jperez',
  },
  complexAddress: {
    street: 'Av. Colón 1234',
    city: 'Córdoba',
    state: 'Córdoba',
    country: 'AR',
    zip: '5000',
  },
  complexContact: {
    phone: '0351-4567890',
    website: 'https://clubcordoba.com',
    facebook: 'https://facebook.com/clubcordoba',
    twitter: 'https://twitter.com/clubcordoba',
    instagram: 'https://instagram.com/clubcordoba',
    youtube: 'https://youtube.com/@clubcordoba',
  },
  complexImages: [],
  complexTags: [],
  complexWorkingSchedules: [
    {
      id: 'cws1',
      dayOfWeek: 'MONDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      id: 'cws2',
      dayOfWeek: 'TUESDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      id: 'cws3',
      dayOfWeek: 'WEDNESDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      id: 'cws4',
      dayOfWeek: 'THURSDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      id: 'cws5',
      dayOfWeek: 'FRIDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      id: 'cws6',
      dayOfWeek: 'SATURDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      id: 'cws7',
      dayOfWeek: 'SUNDAY',
      isWorking: false,
      openTime: '08:00',
      closeTime: '22:00',
    },
  ],
  fields: [],
}

// ---------------------------------------------------------------------------
// Tests: mapeo de campos de nivel superior
// ---------------------------------------------------------------------------

describe('mapComplexToFormDefaults — campos de nivel superior', () => {
  it('mapea title correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.title).toBe('Club Deportivo Córdoba')
  })

  it('mapea description correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.description).toBe(
      'Complejo deportivo completo con múltiples canchas.',
    )
  })

  it('mapea timezone correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.timezone).toBe('America/Argentina/Cordoba')
  })

  it('mapea currency correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.currency).toBe('ARS')
  })

  it('mapea cancellationPolicy correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.cancellationPolicy).toBe('Sin cancelaciones 24h antes.')
  })

  it('mapea latitude correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.latitude).toBe(-31.4135)
  })

  it('mapea longitude correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.longitude).toBe(-64.1811)
  })

  it('mapea features correctamente', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.features).toEqual(['PARKING', 'WIFI', 'RESTROOMS'])
  })
})

// ---------------------------------------------------------------------------
// Tests: mapeo de complexAddress (anidado → plano)
// ---------------------------------------------------------------------------

describe('mapComplexToFormDefaults — complexAddress anidado a campos planos', () => {
  it('mapea street desde complexAddress', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.street).toBe('Av. Colón 1234')
  })

  it('mapea city desde complexAddress', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.city).toBe('Córdoba')
  })

  it('mapea state desde complexAddress', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.state).toBe('Córdoba')
  })

  it('mapea country desde complexAddress', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.country).toBe('AR')
  })

  it('mapea zip desde complexAddress', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.zip).toBe('5000')
  })

  it('usa string vacío como fallback de street cuando complexAddress es null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: null,
    })
    expect(result.street).toBe('')
  })

  it('usa string vacío como fallback de city cuando complexAddress es null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: null,
    })
    expect(result.city).toBe('')
  })

  it('usa string vacío como fallback de state cuando complexAddress es null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: null,
    })
    expect(result.state).toBe('')
  })

  it('usa "AR" como fallback de country cuando complexAddress es null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: null,
    })
    expect(result.country).toBe('AR')
  })

  it('usa string vacío como fallback de zip cuando complexAddress es null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: null,
    })
    expect(result.zip).toBe('')
  })

  it('usa string vacío cuando zip es null dentro de complexAddress', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: { ...fullComplex.complexAddress!, zip: null },
    })
    expect(result.zip).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tests: mapeo de complexContact (anidado → plano)
// ---------------------------------------------------------------------------

describe('mapComplexToFormDefaults — complexContact anidado a campos planos', () => {
  it('mapea phone desde complexContact', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.phone).toBe('0351-4567890')
  })

  it('mapea website desde complexContact', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.website).toBe('https://clubcordoba.com')
  })

  it('mapea facebook desde complexContact', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.facebook).toBe('https://facebook.com/clubcordoba')
  })

  it('mapea twitter desde complexContact', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.twitter).toBe('https://twitter.com/clubcordoba')
  })

  it('mapea instagram desde complexContact', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.instagram).toBe('https://instagram.com/clubcordoba')
  })

  it('mapea youtube desde complexContact', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result.youtube).toBe('https://youtube.com/@clubcordoba')
  })

  it('usa string vacío como fallback de phone cuando complexContact es null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexContact: null,
    })
    expect(result.phone).toBe('')
  })

  it('usa string vacío como fallback de website cuando complexContact es null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexContact: null,
    })
    expect(result.website).toBe('')
  })

  it('usa string vacío cuando website es null dentro de complexContact', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexContact: { ...fullComplex.complexContact!, website: null },
    })
    expect(result.website).toBe('')
  })

  it('usa string vacío cuando instagram es null dentro de complexContact', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexContact: { ...fullComplex.complexContact!, instagram: null },
    })
    expect(result.instagram).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tests: casos borde
// ---------------------------------------------------------------------------

describe('mapComplexToFormDefaults — casos borde', () => {
  it('mapea features vacío correctamente', () => {
    const result = mapComplexToFormDefaults({ ...fullComplex, features: [] })
    expect(result.features).toEqual([])
  })

  it('mapea features null correctamente (fallback a array vacío)', () => {
    const result = mapComplexToFormDefaults({ ...fullComplex, features: null })
    expect(result.features).toEqual([])
  })

  it('preserva coordenadas negativas de Argentina correctamente', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      latitude: -34.6037,
      longitude: -58.3816,
    })
    expect(result.latitude).toBe(-34.6037)
    expect(result.longitude).toBe(-58.3816)
  })

  it('no incluye campos que no pertenecen a CreateComplexFormType', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    expect(result).not.toHaveProperty('id')
    expect(result).not.toHaveProperty('rating')
    expect(result).not.toHaveProperty('reviewsCount')
    expect(result).not.toHaveProperty('owner')
    expect(result).not.toHaveProperty('complexAddress')
    expect(result).not.toHaveProperty('complexContact')
    expect(result).not.toHaveProperty('complexImages')
    expect(result).not.toHaveProperty('complexTags')
    expect(result).not.toHaveProperty('fields')
  })

  it('funciona correctamente cuando ambos complexAddress y complexContact son null', () => {
    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: null,
      complexContact: null,
    })

    expect(result.street).toBe('')
    expect(result.city).toBe('')
    expect(result.state).toBe('')
    expect(result.country).toBe('AR')
    expect(result.zip).toBe('')
    expect(result.phone).toBe('')
    expect(result.website).toBe('')
    expect(result.facebook).toBe('')
    expect(result.twitter).toBe('')
    expect(result.instagram).toBe('')
    expect(result.youtube).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tests: validación del output contra CreateComplexFormSchema
// ---------------------------------------------------------------------------

describe('mapComplexToFormDefaults — output validado por CreateComplexFormSchema', () => {
  it('el output con datos completos pasa la validación del schema del form', async () => {
    const { CreateComplexFormSchema } = await import('@/orpc/schemas/complex')

    const result = mapComplexToFormDefaults(fullComplex)
    const parsed = CreateComplexFormSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })

  it('el output con complexAddress y complexContact null falla por campos requeridos', async () => {
    const { CreateComplexFormSchema } = await import('@/orpc/schemas/complex')

    const result = mapComplexToFormDefaults({
      ...fullComplex,
      complexAddress: null,
      complexContact: null,
    })
    const parsed = CreateComplexFormSchema.safeParse(result)

    // street, city, state, phone son requeridos — el schema debe rechazar strings vacíos
    expect(parsed.success).toBe(false)
  })

  it('el output mantiene las todas las keys requeridas por CreateComplexFormType', () => {
    const result = mapComplexToFormDefaults(fullComplex)
    const requiredKeys: Array<keyof typeof result> = [
      'title',
      'description',
      'timezone',
      'currency',
      'cancellationPolicy',
      'street',
      'city',
      'state',
      'country',
      'zip',
      'latitude',
      'longitude',
      'phone',
      'website',
      'facebook',
      'twitter',
      'instagram',
      'youtube',
      'features',
      'workingSchedules',
    ]

    for (const key of requiredKeys) {
      expect(result).toHaveProperty(key)
    }
  })
})
