/**
 * Tests para el handler ORPC `deleteField`.
 *
 * Estrategia: mock de `@/db/db` (prisma) para aislar la lógica del handler
 * sin necesitar base de datos real. Se crea un mock del objeto `errors` de
 * ORPC que imita el comportamiento del framework (lanza ORPCError con el
 * código correspondiente).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORPCError, type ORPCErrorCode } from '@orpc/client'

// ---------------------------------------------------------------------------
// Mock de Prisma — debe ir antes del import del handler
// ---------------------------------------------------------------------------

const mockFieldFindUnique = vi.fn()
const mockBookingCount = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    field: {
      findUnique: (...args: unknown[]) => mockFieldFindUnique(...args),
    },
    booking: {
      count: (...args: unknown[]) => mockBookingCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

// Mock de Sentry para que no falle en entorno de test
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
  }
  errors: MockErrors
  context: {
    user: { id: string }
  }
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure sin el middleware stack
// ---------------------------------------------------------------------------

async function invokeDeleteFieldHandler(args: HandlerArgs): Promise<unknown> {
  const { deleteField } = await import('@/orpc/router/field')

  // Duck-typing sobre la implementación interna de oRPC para acceder al handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = deleteField as any
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
}

const mockExistingField = {
  title: 'Cancha Principal',
  isActive: true,
  complex: { ownerId: 'user-123' },
}

const mockDeletedField = {
  id: 'field-abc-123',
  title: 'Cancha Principal',
}

// ---------------------------------------------------------------------------
// Setup por defecto: cancha activa y propia del usuario, sin reservas futuras
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Cancha existe, está activa y pertenece al usuario
  mockFieldFindUnique.mockResolvedValue(mockExistingField)

  // Sin reservas futuras
  mockBookingCount.mockResolvedValue(0)

  // Transacción exitosa
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        field: {
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
          update: vi.fn().mockResolvedValue(mockDeletedField),
        },
      }
      return fn(txMock)
    },
  )
})

// ---------------------------------------------------------------------------
// Tests: verificación de existencia y estado de la cancha
// ---------------------------------------------------------------------------

describe('deleteField handler — verificación de existencia y estado', () => {
  it('lanza NOT_FOUND cuando la cancha no existe', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Cancha no encontrada.',
    })
  })

  it('lanza NOT_FOUND cuando la cancha ya fue eliminada (isActive: false)', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockExistingField,
      isActive: false,
    })

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'La cancha ya fue eliminada.',
    })
  })

  it('lanza FORBIDDEN cuando la cancha pertenece a otro usuario', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockExistingField,
      complex: { ownerId: 'otro-usuario-999' },
    })

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tenés permisos para eliminar esta cancha.',
    })
  })

  it('consulta findUnique con el id del input y los select correctos', async () => {
    await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindUnique).toHaveBeenCalledWith({
      where: { id: validInput.id },
      select: {
        title: true,
        isActive: true,
        complex: {
          select: { ownerId: true },
        },
      },
    })
  })

  it('NO verifica reservas si la cancha no existe', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    try {
      await invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockBookingCount).not.toHaveBeenCalled()
  })

  it('NO ejecuta la transacción si la cancha no existe', async () => {
    mockFieldFindUnique.mockResolvedValue(null)

    try {
      await invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('NO ejecuta la transacción si el ownership falla', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockExistingField,
      complex: { ownerId: 'otro-usuario' },
    })

    try {
      await invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: verificación de reservas activas futuras
// ---------------------------------------------------------------------------

describe('deleteField handler — verificación de reservas futuras', () => {
  it('lanza CONFLICT cuando hay 1 reserva activa futura (mensaje singular)', async () => {
    mockBookingCount.mockResolvedValue(1)

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'No se puede eliminar la cancha porque tiene 1 reserva activa a futuro. Cancelá o completá las reservas primero.',
    })
  })

  it('lanza CONFLICT cuando hay 2 reservas activas futuras (mensaje plural)', async () => {
    mockBookingCount.mockResolvedValue(2)

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'No se puede eliminar la cancha porque tiene 2 reservas activas a futuro. Cancelá o completá las reservas primero.',
    })
  })

  it('lanza CONFLICT cuando hay 5 reservas activas futuras (mensaje plural)', async () => {
    mockBookingCount.mockResolvedValue(5)

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'No se puede eliminar la cancha porque tiene 5 reservas activas a futuro. Cancelá o completá las reservas primero.',
    })
  })

  it('el error de CONFLICT es una instancia de ORPCError', async () => {
    mockBookingCount.mockResolvedValue(3)

    let thrownError: unknown
    try {
      await invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
  })

  it('NO ejecuta la transacción si hay reservas futuras', async () => {
    mockBookingCount.mockResolvedValue(2)

    try {
      await invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('consulta booking.count con los filtros correctos (cancha + sub-canchas, PENDING/CONFIRMED, futuras)', async () => {
    await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockBookingCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          field: {
            OR: [{ id: validInput.id }, { parentFieldId: validInput.id }],
          },
          status: { in: ['PENDING', 'CONFIRMED'] },
        }),
      }),
    )
  })

  it('NO lanza CONFLICT cuando no hay reservas futuras (count = 0)', async () => {
    mockBookingCount.mockResolvedValue(0)

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests: soft delete en cascada (transacción)
// ---------------------------------------------------------------------------

describe('deleteField handler — soft delete en cascada', () => {
  it('retorna respuesta con status 200 y los datos de la cancha eliminada', async () => {
    const result = await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(result).toMatchObject({
      message: 'Cancha eliminada exitosamente',
      status: 200,
      data: {
        id: mockDeletedField.id,
        title: mockDeletedField.title,
      },
    })
  })

  it('llama a updateMany para desactivar sub-canchas (parentFieldId = id)', async () => {
    let capturedUpdateManyArgs: unknown = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockImplementation((args: unknown) => {
              capturedUpdateManyArgs = args
              return Promise.resolve({ count: 2 })
            }),
            update: vi.fn().mockResolvedValue(mockDeletedField),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedUpdateManyArgs).toMatchObject({
      where: { parentFieldId: validInput.id },
      data: { isActive: false },
    })
  })

  it('llama a update para desactivar la cancha principal (isActive: false)', async () => {
    let capturedUpdateArgs: unknown = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            update: vi.fn().mockImplementation((args: unknown) => {
              capturedUpdateArgs = args
              return Promise.resolve(mockDeletedField)
            }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedUpdateArgs).toMatchObject({
      where: { id: validInput.id },
      data: { isActive: false },
      select: { id: true, title: true },
    })
  })

  it('ejecuta updateMany ANTES de update (orden dentro de la transacción)', async () => {
    const callOrder: string[] = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockImplementation(() => {
              callOrder.push('updateMany')
              return Promise.resolve({ count: 0 })
            }),
            update: vi.fn().mockImplementation(() => {
              callOrder.push('update')
              return Promise.resolve(mockDeletedField)
            }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(callOrder).toEqual(['updateMany', 'update'])
  })

  it('updateMany sobre sub-canchas sin sub-canchas existentes es no-op (count: 0)', async () => {
    let updateManyResult: unknown = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockImplementation(() => {
              updateManyResult = { count: 0 }
              return Promise.resolve({ count: 0 })
            }),
            update: vi.fn().mockResolvedValue(mockDeletedField),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    // El handler no falla aunque no haya sub-canchas que actualizar
    expect(updateManyResult).toEqual({ count: 0 })
  })

  it('retorna los datos del field.update (cancha principal), no del updateMany', async () => {
    const specificField = {
      id: 'field-specific-id',
      title: 'Cancha Específica',
    }

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockResolvedValue({ count: 2 }),
            update: vi.fn().mockResolvedValue(specificField),
          },
        }
        return fn(txMock)
      },
    )

    const result = (await invokeDeleteFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as { data: { id: string; title: string } }

    expect(result.data.id).toBe('field-specific-id')
    expect(result.data.title).toBe('Cancha Específica')
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('deleteField handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla al buscar la cancha', async () => {
    mockFieldFindUnique.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando falla el conteo de reservas', async () => {
    mockBookingCount.mockRejectedValue(new Error('DB timeout'))

    await expect(
      invokeDeleteFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando la transacción falla', async () => {
    mockTransaction.mockRejectedValue(new Error('Transaction failed'))

    await expect(
      invokeDeleteFieldHandler({
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
      await invokeDeleteFieldHandler({
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

  it('re-lanza ORPCError de FORBIDDEN sin envolverla en BAD_REQUEST', async () => {
    mockFieldFindUnique.mockResolvedValue({
      ...mockExistingField,
      complex: { ownerId: 'otro-usuario' },
    })

    let thrownError: unknown
    try {
      await invokeDeleteFieldHandler({
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

  it('re-lanza ORPCError de CONFLICT sin envolverla en BAD_REQUEST', async () => {
    mockBookingCount.mockResolvedValue(1)

    let thrownError: unknown
    try {
      await invokeDeleteFieldHandler({
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
})
