---
name: vitest-tests
description: >
  Vitest testing patterns for alta-cancha-fs. Use this skill whenever you need to write, run, or fix tests — including unit tests for Zod schemas, utility functions, and pure business logic, as well as component tests with @testing-library/react. Always use this skill before writing any .test.ts or .test.tsx file, adding a vitest.config.ts, or running `pnpm test`. Apply it even if the user just asks "write a test for X" or "how do I test this function".
---

# Vitest Testing for alta-cancha-fs

**Stack:** Vitest ^3 · @testing-library/react ^16 · @testing-library/dom ^10 · React 19
**Test command:** `pnpm test` (runs `vitest run` — one-shot, no watch)
**Watch mode:** `pnpm exec vitest` (interactive)

---

## 1. Setup — create `vitest.config.ts` if it doesn't exist

Before writing any test, check if `vitest.config.ts` exists at the project root. If not, create it:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [viteTsConfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

Also create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom'
```

Install the missing type if needed:
```bash
pnpm add -D @testing-library/jest-dom
```

---

## 2. File placement conventions

Co-locate tests next to the file under test inside a `__tests__` folder:

```
src/utils/__tests__/format.test.ts
src/orpc/schemas/__tests__/field.test.ts
src/components/fields/__tests__/FieldCard.test.tsx
```

Name tests `<file>.test.ts` or `<file>.test.tsx` — never `.spec.*`.

---

## 3. What to test

| Layer | Test type | Worth testing? |
|---|---|---|
| `src/utils/*` | Unit | Yes — pure functions, easy to verify |
| `src/orpc/schemas/*` | Unit (Zod) | Yes — validate accept/reject behavior |
| `src/orpc/router/*` | Unit (mocked Prisma) | Selective — happy path + key error paths |
| `src/components/*` | Component (RTL) | Yes — rendering, user interactions |
| `src/data/*` hooks | Integration | Skip — tested indirectly via components |
| oRPC middleware | Unit | Skip — framework internals, no value |

---

## 4. Zod schema tests

Schemas have two things worth testing: what they accept and what they reject. Use `safeParse` — it never throws.

```ts
// src/orpc/schemas/__tests__/common.test.ts
import { describe, it, expect } from 'vitest'
import { paginationSchema } from '../common'

describe('paginationSchema', () => {
  it('accepts valid pagination input', () => {
    const result = paginationSchema.safeParse({ pageIndex: 0, pageSize: 10 })
    expect(result.success).toBe(true)
  })

  it('applies defaults when fields are omitted', () => {
    const result = paginationSchema.safeParse({})
    expect(result.success).toBe(true)
    expect(result.data).toEqual({ pageIndex: 0, pageSize: 15 })
  })

  it('rejects pageSize over 100', () => {
    const result = paginationSchema.safeParse({ pageIndex: 0, pageSize: 200 })
    expect(result.success).toBe(false)
  })
})
```

Pattern: one test for valid input, one for defaults, one per important rejection rule.

---

## 5. Utility function tests

Pure functions are the easiest and most valuable tests to write. Import the function directly — no mocking needed.

```ts
// src/utils/__tests__/format.test.ts
import { describe, it, expect } from 'vitest'
import { getAvatarFallback, formatCurrency } from '../format'

describe('getAvatarFallback', () => {
  it('returns first two initials uppercase', () => {
    expect(getAvatarFallback('Juan Pérez')).toBe('JP')
  })

  it('handles single name', () => {
    expect(getAvatarFallback('Carlos')).toBe('CA')
  })
})

describe('formatCurrency', () => {
  it('formats ARS correctly', () => {
    const result = formatCurrency(1000, 'ARS')
    expect(result).toContain('1.000') // localeString es-AR grouping
  })
})
```

---

## 6. oRPC handler tests (selective)

Mock Prisma with `vi.mock`. Only test the handler, not the middleware. Focus on:
- Happy path: returns expected shape
- Key error path: not-found, unauthorized, business rule violation

```ts
// src/orpc/router/__tests__/field.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '@/db/db'

vi.mock('@/db/db', () => ({
  prisma: {
    field: {
      findUnique: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

// Import the handler AFTER vi.mock so it gets the mocked client
import { getFieldsList } from '../field'

const mockContext = {
  user: { id: 'user-123', role: 'ownerComplex' },
}

describe('getFieldsList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated fields for the authenticated user', async () => {
    vi.mocked(prisma.field.count).mockResolvedValue(1)
    vi.mocked(prisma.field.findMany).mockResolvedValue([
      {
        id: 'field-1',
        title: 'Cancha 1',
        complexId: 'complex-1',
        fieldType: 'FULL',
        surface: 'NATURAL_GRASS',
        capacity: 10,
        createdAt: new Date(),
        complex: { title: 'Complejo A' },
        subFields: [],
      },
    ] as any)

    // Call the handler directly — skip middleware by invoking .handler() if available
    // or test through the oRPC router in integration tests
  })
})
```

> **Note:** oRPC handlers wrapped in `authorizedMiddleware` are hard to unit-test in isolation — the middleware chain doesn't expose `.handler()` directly. Prefer testing pure utility logic and schemas. Reserve router tests for integration scenarios or keep them shallow.

---

## 7. React component tests

Use `@testing-library/react` v16 with React 19. Do NOT add `React.memo`, `useMemo`, or `useCallback` — React Compiler handles memoization.

```tsx
// src/components/fields/__tests__/FieldCard.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FieldCard } from '../FieldCard'

const mockField = {
  id: 'field-1',
  title: 'Cancha A',
  surface: 'NATURAL_GRASS',
  capacity: 10,
}

describe('FieldCard', () => {
  it('renders field title', () => {
    render(<FieldCard field={mockField} />)
    expect(screen.getByText('Cancha A')).toBeInTheDocument()
  })

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<FieldCard field={mockField} onSelect={onSelect} />)
    await user.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('field-1')
  })
})
```

Query priority (most to least preferred): `getByRole` → `getByLabelText` → `getByText` → `getByTestId`.

---

## 8. Running tests

```bash
pnpm test              # one-shot run (CI-style)
pnpm exec vitest       # interactive watch mode
pnpm exec vitest run --reporter=verbose   # verbose output
pnpm exec vitest run src/utils            # run only utils tests
pnpm exec vitest run --coverage           # with coverage (needs @vitest/coverage-v8)
```

---

## 9. Common gotchas

**Path alias `@/`** — `vitest.config.ts` must include `viteTsConfigPaths()` plugin, otherwise imports will fail.

**Prisma client location** — import from `@/db/db`, not from `generated/prisma` or `@prisma/client` directly. Mock `@/db/db`.

**React 19 + jsdom** — some React 19 APIs may warn in jsdom; that's expected. Suppress with `vi.spyOn(console, 'error').mockImplementation(() => {})` if needed.

**`globals: true`** — with this set in vitest.config, you can use `describe`, `it`, `expect`, `vi` without importing them. If you prefer explicit imports, remove `globals: true`.

**TanStack Router / Query in components** — wrap components that use `useNavigate` or `useQuery` in a minimal provider:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
)

render(<MyComponent />, { wrapper })
```
