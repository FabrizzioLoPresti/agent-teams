/**
 * Tests para el handler ORPC `getFieldById`.
 *
 * Estrategia: mock de `@/db/db` (prisma) para aislar la lógica del handler.
 * El handler verifica existencia, isActive y ownership (sin revelar existencia
 * al usuario incorrecto — devuelve NOT_FOUND en lugar de FORBIDDEN).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORPCError, type ORPCErrorCode } from '@orpc/client'

// ---------------------------------------------------------------------------
// Mock de Prisma — debe ir antes del import del handler
// ---------------------------------------------------------------------------

const mockFieldFindUnique = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    field: {
      findUnique: (...args: unknown[]) => mockFieldFindUnique(...args),
    },
  },
}))

vi.mock('@sentry/tanstackstart-react', () => ({
  startSpan: (_opts: unknown, fn: () => unknown) => fn(),
}))

// ---------------------------------------------------------------------------
// Tipos locales
// ---------------------------------------------------------------------------

type AnyORPCError = ORPCError<ORPCErrorCode, unknown>

type MockErrors = {
  NOT_FOUND: (opts: { message: string }) => AnyORPCError
  BAD_REQUEST: (opts?: { message?: string }) => AnyORPCError
}

type HandlerArgs = {
  input: { id: string }
  errors: MockErrors
  context: { user: { id: string } }
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure
// ---------------------------------------------------------------------------

async function invokeGetFieldByIdHandler(args: HandlerArgs): Promise<unknown> {
  const { getFieldById } = await import('@/orpc/router/field')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = getFieldById as any
  const handler: ((args: HandlerArgs) => Promise<unknown>) | undefined =
    procedure['~orpc']?.handler ?? procedure.handler

  if (typeof handler !== 'function') {
    throw new Error(
      'No se pudo acceder al handler interno del procedure. ' +
        'Verificar que la API de oRPC no haya cambiado.',
    )
  }

  return handler(args)
}

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockErrors(): MockErrors {
  return {
    NOT_FOUND: ({ message }: { message: string }): AnyORPCError =>
      new ORPCError('NOT_FOUND', { message }),
    BAD_REQUEST: (opts?: { message?: string }): AnyORPCError =>
      new ORPCError('BAD_REQUEST', { message: opts?.message }),
  }
}

const mockContext: HandlerArgs['context'] = {
  user: { id: 'user-123' },
}

const validInput: HandlerArgs['input'] = {
  id: 'field-abc-123',
}

const mockField = {
  id: 'field-abc-123',
  title: 'Cancha Principal',
  description: 'Cancha con césped sintético.',
  capacity: 10,
  fieldType: 'FULL',
  isDividable: false,
  surface: 'SYNTHETIC',
  isRooted: false,
  hasLighting: true,
  complexId: 'complex-abc-456',
  parentFieldId: null,
  createdAt: new Date('2026-04-05T10:00:00Z'),
  complex: {
    title: 'Complejo Norte',
    ownerId: 'user-123',
  },
}

// ---------------------------------------------------------------------------
// Setup por defecto: cancha activa y propiedad del usuario
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockFieldFindUnique.mockResolvedValue(mockField)
})

// ---------------------------------------------------------------------------
// Tests: verificación de existencia y ownership
// ---------------------------------------------------------------------------

describe('getFieldById handler — verificación de existencia', () => {
  it('lanza NOT_FOUND cuando la cancha no existe', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    await expect(
      invokeGetFieldByIdHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Cancha no encontrada.',
    })
  })

  it('el error es una instancia de ORPCError', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    let thrownError: unknown
    try {
      await invokeGetFieldByIdHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
  })

  it('consulta findUnique con id del input y filtro isActive: true', async () => {
    await invokeGetFieldByIdHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validInput.id, isActive: true },
      }),
    )
  })

  it('selecciona complex.title y complex.ownerId para verificar ownership', async () => {
    await invokeGetFieldByIdHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          complex: expect.objectContaining({
            select: expect.objectContaining({
              title: true,
              ownerId: true,
            }),
          }),
        }),
      }),
    )
  })
})

describe('getFieldById handler — verificación de ownership', () => {
  it('lanza NOT_FOUND cuando la cancha pertenece a otro usuario (no revelar existencia)', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockField,
      complex: { ...mockField.complex, ownerId: 'otro-usuario-999' },
    })

    await expect(
      invokeGetFieldByIdHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Cancha no encontrada.',
    })
  })

  it('NO lanza FORBIDDEN (ownership falla → NOT_FOUND, nunca FORBIDDEN)', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockField,
      complex: { ...mockField.complex, ownerId: 'otro-usuario-999' },
    })

    let thrownError: unknown
    try {
      await invokeGetFieldByIdHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect((thrownError as AnyORPCError).code).toBe('NOT_FOUND')
    expect((thrownError as AnyORPCError).code).not.toBe('FORBIDDEN')
  })
})

// ---------------------------------------------------------------------------
// Tests: respuesta exitosa
// ---------------------------------------------------------------------------

describe('getFieldById handler — respuesta exitosa', () => {
  it('retorna todos los campos del schema de respuesta', async () => {
    const result = (await invokeGetFieldByIdHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as Record<string, unknown>

    expect(result).toMatchObject({
      id: mockField.id,
      title: mockField.title,
      description: mockField.description,
      capacity: mockField.capacity,
      fieldType: mockField.fieldType,
      isDividable: mockField.isDividable,
      surface: mockField.surface,
      isRooted: mockField.isRooted,
      hasLighting: mockField.hasLighting,
      complexId: mockField.complexId,
      parentFieldId: mockField.parentFieldId,
      createdAt: mockField.createdAt,
      complexTitle: mockField.complex.title,
    })
  })

  it('incluye complexTitle desnormalizado (de complex.title)', async () => {
    const result = (await invokeGetFieldByIdHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as Record<string, unknown>

    expect(result.complexTitle).toBe('Complejo Norte')
  })

  it('retorna description null cuando la cancha no tiene descripción', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockField,
      description: null,
    })

    const result = (await invokeGetFieldByIdHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as Record<string, unknown>

    expect(result.description).toBeNull()
  })

  it('retorna parentFieldId null para canchas FULL sin padre', async () => {
    const result = (await invokeGetFieldByIdHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as Record<string, unknown>

    expect(result.parentFieldId).toBeNull()
  })

  it('retorna parentFieldId cuando la cancha es mitad (HALF_A/HALF_B)', async () => {
    const parentId = 'parent-field-xyz'
    mockFieldFindUnique.mockResolvedValue({
      ...mockField,
      fieldType: 'HALF_A',
      parentFieldId: parentId,
    })

    const result = (await invokeGetFieldByIdHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as Record<string, unknown>

    expect(result.parentFieldId).toBe(parentId)
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('getFieldById handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla', async () => {
    mockFieldFindUnique.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeGetFieldByIdHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST (NOT_FOUND se preserva)', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    let thrownError: unknown
    try {
      await invokeGetFieldByIdHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect((thrownError as AnyORPCError).code).toBe('NOT_FOUND')
    expect((thrownError as AnyORPCError).code).not.toBe('BAD_REQUEST')
  })
})
