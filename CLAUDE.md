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

0. **Create a feature branch first.** Before delegating to any phase agent, delegate to `speckit-git-feature` to create and checkout a new feature branch. Do not begin Phase 1 until the branch is confirmed. Skip only if the user is already on a feature branch or explicitly opts out.
1. **Clarify before starting.** If the feature description is ambiguous, incomplete, or leaves open questions about scope, behavior, or constraints, ask the user targeted clarification questions **before** delegating to any subagent. Do not begin Phase 1 until you have enough information to describe the feature without guessing.
2. **Delegate everything.** The Orchestrator never writes, edits, or reads source files. All file operations happen inside subagents.
3. **Decompose first.** Break the feature into phases: spec → clarify → design → plan → consistency check → implement → validate. Each phase maps to exactly one subagent.
4. **Gate on success.** Do not advance to the next phase until the current subagent reports success. On failure, re-delegate with corrective context.
5. **No parallel writes.** Subagents that write files (`speckit-requirements-analyst`, `speckit-architecture-designer`, `speckit-task-planner`, `speckit-implementer`) must never run concurrently against the same feature directory.
6. **Read-only agents may parallelize.** `speckit-consistency-analyzer` and `speckit-review-validator` can run concurrently with each other.

### Subagents

| Agent | Role | Skills |
|---|---|---|
| `speckit-git-feature` | Creates and checks out a new feature branch before any work begins | `speckit-git-feature` |
| `speckit-requirements-analyst` | Turns natural language into `spec.md` | `speckit-specify`, `speckit-constitution` |
| `speckit-clarification-agent` | Resolves ambiguities in `spec.md` | `speckit-clarify` |
| `speckit-architecture-designer` | Produces `plan.md` from `spec.md` | `speckit-plan` |
| `speckit-task-planner` | Generates dependency-ordered `tasks.md`; optionally creates GitHub Issues | `speckit-tasks`, `speckit-taskstoissues` |
| `speckit-consistency-analyzer` | Cross-artifact quality check — read-only, no file modifications | `speckit-analyze`, `speckit-checklist` |
| `speckit-implementer` | Writes production code task-by-task with incremental git commits | `speckit-implement`, `speckit-git-*` |
| `speckit-review-validator` | Final acceptance review against spec and tasks | `speckit-analyze`, `speckit-checklist` |

### Project Skills

Project-specific skills live in `.agents/skills/`. They are the authoritative reference for this codebase — they override general knowledge. Subagents are framework-agnostic, so **you must inject the relevant skills into every delegation message** so subagents load them via the Skill tool before starting work.

| Skill              | Load when the task involves...                                           |
| ------------------ | ------------------------------------------------------------------------ |
| `auth`             | Any procedure, route, or component touching auth, sessions, users, roles |
| `orpc-endpoints`   | Any file in `src/orpc/` or `src/data/`                                   |
| `react-components` | Any `.tsx` component file                                                |
| `db-migrations`    | Any edit to `prisma/schema.prisma` or any `db:*` command                 |
| `folder-structure` | Any new file, domain, or entity                                          |
| `imports`          | Any TypeScript/TSX file (import ordering)                                |
| `frontend-design`  | Any new page, layout, or significant UI surface                          |
| `vitest-tests`     | Any test file or when writing, running, or fixing tests                  |

Skills assigned per subagent — inject exactly these when delegating:

| Subagent                        | Skills to inject                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `speckit-requirements-analyst`  | none — produces spec.md only, no code                                                                                           |
| `speckit-clarification-agent`   | none — analyzes spec text only                                                                                                  |
| `speckit-architecture-designer` | `folder-structure`, `orpc-endpoints`, `db-migrations`, `auth`, `react-components`                                               |
| `speckit-task-planner`          | `folder-structure`                                                                                                              |
| `speckit-consistency-analyzer`  | none — read-only artifact analysis                                                                                              |
| `speckit-implementer`           | `auth`, `orpc-endpoints`, `react-components`, `db-migrations`, `folder-structure`, `imports`, `frontend-design`, `vitest-tests` |
| `speckit-review-validator`      | none — verifies against spec, does not write code                                                                               |

When delegating to a subagent that has assigned skills, append this block to the task prompt:

```
Project Skills — load via Skill tool before starting:
<list the assigned skills, one per line>
These are mandatory. They encode the authoritative patterns for this codebase and override general knowledge.
```

### Speckit Git Skills

Used internally by `speckit-implementer` for branch and commit management: `speckit-git-feature`, `speckit-git-commit`, `speckit-git-validate`, `speckit-git-remote`, `speckit-git-initialize`.

### General Task Subagents — Skill Injection

When the Orchestrator delegates a **simple, self-contained task** to a general-purpose subagent (not a SpecKit phase agent), it must still inject the relevant project skills based on what the task involves. General task subagents are framework-agnostic; without this injection they will produce code that violates codebase conventions.

Analyze the task description and include every skill whose trigger condition matches:

| Skill              | Include when the task involves...                                                   |
| ------------------ | ----------------------------------------------------------------------------------- |
| `auth`             | Any procedure, route, or component touching auth, sessions, users, or roles         |
| `orpc-endpoints`   | Creating or modifying any file in `src/orpc/` or `src/data/`                        |
| `react-components` | Creating or editing any `.tsx` component, form, table, modal, or UI element         |
| `db-migrations`    | Editing `prisma/schema.prisma`, adding models/fields, or running any `db:*` command |
| `folder-structure` | Creating any new file, domain, entity, or directory                                 |
| `imports`          | Writing or editing any TypeScript or TSX file (import ordering is always required)  |
| `frontend-design`  | Building any new page, layout, landing section, or significant UI surface           |
| `vitest-tests`     | Writing, running, or fixing any test file                                           |
| `skill-creator`    | Creating, editing, or evaluating agent skills                                       |
| `seo-audit`        | Any SEO analysis, keyword research, or on-page optimization task                    |

Append this block to the delegation message with the matched skills:

```
Project Skills — load via Skill tool before starting work:
<list each matched skill, one per line>
These skills encode the authoritative conventions for this codebase and override general knowledge. Load every listed skill before writing any file.
```

Rules:
- **Always inject at minimum `folder-structure` and `imports`** when the task creates or edits any TypeScript/TSX file.
- **Never inject SpecKit skills** (`speckit-*`) into general task subagents.
- **Skip injection entirely** for tasks that are purely read-only or shell-only (no file writes).
- **When in doubt, over-inject** — an unneeded skill is less harmful than a missing one.
- **`react-components` y `orpc-endpoints` son los skills más frecuentemente omitidos.** Cuando el task involucre cualquier archivo en `src/components/`, `src/data/`, o `src/orpc/`, estos skills son OBLIGATORIOS aunque parezca una tarea pequeña.

## Project Rules

- **No direct oRPC calls in components.** Always go through `src/data/*/` hooks.
- **Prisma client lives in `generated/prisma/`**, not `node_modules`. Import via `import { prisma } from '@/db/db'`.
- **Env vars** via `import { env } from '@/env/server'` (server-only) or `@/env/client` (VITE_ prefix). Never access `process.env` directly.
- **React Compiler is active.** Do not add `useMemo`, `useCallback`, or `React.memo` — the compiler handles memoization.
- **Path alias `@/` maps to `src/`.** Always use alias imports, never deep relative paths.
- **Soft-deletes only** for Complex and Field. Never hard-delete these entities.
- **Add Shadcn components** via `pnpx shadcn@latest add <component>`.
- **No git operations.** Agents must NOT run `git add`, `git commit`, `git push`, or any other git write command. All version control is managed by the developer.
