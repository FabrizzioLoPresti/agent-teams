# CLAUDE.md

## Communication Style

**Be concise.** Answer with the minimum necessary. No preamble, no summaries, no filler. Short answers only.

## Orchestrator Rule

> **CRITICAL — READ FIRST**
>
> The main Claude Code agent is the **Orchestrator**. The Orchestrator **only delegates** — it NEVER writes files, edits files, or implements code directly. Every task is dispatched to a subagent via the `Agent` tool (Claude Code Agent Teams). The subagent does the work and returns only a status/summary to the Orchestrator.

## Project Overview

Alta Cancha is a sports-field booking platform for football and padel courts in Argentina. Owners manage complexes (facilities) with fields (courts), and customers search and book time slots.

## Architecture

**Stack:** TanStack Start (SSR) + Vite + Nitro · TanStack Router (file-based) · TanStack Query · Tailwind CSS v4 + Shadcn/Radix

**Layer map:**

| Layer | Location |
|---|---|
| Zod schemas | `src/orpc/schemas/<domain>.ts` |
| oRPC handlers | `src/orpc/router/<domain>.ts` |
| React Query hooks | `src/data/<domain>/<verb>-<entity>.ts` |
| TypeScript types | `src/types/<domain>.ts` |
| Config / constants | `src/config/<domain>.ts` |
| Routes | `src/routes/<prefix>/<section>/` |
| Components | `src/components/<domain>/<type>/` |
| Utilities | `src/utils/<domain>.ts` |

**Route prefixes:** `_general/` (public) · `_customers/` · `_owners/` · `_users/` · `auth/`

**API:** All server logic goes through oRPC at `/api/rpc`. Never REST. Client: `src/orpc/client.ts` exports `orpc` (TQ utils) and `client` (raw typed).

**Auth:** Better Auth. Three roles: `customerComplex`, `ownerComplex`, `user`. Role fixed at registration. oRPC uses `authorizedMiddleware` (protected) or `baseInputValidationMiddleware` (public).

## Domain Model

**Complex** → **Fields** → **FieldWorkingSchedules** → **PriceSlots**

Business rules:
- `Field.fieldType` is `FULL`, `HALF_A`, or `HALF_B`. A FULL field with `isDividable=true` auto-creates HALF_A/B sub-fields on creation.
- When a Field is created, `FieldWorkingSchedule` rows are copied from the parent Complex's schedules. Complex must have schedules configured first.
- Timestamps always UTC (`@db.Timestamptz`). Open/close hours stored as `HH:MM` strings, interpreted using `Complex.timezone` (default: `America/Argentina/Buenos_Aires`).
- Deletes are soft (`isActive = false`). Cannot soft-delete a Field with future PENDING/CONFIRMED bookings.
- `Booking.version` for optimistic locking.

## Agent Orchestration

### Orchestration Rules

1. **Delegate everything.** The Orchestrator never writes, edits, or reads source files. All file operations happen inside subagents.
2. **Decompose first.** Break the feature into phases: spec → clarify → design → plan → consistency check → implement → validate. Each phase maps to exactly one subagent.
3. **Gate on success.** Do not advance to the next phase until the current subagent reports success. On failure, re-delegate with corrective context.
4. **No parallel writes.** Subagents that write files (`speckit-requirements-analyst`, `speckit-architecture-designer`, `speckit-task-planner`, `speckit-implementer`) must never run concurrently against the same feature directory.
5. **Read-only agents may parallelize.** `speckit-consistency-analyzer` and `speckit-review-validator` can run concurrently with each other.

### Subagents

| Agent | Role | Skills |
|---|---|---|
| `speckit-requirements-analyst` | Turns natural language into `spec.md` | `speckit-specify`, `speckit-constitution` |
| `speckit-clarification-agent` | Resolves ambiguities in `spec.md` | `speckit-clarify` |
| `speckit-architecture-designer` | Produces `plan.md` from `spec.md` | `speckit-plan` |
| `speckit-task-planner` | Generates dependency-ordered `tasks.md`; optionally creates GitHub Issues | `speckit-tasks`, `speckit-taskstoissues` |
| `speckit-consistency-analyzer` | Cross-artifact quality check — read-only, no file modifications | `speckit-analyze`, `speckit-checklist` |
| `speckit-implementer` | Writes production code task-by-task with incremental git commits | `speckit-implement`, `speckit-git-*` |
| `speckit-review-validator` | Final acceptance review against spec and tasks | `speckit-analyze`, `speckit-checklist` |

### Project Skills

These skills encode project-specific patterns. Apply them whenever working in the corresponding area — they are the authoritative reference, not CLAUDE.md.

| Skill | Apply when |
|---|---|
| `auth` | Any procedure, route, or component touching auth, sessions, users, or roles |
| `orpc-endpoints` | Any file in `src/orpc/` or `src/data/` |
| `react-components` | Any `.tsx` component file |
| `db-migrations` | Any edit to `prisma/schema.prisma` or `db:*` command |
| `folder-structure` | Any new file, domain, or entity |
| `imports` | Any TypeScript/TSX file (import ordering) |
| `frontend-design` | Any new page, layout, or significant UI surface |
| `vitest-tests` | Any test file or when writing, running, or fixing tests |

### Speckit Git Skills

Used internally by `speckit-implementer` for branch and commit management: `speckit-git-feature`, `speckit-git-commit`, `speckit-git-validate`, `speckit-git-remote`, `speckit-git-initialize`.

## Project Rules

- **No direct oRPC calls in components.** Always go through `src/data/*/` hooks.
- **Prisma client lives in `generated/prisma/`**, not `node_modules`. Import via `import { prisma } from '@/db/db'`.
- **Env vars** via `import { env } from '@/env/server'` (server-only) or `@/env/client` (VITE_ prefix). Never access `process.env` directly.
- **React Compiler is active.** Do not add `useMemo`, `useCallback`, or `React.memo` — the compiler handles memoization.
- **Path alias `@/` maps to `src/`.** Always use alias imports, never deep relative paths.
- **Soft-deletes only** for Complex and Field. Never hard-delete these entities.
- **Add Shadcn components** via `pnpx shadcn@latest add <component>`.
- **No git operations.** Agents must NOT run `git add`, `git commit`, `git push`, or any other git write command. All version control is managed by the developer.
