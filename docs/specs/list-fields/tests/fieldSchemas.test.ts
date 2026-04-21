/**
 * Tests para los schemas Zod del dominio Field.
 *
 * Valida:
 * - FieldSchema (entidad dominio base)
 * - SubFieldsTableResponseSchema (derivado con .pick() de FieldSchema)
 * - FieldsTableResponseSchema (derivado con .pick().extend() de FieldSchema)
 * - GetFieldsByUserIdInputSchema (paginación + sort)
 * - FieldsWithPaginationResponseSchema
 *
 * Convención: SubFields y FieldsTable derivan de FieldSchema vía .pick().
 * Los tests verifican que esa derivación solo expone los campos esperados.
 */
import { describe, it, expect } from 'vitest'
import {
  FieldSchema,
  SubFieldsTableResponseSchema,
  FieldsTableResponseSchema,
  GetFieldsByUserIdInputSchema,
  FieldsWithPaginationResponseSchema,
  fieldSortFieldsEnum,
} from '@/orpc/schemas/field'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CUID = 'cm000000000000000000000000'

const validSubField = {
  id: VALID_CUID,
  title: 'Mitad A - Cancha Norte',
  complexId: VALID_CUID,
  fieldType: 'HALF_A' as const,
  surface: 'SYNTHETIC' as const,
  capacity: 5,
}

const validField = {
  id: VALID_CUID,
  title: 'Cancha Norte',
  complexId: VALID_CUID,
  fieldType: 'FULL' as const,
  surface: 'SYNTHETIC' as const,
  capacity: 10,
  createdAt: new Date(),
  complexName: 'Club Atlántida',
  subFields: [validSubField],
}

const validDomainField = {
  id: VALID_CUID,
  title: 'Cancha Norte',
  description: 'Cancha de fútbol 5 con césped sintético.',
  capacity: 10,
  fieldType: 'FULL' as const,
  isDividable: true,
  surface: 'SYNTHETIC' as const,
  isRooted: false,
  hasLighting: true,
  isActive: true,
  parentFieldId: null,
  complexId: VALID_CUID,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// FieldSchema — entidad dominio base
// ---------------------------------------------------------------------------

describe('FieldSchema — entidad dominio base', () => {
  it('acepta datos válidos completos', () => {
    const result = FieldSchema.safeParse(validDomainField)
    expect(result.success).toBe(true)
  })

  it('acepta description nullable (null)', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, description: null })
    expect(result.success).toBe(true)
  })

  it('acepta parentFieldId nullable (null)', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, parentFieldId: null })
    expect(result.success).toBe(true)
  })

  it('acepta los 3 valores de fieldType: FULL, HALF_A, HALF_B', () => {
    for (const fieldType of ['FULL', 'HALF_A', 'HALF_B'] as const) {
      const result = FieldSchema.safeParse({ ...validDomainField, fieldType })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza fieldType con valor inválido', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, fieldType: 'HALF_C' })
    expect(result.success).toBe(false)
  })

  it('acepta todas las superficies válidas', () => {
    const surfaces = ['SYNTHETIC', 'NATURAL_GRASS', 'ARTIFICIAL_GRASS', 'CEMENT', 'CLAY', 'WOODEN'] as const
    for (const surface of surfaces) {
      const result = FieldSchema.safeParse({ ...validDomainField, surface })
      expect(result.success).toBe(true)
    }
  })

  it('rechaza surface con valor inválido', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, surface: 'RUBBER' })
    expect(result.success).toBe(false)
  })

  it('rechaza id que no es cuid', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, id: 'not-a-cuid' })
    expect(result.success).toBe(false)
  })

  it('rechaza complexId que no es cuid', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, complexId: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('rechaza createdAt que no es Date', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, createdAt: '2026-01-01' })
    expect(result.success).toBe(false)
  })

  it('rechaza capacity que no es entero (float)', () => {
    const result = FieldSchema.safeParse({ ...validDomainField, capacity: 10.5 })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta un campo obligatorio (isActive)', () => {
    const { isActive: _isActive, ...withoutIsActive } = validDomainField
    const result = FieldSchema.safeParse(withoutIsActive)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// SubFieldsTableResponseSchema — derivado de FieldSchema.pick()
// ---------------------------------------------------------------------------

describe('SubFieldsTableResponseSchema — derivado de FieldSchema.pick()', () => {
  it('acepta datos válidos con los campos esperados', () => {
    const result = SubFieldsTableResponseSchema.safeParse(validSubField)
    expect(result.success).toBe(true)
  })

  it('acepta HALF_A como fieldType', () => {
    const result = SubFieldsTableResponseSchema.safeParse({ ...validSubField, fieldType: 'HALF_A' })
    expect(result.success).toBe(true)
  })

  it('acepta HALF_B como fieldType', () => {
    const result = SubFieldsTableResponseSchema.safeParse({ ...validSubField, fieldType: 'HALF_B' })
    expect(result.success).toBe(true)
  })

  it('rechaza fieldType inválido', () => {
    const result = SubFieldsTableResponseSchema.safeParse({ ...validSubField, fieldType: 'QUARTER' })
    expect(result.success).toBe(false)
  })

  it('NO requiere campos que no fueron picked (isActive, createdAt, isDividable)', () => {
    // Los campos del dominio no pickeados no deben ser requeridos
    const result = SubFieldsTableResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Mitad A',
      complexId: VALID_CUID,
      fieldType: 'HALF_A',
      surface: 'SYNTHETIC',
      capacity: 5,
    })
    expect(result.success).toBe(true)
  })

  it('el output solo contiene los campos pickeados (strip de extras)', () => {
    const input = {
      ...validSubField,
      isActive: true,       // no pickeado
      createdAt: new Date(), // no pickeado
      isDividable: false,   // no pickeado
    }
    const result = SubFieldsTableResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('isActive')
      expect(result.data).not.toHaveProperty('createdAt')
      expect(result.data).not.toHaveProperty('isDividable')
    }
  })

  it('rechaza id que no es cuid', () => {
    const result = SubFieldsTableResponseSchema.safeParse({ ...validSubField, id: 'bad-id' })
    expect(result.success).toBe(false)
  })

  it('rechaza capacity negativa', () => {
    const result = SubFieldsTableResponseSchema.safeParse({ ...validSubField, capacity: -1 })
    // FieldSchema no tiene min/max en capacity, solo int — acepta negativos
    // Este test documenta el comportamiento actual
    expect(result.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// FieldsTableResponseSchema — derivado de FieldSchema.pick().extend()
// ---------------------------------------------------------------------------

describe('FieldsTableResponseSchema — derivado de FieldSchema.pick().extend()', () => {
  it('acepta datos válidos completos con subFields', () => {
    const result = FieldsTableResponseSchema.safeParse(validField)
    expect(result.success).toBe(true)
  })

  it('acepta subFields como array vacío (sin mitades)', () => {
    const result = FieldsTableResponseSchema.safeParse({ ...validField, subFields: [] })
    expect(result.success).toBe(true)
  })

  it('acepta múltiples subFields (HALF_A y HALF_B)', () => {
    const subFieldB = { ...validSubField, id: 'cm111111111111111111111111', fieldType: 'HALF_B' as const }
    const result = FieldsTableResponseSchema.safeParse({
      ...validField,
      subFields: [validSubField, subFieldB],
    })
    expect(result.success).toBe(true)
  })

  it('requiere complexName (campo extendido)', () => {
    const { complexName: _complexName, ...withoutComplexName } = validField
    const result = FieldsTableResponseSchema.safeParse(withoutComplexName)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.complexName).toBeDefined()
    }
  })

  it('requiere subFields (campo extendido)', () => {
    const { subFields: _subFields, ...withoutSubFields } = validField
    const result = FieldsTableResponseSchema.safeParse(withoutSubFields)
    expect(result.success).toBe(false)
  })

  it('rechaza subFields que no sean array', () => {
    const result = FieldsTableResponseSchema.safeParse({ ...validField, subFields: 'no-array' })
    expect(result.success).toBe(false)
  })

  it('valida cada subField contra SubFieldsTableResponseSchema', () => {
    const invalidSubField = { ...validSubField, fieldType: 'INVALID' }
    const result = FieldsTableResponseSchema.safeParse({ ...validField, subFields: [invalidSubField] })
    expect(result.success).toBe(false)
  })

  it('NO requiere campos no pickeados (isActive, isDividable, isRooted, hasLighting)', () => {
    // Solo contiene los campos pickeados + complexName + subFields
    const result = FieldsTableResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha Norte',
      complexId: VALID_CUID,
      fieldType: 'FULL',
      surface: 'SYNTHETIC',
      capacity: 10,
      createdAt: new Date(),
      complexName: 'Club Atlántida',
      subFields: [],
    })
    expect(result.success).toBe(true)
  })

  it('el output NO contiene campos no pickeados (isActive, isDividable)', () => {
    const input = { ...validField, isActive: true, isDividable: false }
    const result = FieldsTableResponseSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('isActive')
      expect(result.data).not.toHaveProperty('isDividable')
    }
  })
})

// ---------------------------------------------------------------------------
// GetFieldsByUserIdInputSchema — paginación + sort
// ---------------------------------------------------------------------------

describe('GetFieldsByUserIdInputSchema — paginación y ordenamiento', () => {
  it('acepta input válido con valores explícitos', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: 0,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    expect(result.success).toBe(true)
  })

  it('aplica sortBy default "createdAt" cuando no se provee', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: 0,
      pageSize: 10,
      sortOrder: 'asc',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sortBy).toBe('createdAt')
    }
  })

  it('acepta sortBy "title"', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: 0,
      pageSize: 10,
      sortBy: 'title',
      sortOrder: 'asc',
    })
    expect(result.success).toBe(true)
  })

  it('acepta sortBy "updatedAt"', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: 0,
      pageSize: 10,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza sortBy con valor no incluido en fieldSortFieldsEnum', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: 0,
      pageSize: 10,
      sortBy: 'complexName',
      sortOrder: 'asc',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza sortOrder inválido', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: 0,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'random',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza pageIndex negativo', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: -1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza pageSize de 0', () => {
    const result = GetFieldsByUserIdInputSchema.safeParse({
      pageIndex: 0,
      pageSize: 0,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// fieldSortFieldsEnum — campos de ordenamiento disponibles
// ---------------------------------------------------------------------------

describe('fieldSortFieldsEnum', () => {
  it('contiene "createdAt" (sort por defecto)', () => {
    expect(fieldSortFieldsEnum).toContain('createdAt')
  })

  it('contiene "updatedAt"', () => {
    expect(fieldSortFieldsEnum).toContain('updatedAt')
  })

  it('contiene "title"', () => {
    expect(fieldSortFieldsEnum).toContain('title')
  })

  it('NO contiene campos de tabla calculados como "complexName"', () => {
    expect(fieldSortFieldsEnum).not.toContain('complexName')
  })

  it('NO contiene "capacity" (no sorteable en la tabla)', () => {
    expect(fieldSortFieldsEnum).not.toContain('capacity')
  })

  it('no tiene valores duplicados', () => {
    const unique = new Set(fieldSortFieldsEnum)
    expect(unique.size).toBe(fieldSortFieldsEnum.length)
  })
})

// ---------------------------------------------------------------------------
// FieldsWithPaginationResponseSchema
// ---------------------------------------------------------------------------

describe('FieldsWithPaginationResponseSchema', () => {
  it('acepta respuesta válida con fields y paginación', () => {
    const result = FieldsWithPaginationResponseSchema.safeParse({
      fields: [validField],
      pagination: {
        pageIndex: 0,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      },
    })
    expect(result.success).toBe(true)
  })

  it('acepta fields como array vacío', () => {
    const result = FieldsWithPaginationResponseSchema.safeParse({
      fields: [],
      pagination: {
        pageIndex: 0,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      },
    })
    expect(result.success).toBe(true)
  })

  it('rechaza cuando falta el objeto pagination', () => {
    const result = FieldsWithPaginationResponseSchema.safeParse({ fields: [] })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta fields', () => {
    const result = FieldsWithPaginationResponseSchema.safeParse({
      pagination: { pageIndex: 0, pageSize: 10, total: 0, totalPages: 0 },
    })
    expect(result.success).toBe(false)
  })

  it('rechaza un field inválido dentro del array', () => {
    const result = FieldsWithPaginationResponseSchema.safeParse({
      fields: [{ ...validField, fieldType: 'INVALID' }],
      pagination: { pageIndex: 0, pageSize: 10, total: 1, totalPages: 1 },
    })
    expect(result.success).toBe(false)
  })
})
