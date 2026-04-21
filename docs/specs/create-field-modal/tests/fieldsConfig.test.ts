/**
 * Tests para las constantes de configuración de canchas.
 *
 * Valida que SURFACE_MAP, SURFACE_VALUES, FIELD_TYPE_MAP, FIELD_TYPE_VALUES
 * y CREATE_FIELD_FORM_DEFAULT_VALUES estén correctamente definidos y sean
 * consistentes entre sí.
 */
import { describe, it, expect } from 'vitest'
import {
  SURFACE_MAP,
  SURFACE_VALUES,
  FIELD_TYPE_MAP,
  FIELD_TYPE_VALUES,
  CREATE_FIELD_FORM_DEFAULT_VALUES,
} from '@/config/fields'

// ---------------------------------------------------------------------------
// SURFACE_MAP / SURFACE_VALUES
// ---------------------------------------------------------------------------

describe('SURFACE_MAP y SURFACE_VALUES', () => {
  it('tienen la misma cantidad de ítems', () => {
    expect(SURFACE_MAP.length).toBe(SURFACE_VALUES.length)
  })

  it('SURFACE_VALUES contiene todos los values de SURFACE_MAP', () => {
    const mapValues = SURFACE_MAP.map((s) => s.value)
    for (const value of mapValues) {
      expect(SURFACE_VALUES).toContain(value)
    }
  })

  it('contiene las 6 superficies esperadas', () => {
    expect(SURFACE_VALUES).toContain('SYNTHETIC')
    expect(SURFACE_VALUES).toContain('NATURAL_GRASS')
    expect(SURFACE_VALUES).toContain('ARTIFICIAL_GRASS')
    expect(SURFACE_VALUES).toContain('CEMENT')
    expect(SURFACE_VALUES).toContain('CLAY')
    expect(SURFACE_VALUES).toContain('WOODEN')
    expect(SURFACE_VALUES.length).toBe(6)
  })

  it('no tiene valores duplicados en SURFACE_VALUES', () => {
    const unique = new Set(SURFACE_VALUES)
    expect(unique.size).toBe(SURFACE_VALUES.length)
  })

  it('cada ítem de SURFACE_MAP tiene value y label no vacíos', () => {
    for (const surface of SURFACE_MAP) {
      expect(surface.value.length).toBeGreaterThan(0)
      expect(surface.label.length).toBeGreaterThan(0)
    }
  })

  it('los labels están en español', () => {
    const syntheticEntry = SURFACE_MAP.find((s) => s.value === 'SYNTHETIC')
    expect(syntheticEntry?.label).toBe('Césped Sintético')

    const cementEntry = SURFACE_MAP.find((s) => s.value === 'CEMENT')
    expect(cementEntry?.label).toBe('Cemento')
  })
})

// ---------------------------------------------------------------------------
// FIELD_TYPE_MAP / FIELD_TYPE_VALUES
// ---------------------------------------------------------------------------

describe('FIELD_TYPE_MAP y FIELD_TYPE_VALUES', () => {
  it('tienen la misma cantidad de ítems', () => {
    expect(FIELD_TYPE_MAP.length).toBe(FIELD_TYPE_VALUES.length)
  })

  it('FIELD_TYPE_VALUES contiene todos los values de FIELD_TYPE_MAP', () => {
    const mapValues = FIELD_TYPE_MAP.map((t) => t.value)
    for (const value of mapValues) {
      expect(FIELD_TYPE_VALUES).toContain(value)
    }
  })

  it('contiene los 3 tipos esperados: FULL, HALF_A, HALF_B', () => {
    expect(FIELD_TYPE_VALUES).toContain('FULL')
    expect(FIELD_TYPE_VALUES).toContain('HALF_A')
    expect(FIELD_TYPE_VALUES).toContain('HALF_B')
    expect(FIELD_TYPE_VALUES.length).toBe(3)
  })

  it('no tiene valores duplicados en FIELD_TYPE_VALUES', () => {
    const unique = new Set(FIELD_TYPE_VALUES)
    expect(unique.size).toBe(FIELD_TYPE_VALUES.length)
  })

  it('cada ítem de FIELD_TYPE_MAP tiene value y label no vacíos', () => {
    for (const fieldType of FIELD_TYPE_MAP) {
      expect(fieldType.value.length).toBeGreaterThan(0)
      expect(fieldType.label.length).toBeGreaterThan(0)
    }
  })

  it('los labels están en español', () => {
    const fullEntry = FIELD_TYPE_MAP.find((t) => t.value === 'FULL')
    expect(fullEntry?.label).toBe('Completa')

    const halfAEntry = FIELD_TYPE_MAP.find((t) => t.value === 'HALF_A')
    expect(halfAEntry?.label).toBe('Mitad A')

    const halfBEntry = FIELD_TYPE_MAP.find((t) => t.value === 'HALF_B')
    expect(halfBEntry?.label).toBe('Mitad B')
  })
})

// ---------------------------------------------------------------------------
// CREATE_FIELD_FORM_DEFAULT_VALUES
// ---------------------------------------------------------------------------

describe('CREATE_FIELD_FORM_DEFAULT_VALUES', () => {
  it('tiene complexId por defecto como string vacío (requiere selección del usuario)', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.complexId).toBe('')
  })

  it('tiene title por defecto como string vacío', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.title).toBe('')
  })

  it('tiene description por defecto como string vacío', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.description).toBe('')
  })

  it('tiene capacity por defecto en 10', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.capacity).toBe(10)
  })

  it('tiene surface por defecto en SYNTHETIC', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.surface).toBe('SYNTHETIC')
  })

  it('tiene isRooted por defecto en false', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.isRooted).toBe(false)
  })

  it('tiene hasLighting por defecto en false', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.hasLighting).toBe(false)
  })

  it('tiene isDividable por defecto en false', () => {
    expect(CREATE_FIELD_FORM_DEFAULT_VALUES.isDividable).toBe(false)
  })

  it('el surface por defecto es un valor válido de SURFACE_VALUES', () => {
    expect(SURFACE_VALUES).toContain(CREATE_FIELD_FORM_DEFAULT_VALUES.surface)
  })

  it('pasa la validación del CreateFieldFormSchema con datos reales (no defaults)', async () => {
    // Los defaults tienen complexId vacío y title vacío — que el schema rechaza.
    // Este test verifica que completando los campos requeridos, el schema acepta el formulario.
    const { CreateFieldFormSchema } = await import('@/orpc/schemas/field')

    const withValidData = {
      ...CREATE_FIELD_FORM_DEFAULT_VALUES,
      complexId: 'cm000000000000000000000000',
      title: 'Cancha de Prueba',
    }

    const result = CreateFieldFormSchema.safeParse(withValidData)
    expect(result.success).toBe(true)
  })

  it('los defaults impiden el submit hasta seleccionar complejo (complexId vacío falla validación)', async () => {
    const { CreateFieldFormSchema } = await import('@/orpc/schemas/field')

    const result = CreateFieldFormSchema.safeParse(
      CREATE_FIELD_FORM_DEFAULT_VALUES,
    )
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.complexId).toBeDefined()
    }
  })
})
