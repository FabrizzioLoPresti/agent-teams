---
name: Public handler args (no auth, no input)
description: How to invoke handlers that have no context or input (public endpoints like getComplexesMapList)
type: feedback
---

Public handlers built on `baseInputValidationMiddleware` (not `authorizedMiddleware`) have no `context.user` and may have no `input`. The `HandlerArgs` type for such handlers only needs `errors`. Do not pass `context` or `input` fields at all.

**Why:** Passing extra fields not expected by the handler type causes TypeScript strict-mode errors. Public handlers skip auth middleware so no user context is needed.

**How to apply:** When the handler definition shows no `.input(...)` call and uses `baseInputValidationMiddleware`, define `HandlerArgs = { errors: MockErrors }` only.
