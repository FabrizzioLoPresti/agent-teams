/**
 * Tests para el handler ORPC `createField`.
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

const mockComplexFindUnique = vi.fn()
const mockFieldFindFirst = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/db/db', () => ({
  prisma: {
    complex: {
      findUnique: (...args: unknown[]) => mockComplexFindUnique(...args),
    },
    field: {
      findFirst: (...args: unknown[]) => mockFieldFindFirst(...args),
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
  context: {
    user: { id: string }
  }
}

// ---------------------------------------------------------------------------
// Helper: invoca el handler interno del procedure sin el middleware stack
// ---------------------------------------------------------------------------

async function invokeCreateFieldHandler(args: HandlerArgs): Promise<unknown> {
  const { createField } = await import('@/orpc/router/field')

  // Duck-typing sobre la implementación interna de oRPC para acceder al handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const procedure = createField as any
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
  complexId: 'complex-abc-123',
  title: 'Cancha Principal',
  description: 'Cancha de fútbol 5 con césped sintético.',
  capacity: 10,
  surface: 'SYNTHETIC',
  isRooted: false,
  hasLighting: true,
  isDividable: false,
}

const mockCreatedField = {
  id: 'field-abc-123',
  title: 'Cancha Principal',
  isActive: true,
  createdAt: new Date('2026-04-05T10:00:00Z'),
}

const mockComplexSchedules = [
  {
    id: 'cs-1',
    dayOfWeek: 'MONDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    id: 'cs-2',
    dayOfWeek: 'TUESDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    id: 'cs-3',
    dayOfWeek: 'WEDNESDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    id: 'cs-4',
    dayOfWeek: 'THURSDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    id: 'cs-5',
    dayOfWeek: 'FRIDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    id: 'cs-6',
    dayOfWeek: 'SATURDAY',
    isWorking: true,
    openTime: '08:00',
    closeTime: '22:00',
  },
  {
    id: 'cs-7',
    dayOfWeek: 'SUNDAY',
    isWorking: false,
    openTime: '08:00',
    closeTime: '22:00',
  },
]

// ---------------------------------------------------------------------------
// Setup por defecto: complejo activo y propio del usuario, sin duplicado
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Complejo existe, está activo y pertenece al usuario
  mockComplexFindUnique.mockResolvedValue({
    ownerId: 'user-123',
    isActive: true,
  })

  // Sin cancha duplicada
  mockFieldFindFirst.mockResolvedValue(null)

  // Transacción exitosa — crea la cancha FULL + FieldWorkingSchedules
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        field: {
          create: vi.fn().mockResolvedValue(mockCreatedField),
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        complexWorkingSchedule: {
          findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
        },
        fieldWorkingSchedule: {
          createMany: vi.fn().mockResolvedValue({ count: 7 }),
        },
      }
      return fn(txMock)
    },
  )
})

// ---------------------------------------------------------------------------
// Tests: verificación del complejo
// ---------------------------------------------------------------------------

describe('createField handler — verificación del complejo', () => {
  it('lanza NOT_FOUND cuando el complejo no existe', async () => {
    mockComplexFindUnique.mockResolvedValue(null)

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Complejo no encontrado.',
    })
  })

  it('lanza NOT_FOUND cuando el complejo está inactivo', async () => {
    mockComplexFindUnique.mockResolvedValue({
      ownerId: 'user-123',
      isActive: false,
    })

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Complejo no encontrado.',
    })
  })

  it('lanza FORBIDDEN cuando el complejo pertenece a otro usuario', async () => {
    mockComplexFindUnique.mockResolvedValue({
      ownerId: 'otro-usuario-999',
      isActive: true,
    })

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'No tenés permisos para agregar canchas a este complejo.',
    })
  })

  it('NO ejecuta la verificación de unicidad si el complejo no existe', async () => {
    mockComplexFindUnique.mockResolvedValue(null)

    try {
      await invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockFieldFindFirst).not.toHaveBeenCalled()
  })

  it('NO ejecuta la transacción si el complejo no existe', async () => {
    mockComplexFindUnique.mockResolvedValue(null)

    try {
      await invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('consulta findUnique del complejo con el complexId del input', async () => {
    await invokeCreateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockComplexFindUnique).toHaveBeenCalledWith({
      where: { id: validInput.complexId },
      select: { ownerId: true, isActive: true },
    })
  })
})

// ---------------------------------------------------------------------------
// Tests: unicidad de título dentro del complejo
// ---------------------------------------------------------------------------

describe('createField handler — unicidad de título', () => {
  it('lanza CONFLICT cuando ya existe una cancha con el mismo nombre en el complejo', async () => {
    mockFieldFindFirst.mockResolvedValue({ id: 'field-existente-456' })

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Ya existe una cancha con ese nombre en este complejo.',
    })
  })

  it('el error de CONFLICT es una instancia de ORPCError', async () => {
    mockFieldFindFirst.mockResolvedValue({ id: 'field-existente-456' })

    let thrownError: unknown
    try {
      await invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch (e) {
      thrownError = e
    }

    expect(thrownError).toBeInstanceOf(ORPCError)
  })

  it('NO ejecuta la transacción si el título ya existe en el complejo', async () => {
    mockFieldFindFirst.mockResolvedValue({ id: 'field-existente-456' })

    try {
      await invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      })
    } catch {
      // error esperado
    }

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('consulta findFirst con complexId + title + isActive: true', async () => {
    await invokeCreateFieldHandler({
      input: validInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(mockFieldFindFirst).toHaveBeenCalledWith({
      where: {
        complexId: validInput.complexId,
        title: validInput.title,
        isActive: true,
      },
      select: { id: true },
    })
  })

  it('NO lanza CONFLICT cuando el título es único en el complejo', async () => {
    mockFieldFindFirst.mockResolvedValue(null)

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Tests: creación de cancha no divisible
// ---------------------------------------------------------------------------

describe('createField handler — creación de cancha no divisible', () => {
  it('retorna la respuesta con status 201 y los datos de la cancha creada', async () => {
    const result = await invokeCreateFieldHandler({
      input: { ...validInput, isDividable: false },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(result).toMatchObject({
      message: 'Cancha creada exitosamente',
      status: 201,
      data: {
        id: mockCreatedField.id,
        title: mockCreatedField.title,
        isActive: true,
        createdAt: mockCreatedField.createdAt,
      },
    })
  })

  it('crea la cancha con fieldType FULL (no es input del usuario)', async () => {
    let capturedFieldData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedFieldData = data
                  return Promise.resolve(mockCreatedField)
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: { ...validInput, isDividable: false },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedFieldData).toMatchObject({ fieldType: 'FULL' })
  })

  it('crea la cancha con isActive: true', async () => {
    let capturedFieldData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedFieldData = data
                  return Promise.resolve(mockCreatedField)
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: { ...validInput, isDividable: false },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedFieldData).toMatchObject({ isActive: true })
  })

  it('NO llama a field.create más de 1 vez cuando isDividable: false', async () => {
    let createCallCount = 0

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            create: vi.fn().mockImplementation(() => {
              createCallCount++
              return Promise.resolve(mockCreatedField)
            }),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: { ...validInput, isDividable: false },
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(createCallCount).toBe(1)
  })

  it('convierte description undefined/null a null en el campo de la BD', async () => {
    let capturedFieldData: Record<string, unknown> | null = null

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  capturedFieldData = data
                  return Promise.resolve(mockCreatedField)
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    const { description: _desc, ...withoutDesc } = validInput
    await invokeCreateFieldHandler({
      input: withoutDesc,
      errors: createMockErrors(),
      context: mockContext,
    })

    expect(capturedFieldData).toMatchObject({ description: null })
  })
})

// ---------------------------------------------------------------------------
// Tests: creación de cancha divisible (FULL + HALF_A + HALF_B)
// ---------------------------------------------------------------------------

describe('createField handler — creación de cancha divisible', () => {
  const dividableInput: HandlerArgs['input'] = {
    ...validInput,
    title: 'Cancha Divisible',
    capacity: 10,
    isDividable: true,
  }

  // Helper para crear txMock con field.create rastreable
  function createDivisibleTxMock(
    createImpl?: (args: { data: Record<string, unknown> }) => unknown,
  ) {
    let callIndex = 0
    return {
      field: {
        create: vi
          .fn()
          .mockImplementation((args: { data: Record<string, unknown> }) => {
            callIndex++
            if (createImpl) return createImpl(args)
            return Promise.resolve({
              ...mockCreatedField,
              id: `field-${callIndex}`,
              title:
                args.data.fieldType === 'FULL'
                  ? 'Cancha Divisible'
                  : String(args.data.title),
            })
          }),
        createMany: vi.fn(),
      },
      complexWorkingSchedule: {
        findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
      },
      fieldWorkingSchedule: {
        createMany: vi.fn().mockResolvedValue({ count: 7 }),
      },
    }
  }

  it('llama a field.create 3 veces cuando isDividable: true', async () => {
    const createArgs: Array<{ data: Record<string, unknown> }> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation((args: { data: Record<string, unknown> }) => {
                createArgs.push(args)
                return Promise.resolve({
                  ...mockCreatedField,
                  id: `field-${createArgs.length}`,
                  title: 'Cancha Divisible',
                })
              }),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: dividableInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    // FULL + HALF_A + HALF_B
    expect(createArgs).toHaveLength(3)
  })

  it('crea exactamente 2 mitades (HALF_A y HALF_B)', async () => {
    const createArgs: Array<{ data: Record<string, unknown> }> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = createDivisibleTxMock((args) => {
          createArgs.push(args)
          return Promise.resolve({
            ...mockCreatedField,
            id: `field-${createArgs.length}`,
            title: 'Cancha Divisible',
          })
        })
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: dividableInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    // Primer call es FULL, los siguientes son sub-fields
    expect(createArgs.slice(1)).toHaveLength(2)
  })

  it('las mitades tienen fieldType HALF_A y HALF_B respectivamente', async () => {
    const subFieldData: Array<Record<string, unknown>> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        let callN = 0
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  callN++
                  if (callN > 1) subFieldData.push(data) // skip FULL
                  return Promise.resolve({
                    ...mockCreatedField,
                    id: `field-${callN}`,
                    title: 'Cancha Divisible',
                  })
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: dividableInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    const fieldTypes = subFieldData.map((f) => f.fieldType)
    expect(fieldTypes).toContain('HALF_A')
    expect(fieldTypes).toContain('HALF_B')
  })

  it('los títulos de las mitades siguen el patrón "${title} - Mitad A/B"', async () => {
    const subFieldData: Array<Record<string, unknown>> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        let callN = 0
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  callN++
                  if (callN > 1) subFieldData.push(data)
                  return Promise.resolve({
                    ...mockCreatedField,
                    id: `field-${callN}`,
                    title: 'Cancha Divisible',
                  })
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: dividableInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    const halfA = subFieldData.find((f) => f.fieldType === 'HALF_A')
    const halfB = subFieldData.find((f) => f.fieldType === 'HALF_B')

    expect(halfA?.title).toBe('Cancha Divisible - Mitad A')
    expect(halfB?.title).toBe('Cancha Divisible - Mitad B')
  })

  it('las mitades tienen capacity = Math.floor(capacity / 2)', async () => {
    const subFieldData: Array<Record<string, unknown>> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        let callN = 0
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  callN++
                  if (callN > 1) subFieldData.push(data)
                  return Promise.resolve({
                    ...mockCreatedField,
                    id: `field-${callN}`,
                    title: 'Cancha Divisible',
                  })
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    // capacity: 10 → halfCapacity: 5
    await invokeCreateFieldHandler({
      input: { ...dividableInput, capacity: 10 },
      errors: createMockErrors(),
      context: mockContext,
    })

    for (const half of subFieldData) {
      expect(half.capacity).toBe(5)
    }
  })

  it('aplica Math.floor para capacidades impares (capacity: 11 → halfCapacity: 5)', async () => {
    const subFieldData: Array<Record<string, unknown>> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        let callN = 0
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  callN++
                  if (callN > 1) subFieldData.push(data)
                  return Promise.resolve({
                    ...mockCreatedField,
                    id: `field-${callN}`,
                    title: 'Cancha Divisible',
                  })
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: { ...dividableInput, capacity: 11 },
      errors: createMockErrors(),
      context: mockContext,
    })

    for (const half of subFieldData) {
      expect(half.capacity).toBe(5) // Math.floor(11/2)
    }
  })

  it('las mitades tienen parentFieldId = id de la cancha FULL creada', async () => {
    const fullFieldId = 'full-field-xyz-789'
    const subFieldData: Array<Record<string, unknown>> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        let callN = 0
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  callN++
                  const isFullField = callN === 1
                  if (!isFullField) subFieldData.push(data)
                  return Promise.resolve({
                    ...mockCreatedField,
                    id: isFullField ? fullFieldId : `half-${callN}`,
                    title: 'Cancha Divisible',
                  })
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: dividableInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    for (const half of subFieldData) {
      expect(half.parentFieldId).toBe(fullFieldId)
    }
  })

  it('las mitades tienen isDividable: false', async () => {
    const subFieldData: Array<Record<string, unknown>> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        let callN = 0
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  callN++
                  if (callN > 1) subFieldData.push(data)
                  return Promise.resolve({
                    ...mockCreatedField,
                    id: `field-${callN}`,
                    title: 'Cancha Divisible',
                  })
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: dividableInput,
      errors: createMockErrors(),
      context: mockContext,
    })

    for (const half of subFieldData) {
      expect(half.isDividable).toBe(false)
    }
  })

  it('las mitades heredan surface, isRooted y hasLighting de la cancha FULL', async () => {
    const subFieldData: Array<Record<string, unknown>> = []

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        let callN = 0
        const txMock = {
          field: {
            create: vi
              .fn()
              .mockImplementation(
                ({ data }: { data: Record<string, unknown> }) => {
                  callN++
                  if (callN > 1) subFieldData.push(data)
                  return Promise.resolve({
                    ...mockCreatedField,
                    id: `field-${callN}`,
                    title: 'Cancha Divisible',
                  })
                },
              ),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    await invokeCreateFieldHandler({
      input: {
        ...dividableInput,
        surface: 'CEMENT',
        isRooted: true,
        hasLighting: true,
      },
      errors: createMockErrors(),
      context: mockContext,
    })

    for (const half of subFieldData) {
      expect(half.surface).toBe('CEMENT')
      expect(half.isRooted).toBe(true)
      expect(half.hasLighting).toBe(true)
    }
  })

  it('retorna los datos de la cancha FULL (no de las mitades)', async () => {
    const fullFieldResult = {
      id: 'full-field-result',
      title: 'Cancha Divisible',
      isActive: true,
      createdAt: new Date('2026-04-05T10:00:00Z'),
    }

    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const txMock = {
          field: {
            create: vi.fn().mockResolvedValue(fullFieldResult),
            createMany: vi.fn(),
          },
          complexWorkingSchedule: {
            findMany: vi.fn().mockResolvedValue(mockComplexSchedules),
          },
          fieldWorkingSchedule: {
            createMany: vi.fn().mockResolvedValue({ count: 7 }),
          },
        }
        return fn(txMock)
      },
    )

    const result = (await invokeCreateFieldHandler({
      input: dividableInput,
      errors: createMockErrors(),
      context: mockContext,
    })) as { data: { id: string; title: string } }

    expect(result.data.id).toBe('full-field-result')
    expect(result.data.title).toBe('Cancha Divisible')
  })
})

// ---------------------------------------------------------------------------
// Tests: manejo de errores inesperados
// ---------------------------------------------------------------------------

describe('createField handler — manejo de errores inesperados', () => {
  it('lanza BAD_REQUEST cuando Prisma falla al buscar el complejo', async () => {
    mockComplexFindUnique.mockRejectedValue(new Error('DB connection error'))

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando falla la verificación de unicidad de título', async () => {
    mockFieldFindFirst.mockRejectedValue(new Error('DB timeout'))

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('lanza BAD_REQUEST cuando la transacción falla', async () => {
    mockTransaction.mockRejectedValue(new Error('Transaction failed'))

    await expect(
      invokeCreateFieldHandler({
        input: validInput,
        errors: createMockErrors(),
        context: mockContext,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('re-lanza ORPCError sin envolverla en BAD_REQUEST (CONFLICT se preserva)', async () => {
    mockFieldFindFirst.mockResolvedValue({ id: 'existing-field' })

    let thrownError: unknown
    try {
      await invokeCreateFieldHandler({
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
    mockComplexFindUnique.mockResolvedValue({
      ownerId: 'otro-usuario',
      isActive: true,
    })

    let thrownError: unknown
    try {
      await invokeCreateFieldHandler({
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
