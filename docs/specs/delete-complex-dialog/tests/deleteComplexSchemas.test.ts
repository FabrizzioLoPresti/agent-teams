/**
 * Tests para los schemas Zod del flujo de eliminación de complejo.
 *
 * Cubre:
 *   - `DeleteComplexInputSchema`: solo acepta un `id` cuid válido
 *   - `DeleteComplexResponseSchema`: id, title, deletedAt
 */
import { describe, it, expect } from 'vitest'
import {
  DeleteComplexInputSchema,
  DeleteComplexResponseSchema,
} from '@/orpc/schemas/complex'

// ---------------------------------------------------------------------------
// DeleteComplexInputSchema
// ---------------------------------------------------------------------------

describe('DeleteComplexInputSchema', () => {
  it('acepta un id cuid válido', () => {
    const result = DeleteComplexInputSchema.safeParse({
      id: 'cm000000000000000000000000',
    })
    expect(result.success).toBe(true)
  })

  it('rechaza cuando falta el campo id', () => {
    const result = DeleteComplexInputSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.id).toBeDefined()
    }
  })

  it('rechaza id que no es un cuid válido', () => {
    const result = DeleteComplexInputSchema.safeParse({ id: 'not-a-cuid' })
    expect(result.success).toBe(false)
  })

  it('rechaza id vacío', () => {
    const result = DeleteComplexInputSchema.safeParse({ id: '' })
    expect(result.success).toBe(false)
  })

  it('rechaza id numérico', () => {
    const result = DeleteComplexInputSchema.safeParse({ id: 123 })
    expect(result.success).toBe(false)
  })

  it('rechaza campos adicionales no definidos en el schema (strict mode off — solo ignora extras)', () => {
    // Zod strip extra fields by default — el schema sigue siendo válido
    const result = DeleteComplexInputSchema.safeParse({
      id: 'cm000000000000000000000000',
      extra: 'campo_extra',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      // El campo extra no debe estar en el output parseado
      expect('extra' in result.data).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// DeleteComplexResponseSchema
// ---------------------------------------------------------------------------

describe('DeleteComplexResponseSchema', () => {
  it('acepta respuesta válida con id, title y deletedAt', () => {
    const result = DeleteComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club Deportivo Córdoba',
      deletedAt: new Date(),
    })
    expect(result.success).toBe(true)
  })

  it('rechaza id que no es cuid', () => {
    const result = DeleteComplexResponseSchema.safeParse({
      id: 'not-a-cuid',
      title: 'Club',
      deletedAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el campo title', () => {
    const result = DeleteComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      deletedAt: new Date(),
    })
    expect(result.success).toBe(false)
  })

  it('rechaza cuando falta el campo deletedAt', () => {
    const result = DeleteComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club Deportivo Córdoba',
    })
    expect(result.success).toBe(false)
  })

  it('rechaza deletedAt que no es un objeto Date', () => {
    const result = DeleteComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Club Deportivo Córdoba',
      deletedAt: '2026-03-31T10:00:00Z',
    })
    expect(result.success).toBe(false)
  })

  it('acepta deletedAt como Date object con timestamp actual', () => {
    const now = new Date()
    const result = DeleteComplexResponseSchema.safeParse({
      id: 'cm000000000000000000000000',
      title: 'Complejo Test',
      deletedAt: now,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.deletedAt).toEqual(now)
    }
  })
})
