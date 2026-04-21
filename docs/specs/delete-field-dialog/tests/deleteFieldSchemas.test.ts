import { describe, it, expect } from 'vitest'
import {
  DeleteFieldInputSchema,
  DeleteFieldResponseSchema,
} from '@/orpc/schemas/field'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CUID = 'cm000000000000000000000000'

// ---------------------------------------------------------------------------
// DeleteFieldInputSchema
// ---------------------------------------------------------------------------

describe('DeleteFieldInputSchema — id', () => {
  it('acepta un id con formato cuid válido', () => {
    const result = DeleteFieldInputSchema.safeParse({ id: VALID_CUID })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = DeleteFieldInputSchema.safeParse({ id: 'not-a-cuid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.id).toBeDefined()
    }
  })

  it('rechaza id vacío', () => {
    const result = DeleteFieldInputSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })

  it('rechaza id como número', () => {
    const result = DeleteFieldInputSchema.safeParse({ id: 123 })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el campo id', () => {
    const result = DeleteFieldInputSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rechaza campos adicionales no esperados (strict off — solo valida id)', () => {
    // Zod por defecto hace strip de campos extra, no rechaza
    const result = DeleteFieldInputSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha Extra',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // El campo extra es strippeado
      expect(result.data).toEqual({ id: VALID_CUID })
    }
  })

  it('el output contiene exactamente el campo id', () => {
    const result = DeleteFieldInputSchema.safeParse({ id: VALID_CUID })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(Object.keys(result.data)).toEqual(['id'])
      expect(result.data.id).toBe(VALID_CUID)
    }
  })
})

// ---------------------------------------------------------------------------
// DeleteFieldResponseSchema
// ---------------------------------------------------------------------------

describe('DeleteFieldResponseSchema', () => {
  it('acepta respuesta válida con id y title', () => {
    const result = DeleteFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha Principal',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = DeleteFieldResponseSchema.safeParse({
      id: 'not-a-cuid',
      title: 'Cancha Principal',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta id', () => {
    const result = DeleteFieldResponseSchema.safeParse({
      title: 'Cancha Principal',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta title', () => {
    const result = DeleteFieldResponseSchema.safeParse({
      id: VALID_CUID,
    })
    expect(result.success).toBe(false)
  })

  it('rechaza title como número', () => {
    const result = DeleteFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 42,
    })
    expect(result.success).toBe(false)
  })

  it('acepta title como string vacío (FieldSchema no impone min length en title base)', () => {
    const result = DeleteFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: '',
    })
    expect(result.success).toBe(true)
  })

  it('NO incluye campos de auditoría como deletedAt o isActive (Field no los tiene)', () => {
    // La respuesta de delete solo incluye id y title — no isActive (soft delete solo)
    const result = DeleteFieldResponseSchema.safeParse({
      id: VALID_CUID,
      title: 'Cancha Principal',
      isActive: false,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // isActive es strippeado — no está en el schema
      expect(result.data).not.toHaveProperty('isActive')
    }
  })
})
