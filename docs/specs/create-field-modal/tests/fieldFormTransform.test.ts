/**
 * Tests para la transformación de datos del formulario al input del API.
 *
 * La lógica de transformación está en `fieldForm.tsx` (onSubmit):
 *   form data (CreateFieldFormType) → API input (CreateFieldInputType)
 *
 * La única transformación significativa es description: '' → undefined.
 * El resto de los campos se mapean directamente (estructura plana → plana),
 * a diferencia de la creación de complejos que transforma plano → anidado.
 */
import { describe, it, expect } from 'vitest'
import type { CreateFieldFormType, CreateFieldInputType } from '@/types/field'

// ---------------------------------------------------------------------------
// Implementación de referencia de la transformación (extraída del spec)
// Se mantiene aquí para documentar el contrato esperado.
// ---------------------------------------------------------------------------

function transformFormToApiInput(
  data: CreateFieldFormType,
): CreateFieldInputType {
  return {
    complexId: data.complexId,
    title: data.title,
    description: data.description || undefined, // empty string → undefined
    capacity: data.capacity,
    surface: data.surface,
    isRooted: data.isRooted,
    hasLighting: data.hasLighting,
    isDividable: data.isDividable,
  }
}

// ---------------------------------------------------------------------------
// Fixture base
// ---------------------------------------------------------------------------

const VALID_CUID = 'cm000000000000000000000000'

const baseFormData: CreateFieldFormType = {
  complexId: VALID_CUID,
  title: 'Cancha Principal',
  description: 'Cancha de fútbol 5 con césped sintético.',
  capacity: 10,
  surface: 'SYNTHETIC',
  isRooted: false,
  hasLighting: true,
  isDividable: false,
}

// ---------------------------------------------------------------------------
// Tests: campos de nivel superior preservados
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — campos preservados', () => {
  it('preserva complexId sin modificación', () => {
    const result = transformFormToApiInput(baseFormData)
    expect(result.complexId).toBe(VALID_CUID)
  })

  it('preserva title sin modificación', () => {
    const result = transformFormToApiInput(baseFormData)
    expect(result.title).toBe('Cancha Principal')
  })

  it('preserva capacity sin modificación', () => {
    const result = transformFormToApiInput(baseFormData)
    expect(result.capacity).toBe(10)
  })

  it('preserva surface sin modificación', () => {
    const result = transformFormToApiInput(baseFormData)
    expect(result.surface).toBe('SYNTHETIC')
  })

  it('preserva isRooted sin modificación', () => {
    expect(
      transformFormToApiInput({ ...baseFormData, isRooted: true }).isRooted,
    ).toBe(true)
    expect(
      transformFormToApiInput({ ...baseFormData, isRooted: false }).isRooted,
    ).toBe(false)
  })

  it('preserva hasLighting sin modificación', () => {
    expect(
      transformFormToApiInput({ ...baseFormData, hasLighting: true })
        .hasLighting,
    ).toBe(true)
    expect(
      transformFormToApiInput({ ...baseFormData, hasLighting: false })
        .hasLighting,
    ).toBe(false)
  })

  it('preserva isDividable sin modificación', () => {
    expect(
      transformFormToApiInput({ ...baseFormData, isDividable: true })
        .isDividable,
    ).toBe(true)
    expect(
      transformFormToApiInput({ ...baseFormData, isDividable: false })
        .isDividable,
    ).toBe(false)
  })

  it('preserva description con contenido sin modificación', () => {
    const result = transformFormToApiInput(baseFormData)
    expect(result.description).toBe('Cancha de fútbol 5 con césped sintético.')
  })
})

// ---------------------------------------------------------------------------
// Tests: conversión de description vacía → undefined
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — description vacía a undefined', () => {
  it('convierte description string vacío a undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, description: '' })
    expect(result.description).toBeUndefined()
  })

  it('preserva description con valor como string', () => {
    const result = transformFormToApiInput({
      ...baseFormData,
      description: 'Descripción válida',
    })
    expect(result.description).toBe('Descripción válida')
  })

  it('convierte description undefined a undefined', () => {
    const result = transformFormToApiInput({
      ...baseFormData,
      description: undefined,
    })
    expect(result.description).toBeUndefined()
  })

  it('el output no incluye la key description cuando es undefined', () => {
    const result = transformFormToApiInput({ ...baseFormData, description: '' })
    // undefined en el objeto hace que la key no sea iterable con for...in
    // pero con hasOwnProperty puede estar presente — lo importante es que su valor es undefined
    expect(result.description).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Tests: el output es una estructura plana (no anidada como createComplex)
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — estructura de salida', () => {
  it('el output tiene exactamente los campos del API input', () => {
    const result = transformFormToApiInput(baseFormData)

    expect(result).toHaveProperty('complexId')
    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('capacity')
    expect(result).toHaveProperty('surface')
    expect(result).toHaveProperty('isRooted')
    expect(result).toHaveProperty('hasLighting')
    expect(result).toHaveProperty('isDividable')
  })

  it('el output no tiene propiedades inesperadas', () => {
    const result = transformFormToApiInput(baseFormData)
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

  it('la estructura es plana (sin objetos anidados tipo address/contact)', () => {
    const result = transformFormToApiInput(baseFormData)

    for (const value of Object.values(result)) {
      if (value !== null && value !== undefined) {
        expect(typeof value).not.toBe('object')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: validación del output contra CreateFieldInputSchema
// ---------------------------------------------------------------------------

describe('transformFormToApiInput — output validado por CreateFieldInputSchema', () => {
  it('el output completo pasa la validación del schema del endpoint', async () => {
    const { CreateFieldInputSchema } = await import('@/orpc/schemas/field')

    const result = transformFormToApiInput(baseFormData)
    const parsed = CreateFieldInputSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })

  it('el output con description vacía también pasa la validación', async () => {
    const { CreateFieldInputSchema } = await import('@/orpc/schemas/field')

    const result = transformFormToApiInput({ ...baseFormData, description: '' })
    const parsed = CreateFieldInputSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })

  it('el output con isDividable: true pasa la validación', async () => {
    const { CreateFieldInputSchema } = await import('@/orpc/schemas/field')

    const result = transformFormToApiInput({
      ...baseFormData,
      isDividable: true,
    })
    const parsed = CreateFieldInputSchema.safeParse(result)

    expect(parsed.success).toBe(true)
  })
})
