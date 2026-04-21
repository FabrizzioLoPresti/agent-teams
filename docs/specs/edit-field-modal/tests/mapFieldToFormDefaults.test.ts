/**
 * Tests para el helper `mapFieldToFormDefaults`.
 *
 * Mapea los datos de `FieldByIdResponseType` (respuesta del servidor)
 * a `CreateFieldFormType` (valores por defecto del formulario de edición).
 *
 * La única transformación no trivial es description: null → ''.
 * El resto de campos se mapean directamente.
 */
import { describe, it, expect } from 'vitest'
import { mapFieldToFormDefaults } from '@/utils/fields'
import type { FieldByIdResponseType } from '@/types/field'

// ---------------------------------------------------------------------------
// Fixture base
// ---------------------------------------------------------------------------

const VALID_CUID = 'cm000000000000000000000000'
const VALID_CUID_2 = 'cm000000000000000000000001'

const baseField: FieldByIdResponseType = {
  id: VALID_CUID,
  title: 'Cancha Principal',
  description: 'Cancha de fútbol 5 con césped sintético.',
  capacity: 10,
  fieldType: 'FULL',
  isDividable: false,
  surface: 'SYNTHETIC',
  isRooted: false,
  hasLighting: true,
  complexId: VALID_CUID_2,
  complexTitle: 'Complejo Norte',
  parentFieldId: null,
  createdAt: new Date('2026-04-05T10:00:00Z'),
}

// ---------------------------------------------------------------------------
// Tests: mapeo de campos
// ---------------------------------------------------------------------------

describe('mapFieldToFormDefaults — campos mapeados directamente', () => {
  it('mapea complexId correctamente', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result.complexId).toBe(VALID_CUID_2)
  })

  it('mapea title correctamente', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result.title).toBe('Cancha Principal')
  })

  it('mapea description con valor correctamente', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result.description).toBe('Cancha de fútbol 5 con césped sintético.')
  })

  it('mapea capacity correctamente', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result.capacity).toBe(10)
  })

  it('mapea surface correctamente', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result.surface).toBe('SYNTHETIC')
  })

  it('mapea isRooted correctamente', () => {
    expect(
      mapFieldToFormDefaults({ ...baseField, isRooted: true }).isRooted,
    ).toBe(true)
    expect(
      mapFieldToFormDefaults({ ...baseField, isRooted: false }).isRooted,
    ).toBe(false)
  })

  it('mapea hasLighting correctamente', () => {
    expect(
      mapFieldToFormDefaults({ ...baseField, hasLighting: true }).hasLighting,
    ).toBe(true)
    expect(
      mapFieldToFormDefaults({ ...baseField, hasLighting: false }).hasLighting,
    ).toBe(false)
  })

  it('mapea isDividable correctamente', () => {
    expect(
      mapFieldToFormDefaults({ ...baseField, isDividable: true }).isDividable,
    ).toBe(true)
    expect(
      mapFieldToFormDefaults({ ...baseField, isDividable: false }).isDividable,
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: transformación de description null → ''
// ---------------------------------------------------------------------------

describe('mapFieldToFormDefaults — description null a string vacío', () => {
  it('convierte description null a string vacío', () => {
    const result = mapFieldToFormDefaults({ ...baseField, description: null })
    expect(result.description).toBe('')
  })

  it('preserva description con valor como string', () => {
    const result = mapFieldToFormDefaults({
      ...baseField,
      description: 'Descripción válida',
    })
    expect(result.description).toBe('Descripción válida')
  })

  it('description en el output es siempre string (nunca null)', () => {
    const result = mapFieldToFormDefaults({ ...baseField, description: null })
    expect(typeof result.description).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Tests: campos NO incluidos en el output del form
// ---------------------------------------------------------------------------

describe('mapFieldToFormDefaults — campos excluidos del formulario', () => {
  it('no incluye id en el output (el form no necesita el id de la cancha)', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result).not.toHaveProperty('id')
  })

  it('no incluye complexTitle en el output (es solo para display, el form usa complexId)', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result).not.toHaveProperty('complexTitle')
  })

  it('no incluye fieldType en el output (no editable)', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result).not.toHaveProperty('fieldType')
  })

  it('no incluye parentFieldId en el output', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result).not.toHaveProperty('parentFieldId')
  })

  it('no incluye createdAt en el output', () => {
    const result = mapFieldToFormDefaults(baseField)
    expect(result).not.toHaveProperty('createdAt')
  })
})

// ---------------------------------------------------------------------------
// Tests: el output pasa la validación de CreateFieldFormSchema
// ---------------------------------------------------------------------------

describe('mapFieldToFormDefaults — output validado por CreateFieldFormSchema', () => {
  it('el output con description válida pasa el schema del formulario', async () => {
    const { CreateFieldFormSchema } = await import('@/orpc/schemas/field')

    const result = mapFieldToFormDefaults(baseField)
    const parsed = CreateFieldFormSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })

  it('el output con description null (→ string vacío) pasa el schema del formulario', async () => {
    const { CreateFieldFormSchema } = await import('@/orpc/schemas/field')

    const result = mapFieldToFormDefaults({ ...baseField, description: null })
    const parsed = CreateFieldFormSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })

  it('el output pasa el schema con todas las superficies válidas', async () => {
    const { CreateFieldFormSchema } = await import('@/orpc/schemas/field')
    const surfaces = [
      'SYNTHETIC',
      'NATURAL_GRASS',
      'ARTIFICIAL_GRASS',
      'CEMENT',
      'CLAY',
      'WOODEN',
    ] as const

    for (const surface of surfaces) {
      const result = mapFieldToFormDefaults({ ...baseField, surface })
      const parsed = CreateFieldFormSchema.safeParse(result)
      expect(parsed.success).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: estructura del output
// ---------------------------------------------------------------------------

describe('mapFieldToFormDefaults — estructura del output', () => {
  it('el output tiene exactamente los campos de CreateFieldFormType', () => {
    const result = mapFieldToFormDefaults(baseField)

    const expectedKeys = [
      'complexId',
      'title',
      'description',
      'capacity',
      'surface',
      'isRooted',
      'hasLighting',
      'isDividable',
    ]

    for (const key of expectedKeys) {
      expect(result).toHaveProperty(key)
    }
  })

  it('el output no tiene propiedades inesperadas', () => {
    const result = mapFieldToFormDefaults(baseField)
    const expectedKeys = [
      'complexId',
      'title',
      'description',
      'capacity',
      'surface',
      'isRooted',
      'hasLighting',
      'isDividable',
    ]

    for (const key of Object.keys(result)) {
      expect(expectedKeys).toContain(key)
    }
  })
})
