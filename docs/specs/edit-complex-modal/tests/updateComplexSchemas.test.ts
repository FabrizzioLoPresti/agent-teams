/**
 * Tests para los schemas Zod del flujo de edición de complejo.
 *
 * Cubre:
 *   - `UpdateComplexInputSchema`: extiende CreateComplexInputSchema con `id: z.cuid()`
 *   - `UpdateComplexResponseSchema`: misma forma que CreateComplexResponseSchema
 *   - `ComplexByIdResponseSchema`: ahora incluye `currency`, `latitude`, `longitude`
 */
import { describe, it, expect } from 'vitest'
import {
  UpdateComplexInputSchema,
  UpdateComplexResponseSchema,
  ComplexByIdResponseSchema,
} from '@/orpc/schemas/complex'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validUpdateInput = {
  id: 'cm000000000000000000000000',
  title: 'Club Deportivo Actualizado',
  description: 'Descripción actualizada del complejo deportivo.',
  timezone: 'America/Argentina/Cordoba' as const,
  currency: 'ARS' as const,
  cancellationPolicy: 'Sin cancelaciones 24h antes.',
  latitude: -31.4135,
  longitude: -64.1811,
  address: {
    street: 'Av. Colón 9999',
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
  workingSchedules: [
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
  ],
}

// ---------------------------------------------------------------------------
// UpdateComplexInputSchema — campo `id` adicional
// ---------------------------------------------------------------------------

describe('UpdateComplexInputSchema — campo id', () => {
  it('acepta input válido completo con id', () => {
    const result = UpdateComplexInputSchema.safeParse(validUpdateInput)
    expect(result.success).toBe(true)
  })

  it('rechaza cuando falta el campo id', () => {
    const { id: _id, ...withoutId } = validUpdateInput
    const result = UpdateComplexInputSchema.safeParse(withoutId)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.id).toBeDefined()
    }
  })

  it('rechaza id que no es un cuid válido', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      id: 'not-a-valid-cuid',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza id vacío', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      id: '',
    })
    expect(result.success).toBe(false)
  })

  it('acepta id con formato cuid válido', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      id: 'cm000000000000000000000000',
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// UpdateComplexInputSchema — hereda toda la validación de CreateComplexInputSchema
// ---------------------------------------------------------------------------

describe('UpdateComplexInputSchema — hereda validación de create', () => {
  it('rechaza título con menos de 3 caracteres', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      title: 'AB',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza descripción con menos de 10 caracteres', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      description: 'Corta',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza timezone inválida', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      timezone: 'America/New_York',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza moneda inválida', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      currency: 'BTC',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el objeto address', () => {
    const { address: _address, ...withoutAddress } = validUpdateInput
    const result = UpdateComplexInputSchema.safeParse(withoutAddress)
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el objeto contact', () => {
    const { contact: _contact, ...withoutContact } = validUpdateInput
    const result = UpdateComplexInputSchema.safeParse(withoutContact)
    expect(result.success).toBe(false)
  })

  it('rechaza country inválido en address', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      address: { ...validUpdateInput.address, country: 'US' },
    })
    expect(result.success).toBe(false)
  })

  it('rechaza coordenadas fuera de rango', () => {
    expect(
      UpdateComplexInputSchema.safeParse({
        ...validUpdateInput,
        latitude: 91,
      }).success,
    ).toBe(false)
    expect(
      UpdateComplexInputSchema.safeParse({
        ...validUpdateInput,
        longitude: -181,
      }).success,
    ).toBe(false)
  })

  it('rechaza URLs inválidas en contact', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      contact: {
        phone: '0351-4567890',
        website: 'no-es-url',
      },
    })
    expect(result.success).toBe(false)
  })

  it('acepta input sin campos opcionales de contacto (solo phone)', () => {
    const result = UpdateComplexInputSchema.safeParse({
      ...validUpdateInput,
      contact: { phone: '0351-4567890' },
    })
    expect(result.success).toBe(true)
  })

  it('aplica default [] para features cuando no se provee', () => {
    const { features: _features, ...withoutFeatures } = validUpdateInput
    const result = UpdateComplexInputSchema.safeParse(withoutFeatures)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.features).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// UpdateComplexResponseSchema
// ---------------------------------------------------------------------------

describe('UpdateComplexResponseSchema', () => {
  it('acepta respuesta válida', () => {
    const result = UpdateComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club Deportivo Actualizado',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = UpdateComplexResponseSchema.safeParse({
      id: 'not-a-cuid',
      title: 'Club',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta isActive', () => {
    const result = UpdateComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club',
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando createdAt no es Date', () => {
    const result = UpdateComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club',
      isActive: true,
      createdAt: '2026-03-30',
    })
    expect(result.success).toBe(false)
  })

  it('tiene la misma forma que CreateComplexResponseSchema', async () => {
    const { CreateComplexResponseSchema } = await import(
      '@/orpc/schemas/complex'
    )

    // Verificar que ambos schemas validan los mismos datos
    const responseData = {
      id: 'cm000000000000000000000000',
      title: 'Club Test',
      isActive: true,
      createdAt: new Date(),
    }

    expect(CreateComplexResponseSchema.safeParse(responseData).success).toBe(
      true,
    )
    expect(UpdateComplexResponseSchema.safeParse(responseData).success).toBe(
      true,
    )
  })
})

// ---------------------------------------------------------------------------
// ComplexByIdResponseSchema — campos extendidos para edición
// ---------------------------------------------------------------------------

describe('ComplexByIdResponseSchema — campos extendidos para modo edición', () => {
  const baseComplexById = {
    id: 'cm000000000000000000000000',
    title: 'Club Test',
    description: 'Descripción del club.',
    timezone: 'America/Argentina/Buenos_Aires',
    cancellationPolicy: 'Sin reembolsos.',
    rating: 4.5,
    reviewsCount: 10,
    features: ['PARKING'],
    currency: 'ARS',
    latitude: -31.4135,
    longitude: -64.1811,
    owner: {
      email: 'owner@test.com',
      name: 'Owner Name',
      username: null,
      displayUsername: null,
    },
    complexAddress: null,
    complexContact: null,
    complexImages: [],
    complexTags: [],
    fields: [],
    complexWorkingSchedules: [],
  }

  it('acepta respuesta válida con currency, latitude y longitude', () => {
    const result = ComplexByIdResponseSchema.safeParse(baseComplexById)
    expect(result.success).toBe(true)
  })

  it('rechaza cuando falta el campo currency', () => {
    const { currency: _currency, ...withoutCurrency } = baseComplexById
    const result = ComplexByIdResponseSchema.safeParse(withoutCurrency)
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el campo latitude', () => {
    const { latitude: _latitude, ...withoutLatitude } = baseComplexById
    const result = ComplexByIdResponseSchema.safeParse(withoutLatitude)
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el campo longitude', () => {
    const { longitude: _longitude, ...withoutLongitude } = baseComplexById
    const result = ComplexByIdResponseSchema.safeParse(withoutLongitude)
    expect(result.success).toBe(false)
  })

  it('rechaza currency con valor inválido', () => {
    const result = ComplexByIdResponseSchema.safeParse({
      ...baseComplexById,
      currency: 'BTC',
    })
    expect(result.success).toBe(false)
  })

  it('acepta las monedas válidas del sistema (ARS, USD, EUR)', () => {
    for (const currency of ['ARS', 'USD', 'EUR'] as const) {
      const result = ComplexByIdResponseSchema.safeParse({
        ...baseComplexById,
        currency,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza latitude fuera de rango (-90 a 90)', () => {
    expect(
      ComplexByIdResponseSchema.safeParse({
        ...baseComplexById,
        latitude: -91,
      }).success,
    ).toBe(false)
    expect(
      ComplexByIdResponseSchema.safeParse({
        ...baseComplexById,
        latitude: 91,
      }).success,
    ).toBe(false)
  })

  it('rechaza longitude fuera de rango (-180 a 180)', () => {
    expect(
      ComplexByIdResponseSchema.safeParse({
        ...baseComplexById,
        longitude: -181,
      }).success,
    ).toBe(false)
    expect(
      ComplexByIdResponseSchema.safeParse({
        ...baseComplexById,
        longitude: 181,
      }).success,
    ).toBe(false)
  })

  it('acepta coordenadas válidas de Argentina', () => {
    const result = ComplexByIdResponseSchema.safeParse({
      ...baseComplexById,
      latitude: -34.6037,
      longitude: -58.3816,
    })
    expect(result.success).toBe(true)
  })
})
