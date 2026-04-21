import { describe, it, expect } from 'vitest'
import {
  CreateFieldFormSchema,
  CreateFieldInputSchema,
  CreateFieldResponseSchema,
} from '@/orpc/schemas/field'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CUID = 'cm000000000000000000000000'

const validFormData = {
  complexId: VALID_CUID,
  title: 'Cancha Principal',
  description: 'Cancha de fútbol 5 con césped sintético.',
  capacity: 10,
  surface: 'SYNTHETIC' as const,
  isRooted: false,
  hasLighting: true,
  isDividable: false,
}

const validApiInput = {
  complexId: VALID_CUID,
  title: 'Cancha Principal',
  description: 'Cancha de fútbol 5 con césped sintético.',
  capacity: 10,
  surface: 'SYNTHETIC' as const,
  isRooted: false,
  hasLighting: true,
  isDividable: false,
}

// ---------------------------------------------------------------------------
// CreateFieldFormSchema — complexId
// ---------------------------------------------------------------------------

describe('CreateFieldFormSchema — complexId', () => {
  it('acepta un complexId con formato cuid válido', () => {
    const result = CreateFieldFormSchema.safeParse(validFormData)
    expect(result.success).toBe(true)
  })

  it('rechaza complexId que no es cuid', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      complexId: 'not-a-cuid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.complexId).toBeDefined()
    }
  })

  it('rechaza complexId vacío', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      complexId: '',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateFieldFormSchema — title
// ---------------------------------------------------------------------------

describe('CreateFieldFormSchema — title', () => {
  it('rechaza título con menos de 3 caracteres', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      title: 'AB',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.title).toBeDefined()
    }
  })

  it('acepta título con exactamente 3 caracteres', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      title: 'ABC',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza título con más de 255 caracteres', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      title: 'A'.repeat(256),
    })
    expect(result.success).toBe(false)
  })

  it('acepta título con exactamente 255 caracteres', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      title: 'A'.repeat(255),
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CreateFieldFormSchema — description
// ---------------------------------------------------------------------------

describe('CreateFieldFormSchema — description', () => {
  it('acepta description undefined (campo opcional)', () => {
    const { description: _desc, ...withoutDesc } = validFormData
    const result = CreateFieldFormSchema.safeParse(withoutDesc)
    expect(result.success).toBe(true)
  })

  it('acepta description como string vacío', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      description: '',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza description con más de 2000 caracteres', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      description: 'A'.repeat(2001),
    })
    expect(result.success).toBe(false)
  })

  it('acepta description con exactamente 2000 caracteres', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      description: 'A'.repeat(2000),
    })
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CreateFieldFormSchema — capacity
// ---------------------------------------------------------------------------

describe('CreateFieldFormSchema — capacity', () => {
  it('rechaza capacity menor a 1', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      capacity: 0,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.capacity).toBeDefined()
    }
  })

  it('acepta capacity igual a 1 (mínimo)', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      capacity: 1,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza capacity mayor a 100', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      capacity: 101,
    })
    expect(result.success).toBe(false)
  })

  it('acepta capacity igual a 100 (máximo)', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      capacity: 100,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza capacity con decimales (debe ser entero)', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      capacity: 5.5,
    })
    expect(result.success).toBe(false)
  })

  it('rechaza capacity como string', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      capacity: '10',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateFieldFormSchema — surface
// ---------------------------------------------------------------------------

describe('CreateFieldFormSchema — surface', () => {
  it('acepta todas las superficies válidas', () => {
    const surfaces = [
      'SYNTHETIC',
      'NATURAL_GRASS',
      'ARTIFICIAL_GRASS',
      'CEMENT',
      'CLAY',
      'WOODEN',
    ] as const

    for (const surface of surfaces) {
      const result = CreateFieldFormSchema.safeParse({
        ...validFormData,
        surface,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza superficie inválida', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      surface: 'TARTAN',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza superficie vacía', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      surface: '',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateFieldFormSchema — booleans (isRooted, hasLighting, isDividable)
// ---------------------------------------------------------------------------

describe('CreateFieldFormSchema — booleans', () => {
  it('acepta los tres booleans en true', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      isRooted: true,
      hasLighting: true,
      isDividable: true,
    })
    expect(result.success).toBe(true)
  })

  it('acepta los tres booleans en false', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      isRooted: false,
      hasLighting: false,
      isDividable: false,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza isRooted como string', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      isRooted: 'true',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza isDividable como número', () => {
    const result = CreateFieldFormSchema.safeParse({
      ...validFormData,
      isDividable: 1,
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateFieldInputSchema — API input
// ---------------------------------------------------------------------------

describe('CreateFieldInputSchema — validación del input del endpoint', () => {
  it('acepta input válido completo', () => {
    const result = CreateFieldInputSchema.safeParse(validApiInput)
    expect(result.success).toBe(true)
  })

  it('acepta input sin description (campo opcional)', () => {
    const { description: _desc, ...withoutDesc } = validApiInput
    const result = CreateFieldInputSchema.safeParse(withoutDesc)
    expect(result.success).toBe(true)
  })

  it('aplica default false para isRooted cuando no se provee', () => {
    const { isRooted: _isRooted, ...withoutIsRooted } = validApiInput
    const result = CreateFieldInputSchema.safeParse(withoutIsRooted)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isRooted).toBe(false)
    }
  })

  it('aplica default false para hasLighting cuando no se provee', () => {
    const { hasLighting: _hasLighting, ...withoutHasLighting } = validApiInput
    const result = CreateFieldInputSchema.safeParse(withoutHasLighting)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hasLighting).toBe(false)
    }
  })

  it('aplica default false para isDividable cuando no se provee', () => {
    const { isDividable: _isDividable, ...withoutIsDividable } = validApiInput
    const result = CreateFieldInputSchema.safeParse(withoutIsDividable)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isDividable).toBe(false)
    }
  })

  it('rechaza description como string vacío (debe ser undefined o tener al menos 1 caracter)', () => {
    const result = CreateFieldInputSchema.safeParse({
      ...validApiInput,
      description: '',
    })
    // El input schema rechaza '' — evita almacenar string vacío en BD en vez de null.
    // La conversión '' → undefined ocurre en onSubmit del FieldForm antes de llamar la API.
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta complexId', () => {
    const { complexId: _complexId, ...withoutComplexId } = validApiInput
    const result = CreateFieldInputSchema.safeParse(withoutComplexId)
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta title', () => {
    const { title: _title, ...withoutTitle } = validApiInput
    const result = CreateFieldInputSchema.safeParse(withoutTitle)
    expect(result.success).toBe(false)
  })

  it('rechaza capacity fuera de rango (min 1 max 100)', () => {
    expect(
      CreateFieldInputSchema.safeParse({ ...validApiInput, capacity: 0 })
        .success,
    ).toBe(false)
    expect(
      CreateFieldInputSchema.safeParse({ ...validApiInput, capacity: 101 })
        .success,
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CreateFieldResponseSchema
// ---------------------------------------------------------------------------

describe('CreateFieldResponseSchema', () => {
  it('acepta respuesta válida', () => {
    const result = CreateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha Principal',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = CreateFieldResponseSchema.safeParse({
      id: 'not-a-cuid',
      title: 'Cancha',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta isActive', () => {
    const result = CreateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha',
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando createdAt no es Date', () => {
    const result = CreateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha',
      isActive: true,
      createdAt: '2026-04-05',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta title', () => {
    const result = CreateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })
})
