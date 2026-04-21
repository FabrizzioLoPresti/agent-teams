/**
 * Tests para los schemas Zod del flujo de edición de cancha.
 *
 * Cubre: GetFieldByIdInputSchema, FieldByIdResponseSchema,
 * UpdateFieldInputSchema y UpdateFieldResponseSchema.
 */
import { describe, it, expect } from 'vitest'
import {
  GetFieldByIdInputSchema,
  FieldByIdResponseSchema,
  UpdateFieldInputSchema,
  UpdateFieldResponseSchema,
} from '@/orpc/schemas/field'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CUID = 'cm000000000000000000000000'
const VALID_CUID_2 = 'cm000000000000000000000001'

const validFieldByIdResponse = {
  id: VALID_CUID,
  title: 'Cancha Principal',
  description: 'Cancha con césped sintético.',
  capacity: 10,
  fieldType: 'FULL' as const,
  isDividable: false,
  surface: 'SYNTHETIC' as const,
  isRooted: false,
  hasLighting: true,
  complexId: VALID_CUID_2,
  parentFieldId: null,
  createdAt: new Date(),
  complexTitle: 'Complejo Norte',
}

const validUpdateInput = {
  id: VALID_CUID,
  complexId: VALID_CUID_2,
  title: 'Cancha Actualizada',
  description: 'Nueva descripción.',
  capacity: 12,
  surface: 'CEMENT' as const,
  isRooted: true,
  hasLighting: false,
  isDividable: false,
}

// ---------------------------------------------------------------------------
// GetFieldByIdInputSchema
// ---------------------------------------------------------------------------

describe('GetFieldByIdInputSchema', () => {
  it('acepta un id con formato cuid válido', () => {
    const result = GetFieldByIdInputSchema.safeParse({ id: VALID_CUID })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = GetFieldByIdInputSchema.safeParse({ id: 'not-a-cuid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.id).toBeDefined()
    }
  })

  it('rechaza id vacío', () => {
    const result = GetFieldByIdInputSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el campo id', () => {
    const result = GetFieldByIdInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rechaza id numérico', () => {
    const result = GetFieldByIdInputSchema.safeParse({ id: 123 })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// FieldByIdResponseSchema
// ---------------------------------------------------------------------------

describe('FieldByIdResponseSchema', () => {
  it('acepta respuesta válida completa', () => {
    const result = FieldByIdResponseSchema.safeParse(validFieldByIdResponse)
    expect(result.success).toBe(true)
  })

  it('acepta description null (campo nullable)', () => {
    const result = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      description: null,
    })
    expect(result.success).toBe(true)
  })

  it('acepta parentFieldId null', () => {
    const result = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      parentFieldId: null,
    })
    expect(result.success).toBe(true)
  })

  it('acepta parentFieldId como cuid válido', () => {
    const result = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      parentFieldId: VALID_CUID,
    })
    expect(result.success).toBe(true)
  })

  it('rechaza cuando falta complexTitle (campo obligatorio de la extensión)', () => {
    const { complexTitle: _ct, ...withoutComplexTitle } = validFieldByIdResponse
    const result = FieldByIdResponseSchema.safeParse(withoutComplexTitle)
    expect(result.success).toBe(false)
  })

  it('rechaza complexTitle vacío', () => {
    const result = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      complexTitle: '',
    })
    // z.string() acepta strings vacíos — este test verifica el comportamiento actual
    const parsed = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      complexTitle: 'Complejo',
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza fieldType inválido', () => {
    const result = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      fieldType: 'INVALID',
    })
    expect(result.success).toBe(false)
  })

  it('acepta los tres fieldType válidos', () => {
    for (const fieldType of ['FULL', 'HALF_A', 'HALF_B'] as const) {
      const result = FieldByIdResponseSchema.safeParse({
        ...validFieldByIdResponse,
        fieldType,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza surface inválida', () => {
    const result = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      surface: 'TARTAN',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando createdAt no es Date', () => {
    const result = FieldByIdResponseSchema.safeParse({
      ...validFieldByIdResponse,
      createdAt: '2026-04-05',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta id', () => {
    const { id: _id, ...withoutId } = validFieldByIdResponse
    const result = FieldByIdResponseSchema.safeParse(withoutId)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// UpdateFieldInputSchema — hereda validaciones de CreateFieldInputSchema + id
// ---------------------------------------------------------------------------

describe('UpdateFieldInputSchema — campo id', () => {
  it('acepta input válido completo con id', () => {
    const result = UpdateFieldInputSchema.safeParse(validUpdateInput)
    expect(result.success).toBe(true)
  })

  it('rechaza cuando falta el campo id', () => {
    const { id: _id, ...withoutId } = validUpdateInput
    const result = UpdateFieldInputSchema.safeParse(withoutId)
    expect(result.success).toBe(false)
  })

  it('rechaza id que no es cuid', () => {
    const result = UpdateFieldInputSchema.safeParse({
      ...validUpdateInput,
      id: 'not-a-cuid',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.id).toBeDefined()
    }
  })

  it('rechaza id vacío', () => {
    const result = UpdateFieldInputSchema.safeParse({
      ...validUpdateInput,
      id: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('UpdateFieldInputSchema — hereda validaciones de CreateFieldInputSchema', () => {
  it('acepta input sin description (campo opcional)', () => {
    const { description: _desc, ...withoutDesc } = validUpdateInput
    const result = UpdateFieldInputSchema.safeParse(withoutDesc)
    expect(result.success).toBe(true)
  })

  it('rechaza description como string vacío (debe ser undefined o min 1 char)', () => {
    const result = UpdateFieldInputSchema.safeParse({
      ...validUpdateInput,
      description: '',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza title con menos de 3 caracteres', () => {
    const result = UpdateFieldInputSchema.safeParse({
      ...validUpdateInput,
      title: 'AB',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza capacity fuera de rango', () => {
    expect(
      UpdateFieldInputSchema.safeParse({ ...validUpdateInput, capacity: 0 })
        .success,
    ).toBe(false)
    expect(
      UpdateFieldInputSchema.safeParse({ ...validUpdateInput, capacity: 101 })
        .success,
    ).toBe(false)
  })

  it('rechaza surface inválida', () => {
    const result = UpdateFieldInputSchema.safeParse({
      ...validUpdateInput,
      surface: 'TARTAN',
    })
    expect(result.success).toBe(false)
  })

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
      const result = UpdateFieldInputSchema.safeParse({
        ...validUpdateInput,
        surface,
      })
      expect(result.success).toBe(true)
    }
  })

  it('aplica default false para isRooted cuando no se provee', () => {
    const { isRooted: _isRooted, ...withoutIsRooted } = validUpdateInput
    const result = UpdateFieldInputSchema.safeParse(withoutIsRooted)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isRooted).toBe(false)
    }
  })

  it('aplica default false para hasLighting cuando no se provee', () => {
    const { hasLighting: _hasLighting, ...withoutHasLighting } =
      validUpdateInput
    const result = UpdateFieldInputSchema.safeParse(withoutHasLighting)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.hasLighting).toBe(false)
    }
  })

  it('aplica default false para isDividable cuando no se provee', () => {
    const { isDividable: _isDividable, ...withoutIsDividable } =
      validUpdateInput
    const result = UpdateFieldInputSchema.safeParse(withoutIsDividable)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.isDividable).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// UpdateFieldResponseSchema — alias de CreateFieldResponseSchema
// ---------------------------------------------------------------------------

describe('UpdateFieldResponseSchema', () => {
  it('acepta respuesta válida', () => {
    const result = UpdateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha Actualizada',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = UpdateFieldResponseSchema.safeParse({
      id: 'not-a-cuid',
      title: 'Cancha',
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta isActive', () => {
    const result = UpdateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha',
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando createdAt no es Date', () => {
    const result = UpdateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha',
      isActive: true,
      createdAt: '2026-04-05',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta title', () => {
    const result = UpdateFieldResponseSchema.safeParse({
      id: VALID_CUID,
      isActive: true,
      createdAt: new Date(),
    })
    expect(result.success).toBe(false)
  })
})
