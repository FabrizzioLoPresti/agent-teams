---
name: Mock conventions for ORPC handler tests
description: Standard mock patterns used across all ORPC handler tests in this project
type: feedback
---

- Mock `@/db/db` (not `@/lib/prisma`) — the project imports prisma from `@/db/db`.
- Always mock `@sentry/tanstackstart-react` with `startSpan: (_opts, fn) => fn()`.
- Declare mock functions (`vi.fn()`) at module scope before `vi.mock(...)` calls.
- Inside `vi.mock('@/db/db', ...)` forward calls through the module-scoped mock functions using spread: `findMany: (...args) => mockFindMany(...args)`.
- Call `vi.clearAllMocks()` in `beforeEach`.
- Dynamic-import the handler inside the invoke helper (after mocks are declared) so hoisting works.

**Why:** Consistent pattern across all existing test files (createComplexHandler, deleteComplexHandler). Following it avoids mock isolation bugs and keeps tests readable.

**How to apply:** Every new ORPC handler test file should follow this exact structure.
