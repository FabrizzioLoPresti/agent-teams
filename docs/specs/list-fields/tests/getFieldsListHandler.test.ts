/**
 * Tests para el handler ORPC `getFieldsList`.
 *
 * Estrategia: mock de `@/db/db` (prisma) para aislar la lógica del handler
 * sin necesitar base de datos real. Se usa la misma técnica de duck-typing
 * sobre `~orpc` para acceder al handler interno del procedure.
 *
 * Comportamientos clave a verificar:
 * - Solo retorna canchas con fieldType: 'FULL'
 * - Filtra por isActive: true y complex.ownerId: userId
 * - Incluye subFields anidados (mitades)
 * - Calcula totalPages correctamente
 * - Aplica paginación con skip/take
 * - Mapea complexName desde complex.title
 * - Ejecuta count y findMany en paralelo (Promise.all)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORPCError, type ORPCErrorCode } from '@orpc/client'

// ---------------------------------------------------------------------------
// Mock de Prisma — debe ir antes del import del handler
// ---------------------------------------------------------------------------

const mockFieldCount = vi.fn()
const mockFieldFindMany = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    field: {
      count: (...args: unknown[]) => mockFieldCount(...args),
      findMany: (...args: unknown[]) => mockFieldFindMany(...args),
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
  BAD_REQUEST: (opts?: { message?: string }) => AnyORPCError
  NOT_FOUND: (opts?: { message?: string }) => AnyORPCError
  FORBIDDEN: (opts?: { message?: string }) => AnyORPCError
}

type HandlerInput = {
  pageIndex: number
  pageSize: number
  sortBy: string
  sortOrder: string
}

type HandlerArgs = {
  input: HandlerInput
  errors: MockErrors
  context: { user: { id: string } }
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure sin el middleware stack
// ---------------------------------------------------------------------------

async function invokeGetFieldsListHandler(args: HandlerArgs): Promise<unknown> {
  const { getFieldsList } = await import('@/orpc/router/field')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = getFieldsList as any
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
    BAD_REQUEST: (opts?: { message?: string }): AnyORPCError =>
      new ORPCError('BAD_REQUEST', { message: opts?.message }),
    NOT_FOUND: (opts?: { message?: string }): AnyORPCError =>
      new ORPCError('NOT_FOUND', { message: opts?.message }),
    FORBIDDEN: (opts?: { message?: string }): AnyORPCError =>
      new ORPCError('FORBIDDEN', { message: opts?.message }),
  }
}

const mockContext: HandlerArgs['context'] = {
  user: { id: 'user-owner-123' },
}

const defaultInput: HandlerInput = {
  pageIndex: 0,
  pageSize: 10,
  sortBy: 'createdAt',
  sortOrder: 'desc',
}

const mockFullField = {
  id: 'cm_field_001',
  title: 'Cancha Norte',
  complexId: 'cm_complex_001',
  complex: { title: 'Club Atlántida' },
  fieldType: 'FULL',
  surface: 'SYNTHETIC',
  capacity: 10,
  createdAt: new Date('2026-01-15T10:00:00Z'),
  subFields: [
    {
      id: 'cm_sub_001',
      title: 'Mitad A - Cancha Norte',
      complexId: 'cm_complex_001',
      fieldType: 'HALF_A',
      surface: 'SYNTHETIC',
      capacity: 5,
    },
    {
      id: 'cm_sub_002',
      title: 'Mitad B - Cancha Norte',
      complexId: 'cm_complex_001',
      fieldType: 'HALF_B',
      surface: 'SYNTHETIC',
      capacity: 5,
    },
  ],
}

// ---------------------------------------------------------------------------
// Setup por defecto: 1 cancha FULL, sin subfields
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  mockFieldCount.mockResolvedValue(1)
  mockFieldFindMany.mockResolvedValue([mockFullField])
})

// ---------------------------------------------------------------------------
// Tests: filtros WHERE
// ---------------------------------------------------------------------------

describe('getFieldsList handler — filtros WHERE', () => {
  it('filtra solo canchas con fieldType: FULL', async () => {
    await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fieldType: 'FULL',
        }),
      }),
    )
  })

  it('filtra solo canchas activas (isActive: true)', async () => {
    await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
        }),
      }),
    )
  })

  it('filtra por ownerId del context.user.id', async () => {
    await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: { user: { id: 'user-xyz-456' } },
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          complex: expect.objectContaining({
            ownerId: 'user-xyz-456',
          }),
        }),
      }),
    )
  })

  it('filtra por complejos activos (complex.isActive: true)', async () => {
    await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          complex: expect.objectContaining({
            isActive: true,
          }),
        }),
      }),
    )
  })

  it('aplica el mismo WHERE para count y findMany', async () => {
    await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    const countWhere = mockFieldCount.mock.calls[0][0].where
    const findManyWhere = mockFieldFindMany.mock.calls[0][0].where

    expect(countWhere).toEqual(findManyWhere)
  })
})

// ---------------------------------------------------------------------------
// Tests: paginación
// ---------------------------------------------------------------------------

describe('getFieldsList handler — paginación', () => {
  it('aplica skip = pageIndex * pageSize', async () => {
    await invokeGetFieldsListHandler({
      input: { ...defaultInput, pageIndex: 2, pageSize: 5 },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    )
  })

  it('aplica skip = 0 para la primera página (pageIndex: 0)', async () => {
    await invokeGetFieldsListHandler({
      input: { ...defaultInput, pageIndex: 0, pageSize: 10 },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 10 }),
    )
  })

  it('calcula totalPages correctamente (Math.ceil)', async () => {
    mockFieldCount.mockResolvedValue(25)

    const result = (await invokeGetFieldsListHandler({
      input: { ...defaultInput, pageSize: 10 },
      errors: createMockErrors(),
      context: mockContext,
    })) as { data: { pagination: { totalPages: number; total: number } } }

    expect(result.data.pagination.totalPages).toBe(3) // Math.ceil(25/10)
    expect(result.data.pagination.total).toBe(25)
  })

  it('retorna totalPages: 0 cuando no hay canchas', async () => {
    mockFieldCount.mockResolvedValue(0)
    mockFieldFindMany.mockResolvedValue([])

    const result = (await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as { data: { pagination: { totalPages: number; total: number } } }

    expect(result.data.pagination.total).toBe(0)
    expect(result.data.pagination.totalPages).toBe(0)
  })

  it('la paginación en la respuesta refleja el input (pageIndex y pageSize)', async () => {
    const result = (await invokeGetFieldsListHandler({
      input: { ...defaultInput, pageIndex: 1, pageSize: 5 },
      errors: createMockErrors(),
      context: mockContext,
    })) as { data: { pagination: { pageIndex: number; pageSize: number } } }

    expect(result.data.pagination.pageIndex).toBe(1)
    expect(result.data.pagination.pageSize).toBe(5)
  })

  it('ejecuta count y findMany en paralelo (ambos se invocan exactamente una vez)', async () => {
    await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldCount).toHaveBeenCalledTimes(1)
    expect(mockFieldFindMany).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: ordenamiento
// ---------------------------------------------------------------------------

describe('getFieldsList handler — ordenamiento', () => {
  it('aplica orderBy con el sortBy y sortOrder del input', async () => {
    await invokeGetFieldsListHandler({
      input: { ...defaultInput, sortBy: 'title', sortOrder: 'asc' },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { title: 'asc' },
      }),
    )
  })

  it('aplica orderBy: { createdAt: "desc" } por defecto', async () => {
    await invokeGetFieldsListHandler({
      input: { ...defaultInput, sortBy: 'createdAt', sortOrder: 'desc' },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'desc' },
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: estructura de respuesta
// ---------------------------------------------------------------------------

describe('getFieldsList handler — estructura de respuesta', () => {
  it('retorna status 200 y mensaje de éxito', async () => {
    const result = (await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as { message: string; status: number }

    expect(result.message).toBe('Canchas obtenidas exitosamente')
    expect(result.status).toBe(200)
  })

  it('mapea complexName desde complex.title (desnormalización)', async () => {
    const result = (await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as { data: { fields: Array<{ complexName: string }> } }

    expect(result.data.fields[0].complexName).toBe('Club Atlántida')
  })

  it('retorna el array de subFields anidado en cada cancha', async () => {
    const result = (await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as {
      data: {
        fields: Array<{
          subFields: Array<{ fieldType: string }>
        }>
      }
    }

    expect(result.data.fields[0].subFields).toHaveLength(2)
    expect(result.data.fields[0].subFields[0].fieldType).toBe('HALF_A')
    expect(result.data.fields[0].subFields[1].fieldType).toBe('HALF_B')
  })

  it('retorna array vacío de fields cuando no hay canchas FULL', async () => {
    mockFieldCount.mockResolvedValue(0)
    mockFieldFindMany.mockResolvedValue([])

    const result = (await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as { data: { fields: unknown[] } }

    expect(result.data.fields).toEqual([])
  })

  it('la cancha en la respuesta incluye id, title, complexId, fieldType, surface, capacity, createdAt', async () => {
    const result = (await invokeGetFieldsListHandler({
      input: defaultInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as {
      data: {
        fields: Array<{
          id: string
          title: string
          complexId: string
          fieldType: string
          surface: string
          capacity: number
          createdAt: Date
        }>
      }
    }

    const field = result.data.fields[0]
    expect(field.id).toBe(mockFullField.id)
    expect(field.title).toBe(mockFullField.title)
    expect(field.complexId).toBe(mockFullField.complexId)
    expect(field.fieldType).toBe('FULL')
    expect(field.surface).toBe('SYNTHETIC')
    expect(field.capacity).toBe(10)
    expect(field.createdAt).toBeInstanceOf(Date)
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores
// ---------------------------------------------------------------------------

describe('getFieldsList handler — manejo de errores', () => {
  it('lanza BAD_REQUEST cuando Prisma falla en count', async () => {
    mockFieldCount.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeGetFieldsListHandler({
        input: defaultInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando Prisma falla en findMany', async () => {
    mockFieldFindMany.mockRejectedValue(new Error('Query timeout'))

    await expect(
      invokeGetFieldsListHandler({
        input: defaultInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST', async () => {
    const orpcError = new ORPCError('NOT_FOUND', { message: 'test' })
    mockFieldFindMany.mockRejectedValue(orpcError)

    let thrownError: unknown
    try {
      await invokeGetFieldsListHandler({
        input: defaultInput,
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
