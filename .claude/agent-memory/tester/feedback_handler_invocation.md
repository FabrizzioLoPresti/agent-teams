---
name: Handler invocation via duck-typing
description: How to invoke ORPC handler internals in tests without running the middleware stack
type: feedback
---

Access the handler function via duck-typing on the procedure object using `procedure['~orpc']?.handler ?? procedure.handler`. Always guard with a typeof check and throw a descriptive error if the handler is not found — this protects against future oRPC API changes.

**Why:** The middleware stack (auth, input validation) runs outside the handler function itself. Tests need to call the raw handler to control the `errors` object and bypass auth.

**How to apply:** Use this pattern for every ORPC handler test. Import the procedure from `@/orpc/router/<domain>` inside the helper function (dynamic import) so vi.mock hoisting works correctly.
