/**
 * Tests para el handler ORPC `deleteComplex`.
 *
 * Estrategia: mock de `@/db/db` (prisma) para aislar la lógica del handler
 * sin necesitar base de datos real. Se testean:
 *   - Verificación de existencia, isActive y ownership (NOT_FOUND, FORBIDDEN)
 *   - Verificación de reservas activas futuras (CONFLICT con mensaje pluralizado)
 *   - Soft delete exitoso en transacción: fields + complex
 *   - Optimización: no se cuentan bookings si no hay fields activos
 *   - Manejo de errores inesperados de Prisma
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORPCError, type ORPCErrorCode } from '@orpc/client'

// ---------------------------------------------------------------------------
// Mock de Prisma — debe ir antes del import del handler
// ---------------------------------------------------------------------------

const mockFindUnique = vi.fn()
const mockBookingCount = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    complex: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    booking: {
      count: (...args: unknown[]) => mockBookingCount(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
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
  input: { id: string }
  errors: MockErrors
  context: { user: { id: string } }
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure sin el middleware stack
// ---------------------------------------------------------------------------

async function invokeDeleteComplexHandler(args: HandlerArgs): Promise<unknown> {
  const { deleteComplex } = await import('@/orpc/router/complex')

  // Duck-typing sobre la implementación interna de oRPC para acceder al handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = deleteComplex as any
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

const OWNER_USER_ID = 'user-owner-123'
const COMPLEX_ID = 'cm_complex_to_delete_001'

const mockContext: HandlerArgs['context'] = {
  user: { id: OWNER_USER_ID },
}

const validInput: HandlerArgs['input'] = { id: COMPLEX_ID }

const mockExistingComplex = {
  ownerId: OWNER_USER_ID,
  title: 'Club Deportivo Córdoba',
  isActive: true,
  fields: [{ id: 'field-1' }, { id: 'field-2' }],
}

const mockDeletedComplex = {
  id: COMPLEX_ID,
  title: 'Club Deportivo Córdoba',
  deletedAt: new Date('2026-03-31T10:00:00Z'),
}

// ---------------------------------------------------------------------------
// Setup por defecto: complejo existe, usuario es owner, sin reservas activas
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  mockFindUnique.mockResolvedValue(mockExistingComplex)
  mockBookingCount.mockResolvedValue(0)

  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        field: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        complex: {
          update: vi.fn().mockResolvedValue(mockDeletedComplex),
        },
      }
      return fn(txMock)
    },
  )
})

// ---------------------------------------------------------------------------
// Tests: verificación de existencia
// ---------------------------------------------------------------------------

describe('deleteComplex handler — verificación de existencia', () => {
  it('lanza NOT_FOUND cuando el complejo no existe', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Complejo no encontrado.',
    })
  })

  it('el error de NOT_FOUND es instancia de ORPCError', async () => {
    mockFindUnique.mockResolvedValue(null)

    let thrownError: unknown
    try {
      await invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
    expect((thrownError as AnyORPCError).code).toBe('NOT_FOUND')
  })

  it('lanza NOT_FOUND cuando el complejo ya está eliminado (isActive: false)', async () => {
    mockFindUnique.mockResolvedValue({ ...mockExistingComplex, isActive: false })

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'El complejo ya fue eliminado.',
    })
  })

  it('busca el complejo por el ID del input con select de ownerId, title, isActive y fields activos', async () => {
    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COMPLEX_ID },
        select: expect.objectContaining({
          ownerId: true,
          title: true,
          isActive: true,
          fields: expect.objectContaining({
            where: { isActive: true },
          }),
        }),
      }),
    )
  })

  it('NO ejecuta booking.count ni la transacción si el complejo no existe', async () => {
    mockFindUnique.mockResolvedValue(null)

    try {
      await invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockBookingCount).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: verificación de ownership
// ---------------------------------------------------------------------------

describe('deleteComplex handler — verificación de ownership', () => {
  it('lanza FORBIDDEN cuando el usuario no es el owner', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: 'otro-usuario-456',
    })

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tenés permisos para eliminar este complejo.',
    })
  })

  it('el error de FORBIDDEN es instancia de ORPCError', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: 'otro-usuario-456',
    })

    let thrownError: unknown
    try {
      await invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
    expect((thrownError as AnyORPCError).code).toBe('FORBIDDEN')
  })

  it('NO ejecuta la transacción si el usuario no es el owner', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: 'otro-usuario-456',
    })

    try {
      await invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('permite la eliminación cuando el userId del context coincide con ownerId', async () => {
    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: { user: { id: OWNER_USER_ID } },
      }),
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests: verificación de reservas activas
// ---------------------------------------------------------------------------

describe('deleteComplex handler — verificación de reservas activas', () => {
  it('lanza CONFLICT cuando hay 1 reserva activa futura', async () => {
    mockBookingCount.mockResolvedValue(1)

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'No se puede eliminar el complejo porque tiene 1 reserva activa a futuro. Cancelá o completá las reservas primero.',
    })
  })

  it('lanza CONFLICT cuando hay múltiples reservas activas (mensaje pluralizado)', async () => {
    mockBookingCount.mockResolvedValue(3)

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'No se puede eliminar el complejo porque tiene 3 reservas activas a futuro. Cancelá o completá las reservas primero.',
    })
  })

  it('el mensaje con 1 reserva usa singular (reserva activa, sin "s")', async () => {
    mockBookingCount.mockResolvedValue(1)

    let thrownError: unknown
    try {
      await invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    const message = (thrownError as AnyORPCError).message
    expect(message).toContain('1 reserva activa')
    expect(message).not.toContain('1 reservas')
  })

  it('el mensaje con 2+ reservas usa plural (reservas activas, con "s")', async () => {
    mockBookingCount.mockResolvedValue(2)

    let thrownError: unknown
    try {
      await invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    const message = (thrownError as AnyORPCError).message
    expect(message).toContain('2 reservas activas')
  })

  it('NO lanza CONFLICT cuando no hay reservas activas (count = 0)', async () => {
    mockBookingCount.mockResolvedValue(0)

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).resolves.not.toThrow()
  })

  it('NO ejecuta booking.count si el complejo no tiene fields activos', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      fields: [], // sin canchas activas
    })

    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockBookingCount).not.toHaveBeenCalled()
  })

  it('consulta bookings filtrando por fieldIds activos, status PENDING/CONFIRMED y startDateTime futuro', async () => {
    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockBookingCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fieldId: { in: ['field-1', 'field-2'] },
          status: { in: ['PENDING', 'CONFIRMED'] },
          startDateTime: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      }),
    )
  })

  it('NO ejecuta la transacción si hay reservas activas futuras', async () => {
    mockBookingCount.mockResolvedValue(5)

    try {
      await invokeDeleteComplexHandler({
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
// Tests: soft delete exitoso
// ---------------------------------------------------------------------------

describe('deleteComplex handler — soft delete exitoso', () => {
  it('retorna la respuesta con status 200 y los datos del complejo eliminado', async () => {
    const result = await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(result).toMatchObject({
      message: 'Complejo eliminado exitosamente',
      status: 200,
      data: {
        id: mockDeletedComplex.id,
        title: mockDeletedComplex.title,
        deletedAt: mockDeletedComplex.deletedAt,
      },
    })
  })

  it('marca el complejo con isActive: false, deletedAt y deletedBy en la transacción', async () => {
    let capturedComplexData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
          complex: {
            update: vi.fn().mockImplementation(
              ({ data }: { data: Record<string, unknown> }) => {
                capturedComplexData = data
                return Promise.resolve(mockDeletedComplex)
              },
            ),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedComplexData).toMatchObject({
      isActive: false,
      deletedBy: OWNER_USER_ID,
      deletedAt: expect.any(Date),
    })
  })

  it('desactiva todos los fields activos del complejo en la misma transacción', async () => {
    let capturedFieldArgs: unknown = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockImplementation((args: unknown) => {
              capturedFieldArgs = args
              return Promise.resolve({ count: 2 })
            }),
          },
          complex: {
            update: vi.fn().mockResolvedValue(mockDeletedComplex),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedFieldArgs).toMatchObject({
      where: { complexId: COMPLEX_ID, isActive: true },
      data: { isActive: false },
    })
  })

  it('NO llama a field.updateMany si el complejo no tiene fields activos', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      fields: [],
    })

    let fieldUpdateManyCalled = false

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockImplementation(() => {
              fieldUpdateManyCalled = true
              return Promise.resolve({ count: 0 })
            }),
          },
          complex: {
            update: vi.fn().mockResolvedValue(mockDeletedComplex),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(fieldUpdateManyCalled).toBe(false)
  })

  it('ejecuta field.updateMany antes de complex.update (orden correcto en transacción)', async () => {
    const callOrder: string[] = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            updateMany: vi.fn().mockImplementation(() => {
              callOrder.push('field.updateMany')
              return Promise.resolve({ count: 2 })
            }),
          },
          complex: {
            update: vi.fn().mockImplementation(() => {
              callOrder.push('complex.update')
              return Promise.resolve(mockDeletedComplex)
            }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(callOrder).toEqual(['field.updateMany', 'complex.update'])
  })

  it('usa el userId del context como deletedBy', async () => {
    let capturedData: Record<string, unknown> | null = null
    const CUSTOM_USER_ID = 'user-custom-789'

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          complex: {
            update: vi.fn().mockImplementation(
              ({ data }: { data: Record<string, unknown> }) => {
                capturedData = data
                return Promise.resolve(mockDeletedComplex)
              },
            ),
          },
        }
        return fn(txMock)
      },
    )

    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: CUSTOM_USER_ID,
      fields: [],
    })

    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: { user: { id: CUSTOM_USER_ID } },
    })

    expect(capturedData).toMatchObject({ deletedBy: CUSTOM_USER_ID })
  })

  it('hace select de id, title y deletedAt en el update del complejo', async () => {
    let capturedUpdateArgs: unknown = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
          complex: {
            update: vi.fn().mockImplementation((args: unknown) => {
              capturedUpdateArgs = args
              return Promise.resolve(mockDeletedComplex)
            }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeDeleteComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedUpdateArgs).toMatchObject({
      select: { id: true, title: true, deletedAt: true },
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('deleteComplex handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla en findUnique', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando Prisma falla en booking.count', async () => {
    mockBookingCount.mockRejectedValue(new Error('DB error on booking count'))

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando la transacción falla', async () => {
    mockTransaction.mockRejectedValue(new Error('Transaction failed'))

    await expect(
      invokeDeleteComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST (NOT_FOUND se preserva)', async () => {
    mockFindUnique.mockResolvedValue(null)

    let thrownError: unknown
    try {
      await invokeDeleteComplexHandler({
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

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST (FORBIDDEN se preserva)', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: 'otro-usuario',
    })

    let thrownError: unknown
    try {
      await invokeDeleteComplexHandler({
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

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST (CONFLICT se preserva)', async () => {
    mockBookingCount.mockResolvedValue(2)

    let thrownError: unknown
    try {
      await invokeDeleteComplexHandler({
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
