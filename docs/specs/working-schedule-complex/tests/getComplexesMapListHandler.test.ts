/**
 * Tests para el handler ORPC `getComplexesMapList`.
 *
 * Estrategia: mock de `@/db/db` (prisma) para aislar la lógica del handler
 * sin necesitar base de datos real. El handler es público (sin auth), por lo
 * que se invoca directamente vía duck-typing sobre `~orpc.handler` sin
 * necesitar un context de usuario.
 *
 * Se testean los siguientes escenarios:
 *   - Happy path: retorna lista de complejos con canchas activas
 *   - Lista vacía: retorna array vacío sin lanzar error
 *   - Filtro de la query: verifica el where exacto pasado a findMany
 *   - Error de Prisma: relanza como BAD_REQUEST
 *   - ORPCError existente: se propaga sin envolver en BAD_REQUEST
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORPCError, type ORPCErrorCode } from '@orpc/client'

// ---------------------------------------------------------------------------
// Mock de Prisma — debe ir antes del import del handler
// ---------------------------------------------------------------------------

const mockFindMany = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    complex: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
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
  BAD_REQUEST: (opts?: { message?: string }) => AnyORPCError
}

// El handler es público: no recibe input ni context
type HandlerArgs = {
  errors: MockErrors
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure sin el middleware stack
// ---------------------------------------------------------------------------

async function invokeGetComplexesMapListHandler(
  args: HandlerArgs,
): Promise<unknown> {
  const { getComplexesMapList } = await import('@/orpc/router/complex')

  // Duck-typing sobre la implementación interna de oRPC para acceder al handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = getComplexesMapList as any
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
  }
}

// Complejos de ejemplo que devuelve findMany (select: id, title, latitude, longitude)
const mockComplexes = [
  {
    id: 'cm_abc123',
    title: 'Club Deportivo Córdoba',
    latitude: -31.4135,
    longitude: -64.1811,
  },
  {
    id: 'cm_def456',
    title: 'Polideportivo Norte',
    latitude: -31.3902,
    longitude: -64.2159,
  },
]

// ---------------------------------------------------------------------------
// Setup por defecto: findMany retorna lista con complejos activos
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockFindMany.mockResolvedValue(mockComplexes)
})

// ---------------------------------------------------------------------------
// Tests: happy path
// ---------------------------------------------------------------------------

describe('getComplexesMapList handler — happy path', () => {
  it('retorna la lista de complejos con canchas activas', async () => {
    const result = await invokeGetComplexesMapListHandler({
      errors: createMockErrors(),
    })

    expect(result).toEqual(mockComplexes)
  })

  it('retorna exactamente los campos id, title, latitude y longitude', async () => {
    const result = (await invokeGetComplexesMapListHandler({
      errors: createMockErrors(),
    })) as typeof mockComplexes

    expect(result[0]).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      latitude: expect.any(Number),
      longitude: expect.any(Number),
    })
    // No debe incluir campos extra que no son parte del select
    expect(Object.keys(result[0])).toHaveLength(4)
  })

  it('retorna múltiples complejos cuando hay varios disponibles', async () => {
    const result = (await invokeGetComplexesMapListHandler({
      errors: createMockErrors(),
    })) as unknown[]

    expect(result).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Tests: lista vacía
// ---------------------------------------------------------------------------

describe('getComplexesMapList handler — lista vacía', () => {
  it('retorna array vacío cuando ningún complejo tiene canchas activas', async () => {
    mockFindMany.mockResolvedValue([])

    const result = await invokeGetComplexesMapListHandler({
      errors: createMockErrors(),
    })

    expect(result).toEqual([])
  })

  it('no lanza error cuando la lista está vacía', async () => {
    mockFindMany.mockResolvedValue([])

    await expect(
      invokeGetComplexesMapListHandler({ errors: createMockErrors() }),
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests: filtro correcto en la query
// ---------------------------------------------------------------------------

describe('getComplexesMapList handler — filtro de la query', () => {
  it('llama a findMany con where: isActive true y fields.some.isActive true', async () => {
    await invokeGetComplexesMapListHandler({ errors: createMockErrors() })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          fields: {
            some: { isActive: true },
          },
        },
      }),
    )
  })

  it('llama a findMany con select de id, title, latitude y longitude', async () => {
    await invokeGetComplexesMapListHandler({ errors: createMockErrors() })

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          title: true,
          latitude: true,
          longitude: true,
        },
      }),
    )
  })

  it('llama a findMany exactamente una vez por invocación', async () => {
    await invokeGetComplexesMapListHandler({ errors: createMockErrors() })

    expect(mockFindMany).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('getComplexesMapList handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla con un error genérico', async () => {
    mockFindMany.mockRejectedValue(new Error('DB error'))

    await expect(
      invokeGetComplexesMapListHandler({ errors: createMockErrors() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('el error relanzado es una instancia de ORPCError', async () => {
    mockFindMany.mockRejectedValue(new Error('DB connection error'))

    let thrownError: unknown
    try {
      await invokeGetComplexesMapListHandler({ errors: createMockErrors() })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
  })

  it('re-lanza ORPCError existente sin envolverla en BAD_REQUEST (CONFLICT se preserva)', async () => {
    mockFindMany.mockRejectedValue(
      new ORPCError('CONFLICT', { message: 'test' }),
    )

    let thrownError: unknown
    try {
      await invokeGetComplexesMapListHandler({ errors: createMockErrors() })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
    expect((thrownError as AnyORPCError).code).toBe('CONFLICT')
    expect((thrownError as AnyORPCError).code).not.toBe('BAD_REQUEST')
  })

  it('re-lanza ORPCError existente preservando el mensaje original', async () => {
    const originalError = new ORPCError('CONFLICT', { message: 'test' })
    mockFindMany.mockRejectedValue(originalError)

    let thrownError: unknown
    try {
      await invokeGetComplexesMapListHandler({ errors: createMockErrors() })
    } catch (e) {
      thrownError = e
    }

    expect((thrownError as AnyORPCError).message).toBe('test')
  })
})
