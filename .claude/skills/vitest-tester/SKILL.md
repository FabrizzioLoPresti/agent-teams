---
name: vitest-tester
description: Generate and run Vitest tests for alta-cancha-fs. Creates unit tests for ORPC handlers, Zod schemas, and utility functions. Covers happy paths, error cases, auth guards, and booking concurrency edge cases.
argument-hint: "<file or handler to test>"
---

# vitest-tester

Generate comprehensive **Vitest tests** for alta-cancha-fs business logic.

## Scope Discipline

**Only create or modify test files for the specific target under test.** Do not reformat, restructure, or touch implementation files — even if you notice issues while reading them for context. Report unrelated issues; never fix them inline.

## What to test

**Always test:**
- ORPC handlers (mutations + complex queries)
- Booking conflict/concurrency logic
- Zod schema validation (valid and invalid inputs)
- Utility functions with domain logic (`src/utils/`)
- Auth and role enforcement

**Skip:**
- Trivial presentational UI components
- Config constants
- Type-only files (`src/types/`)

## Step-by-step process

### Step 1 — Read the file to test

Read the target file fully before writing any tests. Understand:
- What inputs are expected
- What the happy path returns
- What error conditions throw
- Which middleware is used (authorized vs public)

### Step 2 — Read existing tests for pattern reference

Look for `*.test.ts` files in the same directory or domain. Match the existing style.

### Step 3 — Write tests

#### ORPC Handler Test Pattern

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRouterClient } from '@orpc/server'
import router from '@/orpc/router'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    [model]: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
      $transaction: vi.fn(),
    },
  },
}))

describe('[handlerName]', () => {
  const mockUser = { id: 'user_test_123', role: 'ownerComplex' as const }
  const mockHeaders = new Headers({ cookie: 'test-session' })

  // Mock session for authorizedMiddleware
  vi.mock('@/lib/auth/auth', () => ({
    auth: {
      api: {
        getSession: vi.fn().mockResolvedValue({
          session: { id: 'session_123' },
          user: mockUser,
        }),
      },
    },
  }))

  const client = createRouterClient(router, {
    context: () => ({ headers: mockHeaders }),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ✅ Happy path
  it('should [expected outcome] when [condition]', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.[model].findUnique).mockResolvedValue({ id: 'parent_123', ownerId: mockUser.id })
    vi.mocked(prisma.[model].create).mockResolvedValue({ id: 'new_123', title: 'Test', createdAt: new Date() })

    const result = await client.[handlerName]({
      // valid input
    })

    expect(result.status).toBe(201)
    expect(result.data?.id).toBeDefined()
  })

  // ❌ NOT_FOUND
  it('should throw NOT_FOUND when [resource] does not exist', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.[model].findUnique).mockResolvedValue(null)

    await expect(
      client.[handlerName]({ /* valid input */ })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  // ❌ FORBIDDEN
  it('should throw FORBIDDEN when user is not the owner', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.[model].findUnique).mockResolvedValue({
      id: 'parent_123',
      ownerId: 'different_user_id',  // not the current user
    })

    await expect(
      client.[handlerName]({ /* valid input */ })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  // ❌ CONFLICT (for booking/duplicate operations)
  it('should throw CONFLICT when [resource] already exists', async () => {
    const { prisma } = await import('@/lib/prisma')
    vi.mocked(prisma.[model].findFirst).mockResolvedValue({ id: 'existing_123' })

    await expect(
      client.[handlerName]({ /* input that would conflict */ })
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  // ❌ UNAUTHORIZED
  it('should throw UNAUTHORIZED when no session', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValueOnce(null)

    await expect(
      client.[handlerName]({ /* any input */ })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
```

#### Zod Schema Test Pattern

```typescript
import { describe, it, expect } from 'vitest'
import { [InputSchema] } from '@/orpc/schemas/[domain]'

describe('[InputSchema]', () => {
  it('should accept valid input', () => {
    const result = [InputSchema].safeParse({
      // valid data
    })
    expect(result.success).toBe(true)
  })

  it('should reject missing required field', () => {
    const result = [InputSchema].safeParse({
      // missing required field
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toContain('[fieldName]')
  })

  it('should reject invalid enum value', () => {
    const result = [InputSchema].safeParse({
      [enumField]: 'INVALID_VALUE',
    })
    expect(result.success).toBe(false)
  })

  it('should apply defaults correctly', () => {
    const result = [InputSchema].parse({
      // minimal valid input (rely on defaults)
    })
    expect(result.[fieldWithDefault]).toBe('[expectedDefault]')
  })
})
```

#### Utility Function Test Pattern

```typescript
import { describe, it, expect } from 'vitest'
import { [functionName] } from '@/utils/[domain]'

describe('[functionName]', () => {
  it('should [expected behavior]', () => {
    const result = [functionName]([input])
    expect(result).toEqual([expected])
  })

  it('should handle empty input', () => {
    const result = [functionName]([])
    expect(result).toEqual([])
  })

  it('should handle edge case: [description]', () => {
    // test boundary/edge case
  })
})
```

### Step 4 — Run tests to verify

```bash
pnpm test [filename]
# or in watch mode:
pnpm test --watch [filename]
```

Fix any failing tests before reporting completion.

## Test naming conventions

Use descriptive `it()` sentences in this pattern:
- `'should [result] when [condition]'`
- `'should throw [ERROR] when [reason]'`
- `'should return [data] for [scenario]'`

## Booking-specific test cases

For booking handlers, always test:

```typescript
// Overlapping time slots
it('should throw CONFLICT when new booking overlaps existing booking', async () => {
  const existingBooking = {
    startDateTime: new Date('2026-04-12T14:00:00Z'),
    endDateTime: new Date('2026-04-12T15:00:00Z'),
  }
  // New booking at 14:30 overlaps
  const newInput = {
    startDateTime: new Date('2026-04-12T14:30:00Z'),
    endDateTime: new Date('2026-04-12T15:30:00Z'),
  }
  // ... verify CONFLICT is thrown
})

// Adjacent bookings (should NOT conflict)
it('should allow booking immediately after another ends', async () => {
  // booking ends at 15:00, new booking starts at 15:00 — valid
})
```

## Financial test values

For monetary calculations, always use explicit values:
```typescript
// ✅ Explicit decimal values
expect(result.totalAmount).toBe('1100.00')  // Prisma Decimal serializes to string

// ❌ Floating point comparison
expect(result.totalAmount).toBe(1100.0)  // may have precision issues
```

## Rules

- Mock Prisma with `vi.mock` — never hit the real database
- Mock Better-Auth session for auth tests
- Clear all mocks in `beforeEach` with `vi.clearAllMocks()`
- Test files are co-located: `handler.ts` → `handler.test.ts`
- Every handler test covers: happy path, NOT_FOUND, FORBIDDEN, CONFLICT (where applicable), UNAUTHORIZED
- Use `createRouterClient` to call handlers — no HTTP layer in unit tests
