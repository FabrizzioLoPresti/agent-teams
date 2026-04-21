/**
 * Tests para las constantes de configuración del dominio Field.
 *
 * Valida que SURFACE_MAP, SURFACE_VALUES, FIELD_TYPE_MAP y FIELD_TYPE_VALUES
 * estén correctamente definidos, sean consistentes entre sí, y expongan los
 * valores que el dominio requiere (FULL, HALF_A, HALF_B y las 6 superficies).
 */
import { describe, it, expect } from 'vitest'
import {
  SURFACE_MAP,
  SURFACE_VALUES,
  FIELD_TYPE_MAP,
  FIELD_TYPE_VALUES,
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

  it('contiene las 6 superficies del dominio', () => {
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

  it('los labels de superficie están en español', () => {
    const synthetic = SURFACE_MAP.find((s) => s.value === 'SYNTHETIC')
    expect(synthetic?.label).toBe('Césped Sintético')

    const cement = SURFACE_MAP.find((s) => s.value === 'CEMENT')
    expect(cement?.label).toBe('Cemento')

    const clay = SURFACE_MAP.find((s) => s.value === 'CLAY')
    expect(clay?.label).toBe('Arcilla')
  })

  it('cada surface de SURFACE_MAP tiene una entrada en SURFACE_VALUES', () => {
    for (const item of SURFACE_MAP) {
      expect(SURFACE_VALUES).toContain(item.value)
    }
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
    const mapValues = FIELD_TYPE_MAP.map((f) => f.value)
    for (const value of mapValues) {
      expect(FIELD_TYPE_VALUES).toContain(value)
    }
  })

  it('contiene exactamente los 3 tipos de cancha del dominio', () => {
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
    for (const type of FIELD_TYPE_MAP) {
      expect(type.value.length).toBeGreaterThan(0)
      expect(type.label.length).toBeGreaterThan(0)
    }
  })

  it('los labels están en español', () => {
    const full = FIELD_TYPE_MAP.find((t) => t.value === 'FULL')
    expect(full?.label).toBe('Completa')

    const halfA = FIELD_TYPE_MAP.find((t) => t.value === 'HALF_A')
    expect(halfA?.label).toBe('Mitad A')

    const halfB = FIELD_TYPE_MAP.find((t) => t.value === 'HALF_B')
    expect(halfB?.label).toBe('Mitad B')
  })

  it('FULL aparece antes que HALF_A y HALF_B (cancha completa es la entidad principal)', () => {
    const fullIndex = FIELD_TYPE_VALUES.indexOf('FULL')
    const halfAIndex = FIELD_TYPE_VALUES.indexOf('HALF_A')
    const halfBIndex = FIELD_TYPE_VALUES.indexOf('HALF_B')

    expect(fullIndex).toBeLessThan(halfAIndex)
    expect(fullIndex).toBeLessThan(halfBIndex)
  })

  it('HALF_A aparece antes que HALF_B (orden para sub-filas expandibles)', () => {
    const halfAIndex = FIELD_TYPE_VALUES.indexOf('HALF_A')
    const halfBIndex = FIELD_TYPE_VALUES.indexOf('HALF_B')

    expect(halfAIndex).toBeLessThan(halfBIndex)
  })
})

// ---------------------------------------------------------------------------
// Consistencia entre SURFACE_MAP/VALUES y FIELD_TYPE_MAP/VALUES
// ---------------------------------------------------------------------------

describe('Consistencia entre MAP y VALUES', () => {
  it('SURFACE_MAP y SURFACE_VALUES tienen los mismos valores en el mismo orden', () => {
    const mapValues = SURFACE_MAP.map((s) => s.value)
    expect(mapValues).toEqual([...SURFACE_VALUES])
  })

  it('FIELD_TYPE_MAP y FIELD_TYPE_VALUES tienen los mismos valores en el mismo orden', () => {
    const mapValues = FIELD_TYPE_MAP.map((t) => t.value)
    expect(mapValues).toEqual([...FIELD_TYPE_VALUES])
  })
})
