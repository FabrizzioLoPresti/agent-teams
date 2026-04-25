---
name: imports
description: Import ordering rules for alta-cancha-fs. Use when writing or editing any TypeScript/TSX file to ensure imports are ordered correctly across components, oRPC handlers, schemas, types, data hooks, routes, and utilities.
compatibility: alta-cancha-fs project (TanStack Start + oRPC + Prisma + React)
---

## Universal Rule

Every file follows this top-to-bottom order:

```
1. External packages (node_modules)
2. Internal aliases (@/) — ordered by layer (see table below)
3. Relative imports (./ or ../)
4. import type — at the end of its own group, never mixed with value imports
```

No blank lines between imports of the same group. One blank line between groups.

---

## `@/` Layer Order

When a file has multiple internal imports, respect this layer order (top = most fundamental):

| Order | Layer | Example |
|---|---|---|
| 1 | `@/db/` | `@/db/db`, `@/db/redis` |
| 2 | `@/env/` | `@/env/server`, `@/env/client` |
| 3 | `@/lib/` | `@/lib/auth/auth`, `@/lib/utils` |
| 4 | `@/orpc/middlewares/` | `@/orpc/middlewares/auth`, `@/orpc/middlewares/base` |
| 5 | `@/orpc/schemas/` | `@/orpc/schemas/field`, `@/orpc/schemas/api-response` |
| 6 | `@/orpc/client` | `@/orpc/client` |
| 7 | `@/config/` | `@/config/fields`, `@/config/common` |
| 8 | `@/types/` | `@/types/field`, `@/types/common` |
| 9 | `@/utils/` | `@/utils/fields`, `@/utils/format` |
| 10 | `@/hooks/` | `@/hooks/use-mobile` |
| 11 | `@/store/` | `@/store/useSidebarStore` |
| 12 | `@/middlewares/` | `@/middlewares/auth` |
| 13 | `@/data/` | `@/data/field/get-fields` |
| 14 | `@/components/ui/` | `@/components/ui/button` |
| 15 | `@/components/` | `@/components/profile/forms/fieldForm` |

---

## External Packages Sub-order by File Type

### React components (`.tsx` in `src/components/` or `src/routes/`)

```typescript
// 1. React core
import { useState, useEffect, Suspense } from 'react'

// 2. TanStack Router / Start
import { useNavigate, createFileRoute } from '@tanstack/react-router'

// 3. Form libraries
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

// 4. Icons
import { ChevronRight, MoreHorizontal } from 'lucide-react'

// 5. Everything else (toast, date-fns, orpc errors, etc.)
import { toast } from 'sonner'
import { ORPCError } from '@orpc/client'
import { getDay } from 'date-fns'
```

### oRPC handlers (`src/orpc/router/`)

```typescript
// 1. oRPC
import { ORPCError } from '@orpc/client'

// 2. Sentry (monitoring)
import * as Sentry from '@sentry/tanstackstart-react'

// 3. Other external (zod, date-fns, prisma runtime, etc.)
import { z } from 'zod'
import { getDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
```

### Schemas (`src/orpc/schemas/`) and Types (`src/types/`)

```typescript
// 1. zod (always first)
import { z } from 'zod'
```

### Data hooks (`src/data/`)

```typescript
// 1. TanStack Query
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```

---

## Canonical Examples

### oRPC handler

```typescript
import { ORPCError } from '@orpc/client'
import * as Sentry from '@sentry/tanstackstart-react'
import { getDay } from 'date-fns'
import { prisma } from '@/db/db'
import { authorizedMiddleware } from '@/orpc/middlewares/auth'
import { CreateFieldInputSchema, CreateFieldResponseSchema } from '@/orpc/schemas/field'
import { createApiResponseSchema } from '@/orpc/schemas/api-response'
import { SURFACE_VALUES } from '@/config/fields'
import type { FieldType } from '@/types/field'
```

### Zod schema file

```typescript
import { z } from 'zod'
import { paginationSchema, sortSchema } from './common'
import { SORT_FIELDS } from '@/config/common'
import { SURFACE_VALUES, FIELD_TYPE_VALUES } from '@/config/fields'
```

### Types file

```typescript
import { z } from 'zod'
import { FieldSchema, CreateFieldInputSchema } from '@/orpc/schemas/field'
import { SURFACE_VALUES } from '@/config/fields'
```

### Data hook

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/orpc/client'
import { fieldSortFieldsEnum } from '@/orpc/schemas/field'
import type { CreateFieldInputType } from '@/types/field'
```

### React component

```typescript
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { FieldFormFields } from './fieldFormFields'
import { useAddField } from '@/data/field/add-field'
import { CreateFieldFormSchema } from '@/orpc/schemas/field'
import { CREATE_FIELD_FORM_DEFAULT_VALUES } from '@/config/fields'
import type { CreateFieldFormType, FieldType } from '@/types/field'
```

### Route file

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { authMiddleware } from '@/middlewares/auth'
import FieldsContainer from '@/components/profile/general/fieldsContainer'
```

---

## Key Rules

- `import type` is used for types that are **only needed at compile time** (not at runtime). Place them last within their group, or as a separate final block.
- Never mix `import type` with value imports in the same line.
- Relative imports (`./`, `../`) always come **after** all `@/` imports.
- Within the same layer, order alphabetically by path.
- Do not add blank lines within a group; add one blank line between groups.
