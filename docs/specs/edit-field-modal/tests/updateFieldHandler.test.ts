/**
 * Tests para el handler ORPC `updateField`.
 *
 * Estrategia: mock de `@/db/db` (prisma) para aislar la lógica del handler.
 * El handler verifica existencia + isActive + ownership, luego unicidad de
 * título (excluyendo self via id: { not: input.id }), y finalmente actualiza
 * solo los campos editables (NO fieldType ni complexId).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORPCError, type ORPCErrorCode } from '@orpc/client'

// ---------------------------------------------------------------------------
// Mock de Prisma — debe ir antes del import del handler
// ---------------------------------------------------------------------------

const mockFieldFindUnique = vi.fn()
const mockFieldFindFirst = vi.fn()
const mockFieldUpdate = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    field: {
      findUnique: (...args: unknown[]) => mockFieldFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFieldFindFirst(...args),
      update: (...args: unknown[]) => mockFieldUpdate(...args),
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
  FORBIDDEN: (opts: { message: string }) => AnyORPCError
  CONFLICT: (opts: { message: string }) => AnyORPCError
  BAD_REQUEST: (opts?: { message?: string }) => AnyORPCError
}

type HandlerArgs = {
  input: {
    id: string
    complexId: string
    title: string
    description?: string
    capacity: number
    surface: string
    isRooted: boolean
    hasLighting: boolean
    isDividable: boolean
  }
  errors: MockErrors
  context: { user: { id: string } }
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure
// ---------------------------------------------------------------------------

async function invokeUpdateFieldHandler(args: HandlerArgs): Promise<unknown> {
  const { updateField } = await import('@/orpc/router/field')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = updateField as any
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
    FORBIDDEN: ({ message }: { message: string }): AnyORPCError =>
      new ORPCError('FORBIDDEN', { message }),
    CONFLICT: ({ message }: { message: string }): AnyORPCError =>
      new ORPCError('CONFLICT', { message }),
    BAD_REQUEST: (opts?: { message?: string }): AnyORPCError =>
      new ORPCError('BAD_REQUEST', { message: opts?.message }),
  }
}

const mockContext: HandlerArgs['context'] = {
  user: { id: 'user-123' },
}

const validInput: HandlerArgs['input'] = {
  id: 'field-abc-123',
  complexId: 'complex-abc-456',
  title: 'Cancha Actualizada',
  description: 'Nueva descripción.',
  capacity: 12,
  surface: 'CEMENT',
  isRooted: true,
  hasLighting: false,
  isDividable: false,
}

const mockExistingField = {
  isActive: true,
  complex: { ownerId: 'user-123' },
}

const mockUpdatedField = {
  id: 'field-abc-123',
  title: 'Cancha Actualizada',
  isActive: true,
  createdAt: new Date('2026-04-05T10:00:00Z'),
}

// ---------------------------------------------------------------------------
// Setup por defecto: cancha activa y propia, sin duplicado de título
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockFieldFindUnique.mockResolvedValue(mockExistingField)
  mockFieldFindFirst.mockResolvedValue(null)
  mockFieldUpdate.mockResolvedValue(mockUpdatedField)
})

// ---------------------------------------------------------------------------
// Tests: verificación de existencia y estado
// ---------------------------------------------------------------------------

describe('updateField handler — verificación de existencia y estado', () => {
  it('lanza NOT_FOUND cuando la cancha no existe', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Cancha no encontrada.',
    })
  })

  it('lanza NOT_FOUND cuando la cancha está inactiva', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockExistingField,
      isActive: false,
    })

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Cancha no encontrada.',
    })
  })

  it('NO ejecuta la verificación de unicidad si la cancha no existe', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    try {
      await invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockFieldFindFirst).not.toHaveBeenCalled()
  })

  it('NO ejecuta el update si la cancha no existe', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    try {
      await invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockFieldUpdate).not.toHaveBeenCalled()
  })

  it('consulta findUnique con el id del input', async () => {
    await invokeUpdateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindUnique).toHaveBeenCalledWith({
      where: { id: validInput.id },
      select: {
        isActive: true,
        complex: { select: { ownerId: true } },
      },
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: verificación de ownership
// ---------------------------------------------------------------------------

describe('updateField handler — verificación de ownership', () => {
  it('lanza FORBIDDEN cuando la cancha pertenece a otro usuario', async () => {
    mockFieldFindUnique.mockResolvedValue({
      isActive: true,
      complex: { ownerId: 'otro-usuario-999' },
    })

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tenés permisos para editar esta cancha.',
    })
  })

  it('NO ejecuta el update cuando el ownership falla', async () => {
    mockFieldFindUnique.mockResolvedValue({
      isActive: true,
      complex: { ownerId: 'otro-usuario-999' },
    })

    try {
      await invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockFieldUpdate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: unicidad de título (excluyendo self)
// ---------------------------------------------------------------------------

describe('updateField handler — unicidad de título', () => {
  it('lanza CONFLICT cuando existe otra cancha con el mismo nombre en el complejo', async () => {
    mockFieldFindFirst.mockResolvedValue({ id: 'otra-cancha-789' })

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Ya existe una cancha con ese nombre en este complejo.',
    })
  })

  it('NO lanza CONFLICT cuando la única cancha con ese título es la misma cancha (self)', async () => {
    // findFirst retorna null → no hay duplicado (self está excluido)
    mockFieldFindFirst.mockResolvedValue(null)

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).resolves.not.toThrow()
  })

  it('consulta findFirst con complexId + title + isActive: true + id: { not: input.id }', async () => {
    await invokeUpdateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindFirst).toHaveBeenCalledWith({
      where: {
        complexId: validInput.complexId,
        title: validInput.title,
        isActive: true,
        id: { not: validInput.id },
      },
      select: { id: true },
    })
  })

  it('NO ejecuta el update si hay CONFLICT de título', async () => {
    mockFieldFindFirst.mockResolvedValue({ id: 'otra-cancha-789' })

    try {
      await invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockFieldUpdate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: actualización de la cancha
// ---------------------------------------------------------------------------

describe('updateField handler — campos actualizados', () => {
  it('retorna respuesta con status 200 y datos de la cancha actualizada', async () => {
    const result = await invokeUpdateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(result).toMatchObject({
      message: 'Cancha actualizada exitosamente',
      status: 200,
      data: {
        id: mockUpdatedField.id,
        title: mockUpdatedField.title,
        isActive: true,
        createdAt: mockUpdatedField.createdAt,
      },
    })
  })

  it('actualiza title, description, capacity, surface, isRooted, hasLighting, isDividable', async () => {
    await invokeUpdateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: validInput.id },
        data: expect.objectContaining({
          title: validInput.title,
          description: validInput.description,
          capacity: validInput.capacity,
          surface: validInput.surface,
          isRooted: validInput.isRooted,
          hasLighting: validInput.hasLighting,
          isDividable: validInput.isDividable,
        }),
      }),
    )
  })

  it('NO actualiza fieldType (no está en el data del update)', async () => {
    await invokeUpdateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    const updateCall = mockFieldUpdate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(updateCall.data).not.toHaveProperty('fieldType')
  })

  it('NO actualiza complexId (no está en el data del update)', async () => {
    await invokeUpdateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    const updateCall = mockFieldUpdate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(updateCall.data).not.toHaveProperty('complexId')
  })

  it('convierte description undefined a null en la BD', async () => {
    const { description: _desc, ...withoutDesc } = validInput

    await invokeUpdateFieldHandler({
      input: withoutDesc,
      errors: createMockErrors(),
      context: mockContext,
    })

    const updateCall = mockFieldUpdate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(updateCall.data.description).toBeNull()
  })

  it('selecciona id, title, isActive y createdAt en el update', async () => {
    await invokeUpdateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          title: true,
          isActive: true,
          createdAt: true,
        },
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('updateField handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla al buscar la cancha', async () => {
    mockFieldFindUnique.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando falla la verificación de unicidad', async () => {
    mockFieldFindFirst.mockRejectedValue(new Error('DB timeout'))

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando falla el update de Prisma', async () => {
    mockFieldUpdate.mockRejectedValue(new Error('Update failed'))

    await expect(
      invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST (CONFLICT se preserva)', async () => {
    mockFieldFindFirst.mockResolvedValue({ id: 'otra-cancha' })

    let thrownError: unknown
    try {
      await invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect((thrownError as AnyORPCError).code).toBe('CONFLICT')
    expect((thrownError as AnyORPCError).code).not.toBe('BAD_REQUEST')
  })

  it('re-lanza ORPCError de FORBIDDEN sin envolverla en BAD_REQUEST', async () => {
    mockFieldFindUnique.mockResolvedValue({
      isActive: true,
      complex: { ownerId: 'otro-usuario' },
    })

    let thrownError: unknown
    try {
      await invokeUpdateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect((thrownError as AnyORPCError).code).toBe('FORBIDDEN')
    expect((thrownError as AnyORPCError).code).not.toBe('BAD_REQUEST')
  })
})
