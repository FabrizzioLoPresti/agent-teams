/**
 * Tests para el handler ORPC `createComplex`.
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

const mockFindUnique = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    complex: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
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
  CONFLICT: (opts: { message: string }) => AnyORPCError
  BAD_REQUEST: (opts?: { message?: string }) => AnyORPCError
}

type HandlerArgs = {
  input: {
    title: string
    description: string
    timezone: string
    currency: string
    cancellationPolicy: string
    latitude: number
    longitude: number
    address: {
      street: string
      city: string
      state: string
      country: string
      zip?: string
    }
    contact: {
      phone: string
      website?: string
      facebook?: string
      twitter?: string
      instagram?: string
      youtube?: string
    }
    features: string[]
    workingSchedules: Array<{
      dayOfWeek: string
      isWorking: boolean
      openTime: string
      closeTime: string
    }>
  }
  errors: MockErrors
  context: {
    user: { id: string }
  }
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure sin el middleware stack
// ---------------------------------------------------------------------------

async function invokeCreateComplexHandler(args: HandlerArgs): Promise<unknown> {
  const { createComplex } = await import('@/orpc/router/complex')

  // Duck-typing sobre la implementación interna de oRPC para acceder al handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = createComplex as any
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
  title: 'Club Deportivo Córdoba',
  description: 'Complejo deportivo completo con múltiples canchas.',
  timezone: 'America/Argentina/Cordoba',
  currency: 'ARS',
  cancellationPolicy: 'Sin cancelaciones 24h antes.',
  latitude: -31.4135,
  longitude: -64.1811,
  address: {
    street: 'Av. Colón 1234',
    city: 'Córdoba',
    state: 'Córdoba',
    country: 'AR',
    zip: '5000',
  },
  contact: {
    phone: '0351-4567890',
  },
  features: ['PARKING', 'WIFI'],
  workingSchedules: [
    {
      dayOfWeek: 'MONDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      dayOfWeek: 'TUESDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      dayOfWeek: 'WEDNESDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      dayOfWeek: 'THURSDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      dayOfWeek: 'FRIDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      dayOfWeek: 'SATURDAY',
      isWorking: true,
      openTime: '08:00',
      closeTime: '22:00',
    },
    {
      dayOfWeek: 'SUNDAY',
      isWorking: false,
      openTime: '08:00',
      closeTime: '22:00',
    },
  ],
}

const mockCreatedComplex = {
  id: 'cm_abc123',
  title: 'Club Deportivo Córdoba',
  isActive: true,
  createdAt: new Date('2026-03-28T10:00:00Z'),
}

// ---------------------------------------------------------------------------
// Setup por defecto: sin duplicado, transacción exitosa
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  mockFindUnique.mockResolvedValue(null)

  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        complexAddress: { create: vi.fn().mockResolvedValue({ id: 'addr-1' }) },
        complexContact: {
          create: vi.fn().mockResolvedValue({ id: 'contact-1' }),
        },
        complex: { create: vi.fn().mockResolvedValue(mockCreatedComplex) },
        complexWorkingSchedule: {
          createMany: vi.fn().mockResolvedValue({ count: 7 }),
        },
      }
      return fn(txMock)
    },
  )
})

// ---------------------------------------------------------------------------
// Tests: unicidad de título
// ---------------------------------------------------------------------------

describe('createComplex handler — unicidad de título', () => {
  it('lanza CONFLICT cuando ya existe un complejo con el mismo nombre', async () => {
    mockFindUnique.mockResolvedValue({ id: 'cm_existente_456' })

    await expect(
      invokeCreateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Ya existe un complejo con ese nombre.',
    })
  })

  it('el error de CONFLICT es una instancia de ORPCError', async () => {
    mockFindUnique.mockResolvedValue({ id: 'cm_existente_456' })

    let thrownError: unknown
    try {
      await invokeCreateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
  })

  it('NO lanza CONFLICT cuando el título es único', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(
      invokeCreateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).resolves.not.toThrow()
  })

  it('consulta findUnique con el título exacto del input', async () => {
    mockFindUnique.mockResolvedValue(null)

    await invokeCreateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { title: 'Club Deportivo Córdoba' },
      select: { id: true },
    })
  })

  it('NO ejecuta la transacción si el título ya existe', async () => {
    mockFindUnique.mockResolvedValue({ id: 'cm_existente_456' })

    try {
      await invokeCreateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('el mensaje de error de CONFLICT es exacto (para el toast del frontend)', async () => {
    mockFindUnique.mockResolvedValue({ id: 'cm_existente_456' })

    let thrownError: unknown
    try {
      await invokeCreateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect((thrownError as AnyORPCError).message).toBe(
      'Ya existe un complejo con ese nombre.',
    )
  })
})

// ---------------------------------------------------------------------------
// Tests: creación exitosa
// ---------------------------------------------------------------------------

describe('createComplex handler — creación exitosa', () => {
  it('retorna la respuesta con status 201 y los datos del complejo creado', async () => {
    const result = await invokeCreateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(result).toMatchObject({
      message: 'Complejo creado exitosamente',
      status: 201,
      data: {
        id: mockCreatedComplex.id,
        title: mockCreatedComplex.title,
        isActive: true,
        createdAt: mockCreatedComplex.createdAt,
      },
    })
  })

  it('usa el userId del context para el campo ownerId', async () => {
    let capturedComplexData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: {
            create: vi.fn().mockResolvedValue({ id: 'addr-1' }),
          },
          complexContact: {
            create: vi.fn().mockResolvedValue({ id: 'contact-1' }),
          },
          complex: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedComplexData = data
                  return Promise.resolve(mockCreatedComplex)
                },
              ),
          },
          complexWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: { user: { id: 'user-xyz-789' } },
    })

    expect(capturedComplexData).toMatchObject({ ownerId: 'user-xyz-789' })
  })

  it('crea el complejo con isActive: true', async () => {
    let capturedData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: {
            create: vi.fn().mockResolvedValue({ id: 'addr-1' }),
          },
          complexContact: {
            create: vi.fn().mockResolvedValue({ id: 'contact-1' }),
          },
          complex: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedData = data
                  return Promise.resolve(mockCreatedComplex)
                },
              ),
          },
          complexWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedData).toMatchObject({ isActive: true })
  })

  it('genera GeoJSON en formato Point con coordenadas [lng, lat]', async () => {
    let capturedData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: {
            create: vi.fn().mockResolvedValue({ id: 'addr-1' }),
          },
          complexContact: {
            create: vi.fn().mockResolvedValue({ id: 'contact-1' }),
          },
          complex: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedData = data
                  return Promise.resolve(mockCreatedComplex)
                },
              ),
          },
          complexWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateComplexHandler({
      input: { ...validInput, latitude: -31.4135, longitude: -64.1811 },
      errors: createMockErrors(),
      context: mockContext,
    })

    // GeoJSON RFC 7946: coordenadas en orden [longitud, latitud]
    expect(capturedData).toMatchObject({
      geojson: {
        type: 'Point',
        coordinates: [-64.1811, -31.4135],
      },
    })
  })

  it('crea address y contact antes de crear el complejo (orden de la transacción)', async () => {
    const callOrder: string[] = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: {
            create: vi.fn().mockImplementation(() => {
              callOrder.push('complexAddress.create')
              return Promise.resolve({ id: 'addr-1' })
            }),
          },
          complexContact: {
            create: vi.fn().mockImplementation(() => {
              callOrder.push('complexContact.create')
              return Promise.resolve({ id: 'contact-1' })
            }),
          },
          complex: {
            create: vi.fn().mockImplementation(() => {
              callOrder.push('complex.create')
              return Promise.resolve(mockCreatedComplex)
            }),
          },
          complexWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(callOrder).toEqual([
      'complexAddress.create',
      'complexContact.create',
      'complex.create',
    ])
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('createComplex handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla en la consulta de unicidad', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeCreateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando la transacción falla', async () => {
    mockTransaction.mockRejectedValue(new Error('Transaction failed'))

    await expect(
      invokeCreateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST (CONFLICT se preserva)', async () => {
    mockFindUnique.mockResolvedValue({ id: 'existing' })

    let thrownError: unknown
    try {
      await invokeCreateComplexHandler({
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
