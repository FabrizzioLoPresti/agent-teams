# Imports

## Introduction

Import conventions ensure readability, avoid ambiguity between relative and absolute paths, and prevent circular dependencies between layers.

---

## Path alias

The project uses a single alias defined in `tsconfig.json`:

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
    },
  },
}
```

This means:

- `@/orpc/client` → `src/orpc/client`
- `@/types/booking` → `src/types/booking`
- `@/components/ui/button` → `src/components/ui/button`

**Always use `@/` to import from `src/`.** Relative paths are only used to import files in the same folder or direct subfolders when it is clearer.

---

## Import order

```typescript
// 1. External libraries (node_modules)
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'

// 2. Project imports with @/ alias
import { orpc } from '@/orpc/client'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useComplexById } from '@/data/complex/get-complexes'
import { ComplexType } from '@/types/complex'

// 3. Relative imports (same folder or subfolder)
import BookingForm from '../forms/bookingForm'
import { formatDate } from './utils'
```

> ⚠️ The project does not have a linter configured to automatically enforce the order. This is followed as a convention for consistency with existing files.

---

## Barrel files

### When to use them

Barrel files (`index.ts`) are used sparingly. In this project, the main use case is **types**: `src/types/` could have an `index.ts` that re-exports all types.

However, in practice the project **imports directly from the specific types file**:

```typescript
// Current project pattern (direct import)
import { BookingResponseType } from '@/types/booking'
import { ComplexResponseType } from '@/types/complex'
```

### When to avoid them

- In `src/components/` — components are imported by full path for clarity
- In `src/data/` — hooks are imported directly from their file
- In `src/orpc/router/` — handlers are not imported from components

---

## Rules per layer

```
src/components/*  → can import from: ui/, data/, types/, config/, utils/, lib/
                    CANNOT import from: orpc/router/, store/ (except Zustand UI stores)

src/data/*        → can import from: orpc/client, types/, config/
                    CANNOT import from: components/, routes/

src/orpc/router/* → can import from: orpc/schemas/, orpc/middlewares/, lib/, config/, utils/
                    CANNOT import from: components/, data/, routes/

src/types/*       → can import from: orpc/schemas/
                    CANNOT import from: anything else (only z.infer)

src/config/*      → can import from: (nothing from the project — only literal values)

src/routes/*      → can import from: components/, data/, lib/, types/, config/
```

---

## Circular imports

Circular dependencies are avoided by following the layer flow:

```
config → schemas → types
                ↘
routes → components → data → orpc/client → orpc/router
                    ↘               ↓
                    lib          middlewares
```

The rule: **a layer never imports from a layer that uses it**. For example, `orpc/router/` never imports from `data/` or `components/`.

---

## Real examples from the project

```typescript
// src/data/booking/add-booking.ts
import { useMutation } from '@tanstack/react-query' // external
import { orpc } from '@/orpc/client'                // @/ alias
import { CreateBookingInputType } from '@/types/booking' // @/ alias

// src/components/booking/modals/bookingModal.tsx
import { useNavigate, notFound } from '@tanstack/react-router' // external
import { Dialog, DialogContent } from '@/components/ui/dialog' // @/ alias
import BookingForm from '@/components/booking/forms/bookingForm' // @/ alias (between features)
import { useComplexById } from '@/data/complex/get-complexes'   // @/ alias
import { ComplexType } from '@/types/complex'                   // @/ alias

// src/orpc/router/booking.ts
import { prisma } from '@/db/db'                               // @/ alias
import { authorizedMiddleware } from '@/orpc/middlewares/auth' // @/ alias
import { CreateBookingInputSchema } from '@/orpc/schemas/booking' // @/ alias
import { BOOKING_TAX_RATE } from '@/config/bookings'           // @/ alias
```

---

## Anti-patterns

```typescript
// ❌ Using long relative paths instead of the alias
import { BookingResponseType } from '../../../types/booking'
// ✓ import { BookingResponseType } from '@/types/booking'

// ❌ Importing server handlers on the client
import { addBooking } from '@/orpc/router/booking' // server handler
// ✓ use orpc.addBooking.call() via the client

// ❌ Importing a component from another feature's component using a relative path
// In src/components/dashboard/complexTable.tsx:
import BookingCard from '../../booking/cards/bookingCard' // ❌
// ✓ import BookingCard from '@/components/booking/cards/bookingCard'

// ❌ Creating barrel files for everything
// src/components/index.ts that re-exports all components — unnecessary and slow

// ❌ Importing directly from routeTree.gen.ts
import {} from /* ... */ '@/routes/routeTree.gen' // ❌ auto-generated file
```
