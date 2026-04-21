/**
 * Tests para el handler ORPC `updateComplex`.
 *
 * Estrategia: mock de `@/db/db` (prisma) para aislar la lógica del handler
 * sin necesitar base de datos real. Se testean:
 *   - Verificación de existencia y ownership (NOT_FOUND, FORBIDDEN)
 *   - Unicidad de título excluyendo el propio complejo (CONFLICT)
 *   - Actualización exitosa con la transacción correcta
 *   - Orden de la transacción: address → contact → complex
 *   - Generación de GeoJSON Point con coordenadas [lng, lat]
 *   - Manejo de errores inesperados de Prisma
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORPCError, type ORPCErrorCode } from '@orpc/client'

// ---------------------------------------------------------------------------
// Mock de Prisma — debe ir antes del import del handler
// ---------------------------------------------------------------------------

const mockFindUnique = vi.fn()
const mockFindFirst = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    complex: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
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
  input: {
    id: string
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

async function invokeUpdateComplexHandler(args: HandlerArgs): Promise<unknown> {
  const { updateComplex } = await import('@/orpc/router/complex')

  // Duck-typing sobre la implementación interna de oRPC para acceder al handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = updateComplex as any
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

const mockContext: HandlerArgs['context'] = {
  user: { id: OWNER_USER_ID },
}

const COMPLEX_ID = 'cm_complex_to_edit_001'

const validInput: HandlerArgs['input'] = {
  id: COMPLEX_ID,
  title: 'Club Deportivo Córdoba Editado',
  description: 'Descripción actualizada del complejo deportivo.',
  timezone: 'America/Argentina/Cordoba',
  currency: 'ARS',
  cancellationPolicy: 'Sin cancelaciones 24h antes.',
  latitude: -31.4135,
  longitude: -64.1811,
  address: {
    street: 'Av. Colón 9999',
    city: 'Córdoba',
    state: 'Córdoba',
    country: 'AR',
    zip: '5000',
  },
  contact: {
    phone: '0351-9999999',
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

const mockExistingComplex = {
  ownerId: OWNER_USER_ID,
  complexAddressId: 'addr-existing-1',
  complexContactId: 'contact-existing-1',
}

const mockUpdatedComplex = {
  id: COMPLEX_ID,
  title: 'Club Deportivo Córdoba Editado',
  isActive: true,
  createdAt: new Date('2026-01-15T10:00:00Z'),
}

// ---------------------------------------------------------------------------
// Setup por defecto: complejo existe, usuario es owner, título es único
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Complex existe y el usuario es el owner
  mockFindUnique.mockResolvedValue(mockExistingComplex)
  // No hay duplicado de título
  mockFindFirst.mockResolvedValue(null)

  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        complexAddress: {
          update: vi.fn().mockResolvedValue({ id: 'addr-existing-1' }),
        },
        complexContact: {
          update: vi.fn().mockResolvedValue({ id: 'contact-existing-1' }),
        },
        complex: { update: vi.fn().mockResolvedValue(mockUpdatedComplex) },
        complexWorkingSchedule: {
          upsert: vi.fn().mockResolvedValue({}),
        },
      }
      return fn(txMock)
    },
  )
})

// ---------------------------------------------------------------------------
// Tests: verificación de existencia y ownership
// ---------------------------------------------------------------------------

describe('updateComplex handler — verificación de existencia', () => {
  it('lanza NOT_FOUND cuando el complejo no existe', async () => {
    mockFindUnique.mockResolvedValue(null)

    await expect(
      invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Complejo no encontrado.',
    })
  })

  it('el error de NOT_FOUND es una instancia de ORPCError', async () => {
    mockFindUnique.mockResolvedValue(null)

    let thrownError: unknown
    try {
      await invokeUpdateComplexHandler({
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

  it('busca el complejo por el ID del input', async () => {
    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: COMPLEX_ID },
      }),
    )
  })

  it('NO ejecuta findFirst ni la transacción si el complejo no existe', async () => {
    mockFindUnique.mockResolvedValue(null)

    try {
      await invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests: verificación de ownership
// ---------------------------------------------------------------------------

describe('updateComplex handler — verificación de ownership', () => {
  it('lanza FORBIDDEN cuando el usuario no es el owner', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: 'otro-usuario-456',
    })

    await expect(
      invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tenés permisos para editar este complejo.',
    })
  })

  it('el error de FORBIDDEN es una instancia de ORPCError', async () => {
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: 'otro-usuario-456',
    })

    let thrownError: unknown
    try {
      await invokeUpdateComplexHandler({
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
      await invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('compara el ownerId del complejo con el userId del context', async () => {
    // El userId del context debe coincidir con ownerId
    mockFindUnique.mockResolvedValue({
      ...mockExistingComplex,
      ownerId: OWNER_USER_ID,
    })

    await expect(
      invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: { user: { id: OWNER_USER_ID } },
      }),
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests: unicidad de título
// ---------------------------------------------------------------------------

describe('updateComplex handler — unicidad de título', () => {
  it('lanza CONFLICT cuando otro complejo ya tiene el mismo título', async () => {
    mockFindFirst.mockResolvedValue({ id: 'otro-complejo-789' })

    await expect(
      invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Ya existe un complejo con ese nombre.',
    })
  })

  it('NO lanza CONFLICT si el único duplicado es el propio complejo', async () => {
    // findFirst retorna null porque la query excluye el propio id (WHERE id != input.id)
    mockFindFirst.mockResolvedValue(null)

    await expect(
      invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).resolves.not.toThrow()
  })

  it('la consulta de duplicado excluye el ID del propio complejo', async () => {
    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          title: validInput.title,
          id: { not: COMPLEX_ID },
        },
      }),
    )
  })

  it('NO ejecuta la transacción si hay conflicto de título', async () => {
    mockFindFirst.mockResolvedValue({ id: 'otro-complejo-789' })

    try {
      await invokeUpdateComplexHandler({
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
// Tests: actualización exitosa
// ---------------------------------------------------------------------------

describe('updateComplex handler — actualización exitosa', () => {
  it('retorna la respuesta con status 200 y los datos del complejo actualizado', async () => {
    const result = await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(result).toMatchObject({
      message: 'Complejo actualizado exitosamente',
      status: 200,
      data: {
        id: mockUpdatedComplex.id,
        title: mockUpdatedComplex.title,
        isActive: true,
        createdAt: mockUpdatedComplex.createdAt,
      },
    })
  })

  it('genera GeoJSON en formato Point con coordenadas [lng, lat]', async () => {
    let capturedComplexData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: { update: vi.fn().mockResolvedValue({}) },
          complexContact: { update: vi.fn().mockResolvedValue({}) },
          complex: {
            update: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedComplexData = data
                  return Promise.resolve(mockUpdatedComplex)
                },
              ),
          },
          complexWorkingSchedule: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      },
    )

    await invokeUpdateComplexHandler({
      input: { ...validInput, latitude: -31.4135, longitude: -64.1811 },
      errors: createMockErrors(),
      context: mockContext,
    })

    // GeoJSON RFC 7946: coordenadas en orden [longitud, latitud]
    expect(capturedComplexData).toMatchObject({
      geojson: {
        type: 'Point',
        coordinates: [-64.1811, -31.4135],
      },
    })
  })

  it('actualiza los campos del complejo correctamente', async () => {
    let capturedComplexData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: { update: vi.fn().mockResolvedValue({}) },
          complexContact: { update: vi.fn().mockResolvedValue({}) },
          complex: {
            update: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedComplexData = data
                  return Promise.resolve(mockUpdatedComplex)
                },
              ),
          },
          complexWorkingSchedule: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      },
    )

    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedComplexData).toMatchObject({
      title: validInput.title,
      description: validInput.description,
      timezone: validInput.timezone,
      currency: validInput.currency,
      cancellationPolicy: validInput.cancellationPolicy,
      latitude: validInput.latitude,
      longitude: validInput.longitude,
      features: validInput.features,
    })
  })

  it('actualiza el address usando el complexAddressId del complejo existente', async () => {
    let capturedAddressArgs: unknown = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: {
            update: vi.fn().mockImplementation((args: unknown) => {
              capturedAddressArgs = args
              return Promise.resolve({})
            }),
          },
          complexContact: { update: vi.fn().mockResolvedValue({}) },
          complex: { update: vi.fn().mockResolvedValue(mockUpdatedComplex) },
          complexWorkingSchedule: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      },
    )

    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedAddressArgs).toMatchObject({
      where: { id: mockExistingComplex.complexAddressId },
      data: {
        street: validInput.address.street,
        city: validInput.address.city,
        state: validInput.address.state,
        country: validInput.address.country,
      },
    })
  })

  it('actualiza el contact usando el complexContactId del complejo existente', async () => {
    let capturedContactArgs: unknown = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: { update: vi.fn().mockResolvedValue({}) },
          complexContact: {
            update: vi.fn().mockImplementation((args: unknown) => {
              capturedContactArgs = args
              return Promise.resolve({})
            }),
          },
          complex: { update: vi.fn().mockResolvedValue(mockUpdatedComplex) },
          complexWorkingSchedule: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      },
    )

    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedContactArgs).toMatchObject({
      where: { id: mockExistingComplex.complexContactId },
      data: { phone: validInput.contact.phone },
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: orden de la transacción
// ---------------------------------------------------------------------------

describe('updateComplex handler — orden de la transacción', () => {
  it('actualiza address → contact → complex en ese orden', async () => {
    const callOrder: string[] = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: {
            update: vi.fn().mockImplementation(() => {
              callOrder.push('complexAddress.update')
              return Promise.resolve({})
            }),
          },
          complexContact: {
            update: vi.fn().mockImplementation(() => {
              callOrder.push('complexContact.update')
              return Promise.resolve({})
            }),
          },
          complex: {
            update: vi.fn().mockImplementation(() => {
              callOrder.push('complex.update')
              return Promise.resolve(mockUpdatedComplex)
            }),
          },
          complexWorkingSchedule: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      },
    )

    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(callOrder).toEqual([
      'complexAddress.update',
      'complexContact.update',
      'complex.update',
    ])
  })

  it('omite la actualización de address si complexAddressId es null', async () => {
    mockFindUnique.mockResolvedValue({
      ownerId: OWNER_USER_ID,
      complexAddressId: null,
      complexContactId: 'contact-existing-1',
    })

    let addressUpdateCalled = false

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: {
            update: vi.fn().mockImplementation(() => {
              addressUpdateCalled = true
              return Promise.resolve({})
            }),
          },
          complexContact: { update: vi.fn().mockResolvedValue({}) },
          complex: { update: vi.fn().mockResolvedValue(mockUpdatedComplex) },
          complexWorkingSchedule: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      },
    )

    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(addressUpdateCalled).toBe(false)
  })

  it('omite la actualización de contact si complexContactId es null', async () => {
    mockFindUnique.mockResolvedValue({
      ownerId: OWNER_USER_ID,
      complexAddressId: 'addr-existing-1',
      complexContactId: null,
    })

    let contactUpdateCalled = false

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          complexAddress: { update: vi.fn().mockResolvedValue({}) },
          complexContact: {
            update: vi.fn().mockImplementation(() => {
              contactUpdateCalled = true
              return Promise.resolve({})
            }),
          },
          complex: { update: vi.fn().mockResolvedValue(mockUpdatedComplex) },
          complexWorkingSchedule: { upsert: vi.fn().mockResolvedValue({}) },
        }
        return fn(txMock)
      },
    )

    await invokeUpdateComplexHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(contactUpdateCalled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('updateComplex handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla en findUnique', async () => {
    mockFindUnique.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando Prisma falla en findFirst', async () => {
    mockFindFirst.mockRejectedValue(new Error('DB error on dedup check'))

    await expect(
      invokeUpdateComplexHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando la transacción falla', async () => {
    mockTransaction.mockRejectedValue(new Error('Transaction failed'))

    await expect(
      invokeUpdateComplexHandler({
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
      await invokeUpdateComplexHandler({
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
      await invokeUpdateComplexHandler({
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
    mockFindFirst.mockResolvedValue({ id: 'otro-complejo' })

    let thrownError: unknown
    try {
      await invokeUpdateComplexHandler({
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
