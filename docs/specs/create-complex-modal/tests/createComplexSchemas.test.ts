import { describe, it, expect } from 'vitest'
import {
  CreateComplexFormSchema,
  CreateComplexInputSchema,
  CreateComplexResponseSchema,
} from '@/orpc/schemas/complex'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_WORKING_SCHEDULES = [
  {
    dayOfWeek: 'MONDAY' as const,
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'TUESDAY' as const,
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'WEDNESDAY' as const,
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'THURSDAY' as const,
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'FRIDAY' as const,
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'SATURDAY' as const,
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    dayOfWeek: 'SUNDAY' as const,
    isWorking: false,
    openTime: '08:00',
    closeTime: '22:00',
  },
]

const validFormData = {
  title: 'Club Deportivo Córdoba',
  description: 'Un complejo deportivo completo en el corazón de Córdoba.',
  timezone: 'America/Argentina/Cordoba' as const,
  currency: 'ARS' as const,
  cancellationPolicy: 'Sin cancelaciones 24h antes.',
  street: 'Av. Colón 1234',
  city: 'Córdoba',
  state: 'Córdoba',
  country: 'AR' as const,
  zip: '5000',
  latitude: -31.4135,
  longitude: -64.1811,
  phone: '0351-4567890',
  website: '',
  facebook: '',
  twitter: '',
  instagram: '',
  youtube: '',
  features: ['PARKING', 'WIFI'] as Array<
    | 'PARKING'
    | 'RESTROOMS'
    | 'SHOWERS'
    | 'LOCKER_ROOMS'
    | 'BARBECUE_AREA'
    | 'RESTAURANT'
    | 'CAFETERIA'
    | 'FIRST_AID'
    | 'SECURITY_SERVICE'
    | 'WIFI'
    | 'AIR_CONDITIONING'
    | 'EQUIPMENT_RENTAL'
  >,
  workingSchedules: MOCK_WORKING_SCHEDULES,
}

const validApiInput = {
  title: 'Club Deportivo Córdoba',
  description: 'Un complejo deportivo completo en el corazón de Córdoba.',
  timezone: 'America/Argentina/Cordoba' as const,
  currency: 'ARS' as const,
  cancellationPolicy: 'Sin cancelaciones 24h antes.',
  latitude: -31.4135,
  longitude: -64.1811,
  address: {
    street: 'Av. Colón 1234',
    city: 'Córdoba',
    state: 'Córdoba',
    country: 'AR' as const,
    zip: '5000',
  },
  contact: {
    phone: '0351-4567890',
  },
  features: ['PARKING', 'WIFI'] as Array<
    | 'PARKING'
    | 'RESTROOMS'
    | 'SHOWERS'
    | 'LOCKER_ROOMS'
    | 'BARBECUE_AREA'
    | 'RESTAURANT'
    | 'CAFETERIA'
    | 'FIRST_AID'
    | 'SECURITY_SERVICE'
    | 'WIFI'
    | 'AIR_CONDITIONING'
    | 'EQUIPMENT_RENTAL'
  >,
  workingSchedules: MOCK_WORKING_SCHEDULES,
}

// ---------------------------------------------------------------------------
// CreateComplexFormSchema — Step 1: Información básica
// ---------------------------------------------------------------------------

describe('CreateComplexFormSchema — Step 1: Información básica', () => {
  it('acepta datos válidos del step 1', () => {
    const result = CreateComplexFormSchema.safeParse(validFormData)
    expect(result.success).toBe(true)
  })

  it('rechaza título con menos de 3 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      title: 'AB',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined()
    }
  })

  it('rechaza título con más de 255 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      title: 'A'.repeat(256),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza descripción con menos de 10 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      description: 'Corta',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.description).toBeDefined()
    }
  })

  it('rechaza descripción con más de 2000 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      description: 'A'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza timezone inválida', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      timezone: 'America/New_York',
    })
    expect(result.success).toBe(false)
  })

  it('acepta todas las timezones válidas de Argentina', () => {
    const timezones = [
      'America/Argentina/Buenos_Aires',
      'America/Argentina/Cordoba',
      'America/Argentina/Mendoza',
    ] as const

    for (const timezone of timezones) {
      const result = CreateComplexFormSchema.safeParse({
        ...validFormData,
        timezone,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza moneda inválida', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      currency: 'BTC',
    })
    expect(result.success).toBe(false)
  })

  it('acepta todas las monedas válidas del sistema (ARS, USD, EUR)', () => {
    for (const currency of ['ARS', 'USD', 'EUR'] as const) {
      const result = CreateComplexFormSchema.safeParse({
        ...validFormData,
        currency,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza política de cancelación con menos de 5 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      cancellationPolicy: 'No.',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza política de cancelación con más de 255 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      cancellationPolicy: 'A'.repeat(256),
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateComplexFormSchema — Step 2: Dirección y ubicación
// ---------------------------------------------------------------------------

describe('CreateComplexFormSchema — Step 2: Dirección y ubicación', () => {
  it('rechaza calle con menos de 3 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      street: 'Av',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza ciudad con menos de 2 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      city: 'X',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza provincia con menos de 2 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      state: 'X',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza país inválido', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      country: 'US',
    })
    expect(result.success).toBe(false)
  })

  it('acepta zip vacío (opcional)', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      zip: '',
    })
    expect(result.success).toBe(true)
  })

  it('acepta zip undefined (opcional)', () => {
    const { zip: _zip, ...withoutZip } = validFormData
    const result = CreateComplexFormSchema.safeParse(withoutZip)
    expect(result.success).toBe(true)
  })

  it('rechaza latitud fuera del rango válido (-90 a 90)', () => {
    expect(
      CreateComplexFormSchema.safeParse({ ...validFormData, latitude: -91 })
        .success,
    ).toBe(false)
    expect(
      CreateComplexFormSchema.safeParse({ ...validFormData, latitude: 91 })
        .success,
    ).toBe(false)
  })

  it('rechaza longitud fuera del rango válido (-180 a 180)', () => {
    expect(
      CreateComplexFormSchema.safeParse({ ...validFormData, longitude: -181 })
        .success,
    ).toBe(false)
    expect(
      CreateComplexFormSchema.safeParse({ ...validFormData, longitude: 181 })
        .success,
    ).toBe(false)
  })

  it('rechaza latitud igual a 0 (sin ubicación seleccionada)', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      latitude: 0,
    })
    expect(result.success).toBe(false)
  })

  it('rechaza longitud igual a 0 (sin ubicación seleccionada)', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      longitude: 0,
    })
    expect(result.success).toBe(false)
  })

  it('acepta coordenadas válidas de Argentina', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      latitude: -34.6037,
      longitude: -58.3816,
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CreateComplexFormSchema — Step 3: Contacto y redes sociales
// ---------------------------------------------------------------------------

describe('CreateComplexFormSchema — Step 3: Contacto y redes sociales', () => {
  it('rechaza teléfono con menos de 8 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      phone: '1234567',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza teléfono con más de 20 caracteres', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      phone: '1'.repeat(21),
    })
    expect(result.success).toBe(false)
  })

  it('acepta URLs válidas para redes sociales', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      website: 'https://clubcordoba.com',
      facebook: 'https://facebook.com/clubcordoba',
      instagram: 'https://instagram.com/clubcordoba',
      twitter: 'https://twitter.com/clubcordoba',
      youtube: 'https://youtube.com/@clubcordoba',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza URLs inválidas para redes sociales', () => {
    expect(
      CreateComplexFormSchema.safeParse({
        ...validFormData,
        website: 'no-es-una-url',
      }).success,
    ).toBe(false)

    expect(
      CreateComplexFormSchema.safeParse({
        ...validFormData,
        instagram: 'clubcordoba',
      }).success,
    ).toBe(false)
  })

  it('acepta strings vacíos para todos los campos opcionales de redes sociales', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      website: '',
      facebook: '',
      twitter: '',
      instagram: '',
      youtube: '',
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CreateComplexFormSchema — Step 4: Amenidades
// ---------------------------------------------------------------------------

describe('CreateComplexFormSchema — Step 4: Amenidades', () => {
  it('acepta un array vacío de features', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      features: [],
    })
    expect(result.success).toBe(true)
  })

  it('acepta todas las features válidas', () => {
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

    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      features: [...allFeatures],
    })
    expect(result.success).toBe(true)
  })

  it('rechaza features con valores inválidos', () => {
    const result = CreateComplexFormSchema.safeParse({
      ...validFormData,
      features: ['PARKING', 'INVALID_FEATURE'],
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateComplexInputSchema — Estructura anidada para el endpoint ORPC
// ---------------------------------------------------------------------------

describe('CreateComplexInputSchema — Validación del input del endpoint', () => {
  it('acepta input válido completo', () => {
    const result = CreateComplexInputSchema.safeParse(validApiInput)
    expect(result.success).toBe(true)
  })

  it('acepta input sin campos opcionales de contacto', () => {
    const result = CreateComplexInputSchema.safeParse({
      ...validApiInput,
      contact: { phone: '0351-4567890' },
    })
    expect(result.success).toBe(true)
  })

  it('acepta input sin zip en address', () => {
    const result = CreateComplexInputSchema.safeParse({
      ...validApiInput,
      address: {
        street: 'Av. Colón 1234',
        city: 'Córdoba',
        state: 'Córdoba',
        country: 'AR' as const,
      },
    })
    expect(result.success).toBe(true)
  })

  it('aplica default [] para features cuando no se provee', () => {
    const { features: _features, ...withoutFeatures } = validApiInput
    const result = CreateComplexInputSchema.safeParse(withoutFeatures)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.features).toEqual([])
    }
  })

  it('rechaza cuando falta el objeto address', () => {
    const { address: _address, ...withoutAddress } = validApiInput
    const result = CreateComplexInputSchema.safeParse(withoutAddress)
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el objeto contact', () => {
    const { contact: _contact, ...withoutContact } = validApiInput
    const result = CreateComplexInputSchema.safeParse(withoutContact)
    expect(result.success).toBe(false)
  })

  it('rechaza URLs inválidas en contact', () => {
    const result = CreateComplexInputSchema.safeParse({
      ...validApiInput,
      contact: {
        phone: '0351-4567890',
        website: 'no-es-una-url',
      },
    })
    expect(result.success).toBe(false)
  })

  it('rechaza country inválido en address', () => {
    const result = CreateComplexInputSchema.safeParse({
      ...validApiInput,
      address: { ...validApiInput.address, country: 'US' },
    })
    expect(result.success).toBe(false)
  })

  it('rechaza coordenadas fuera de rango', () => {
    expect(
      CreateComplexInputSchema.safeParse({ ...validApiInput, latitude: 91 })
        .success,
    ).toBe(false)
    expect(
      CreateComplexInputSchema.safeParse({ ...validApiInput, longitude: -181 })
        .success,
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateComplexResponseSchema
// ---------------------------------------------------------------------------

describe('CreateComplexResponseSchema', () => {
  it('acepta respuesta válida', () => {
    const result = CreateComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club Deportivo Córdoba',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = CreateComplexResponseSchema.safeParse({
      id: 'not-a-cuid',
      title: 'Club',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta isActive', () => {
    const result = CreateComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club',
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando createdAt no es Date', () => {
    const result = CreateComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club',
      isActive: true,
      createdAt: '2026-03-28',
    })
    expect(result.success).toBe(false)
  })
})
