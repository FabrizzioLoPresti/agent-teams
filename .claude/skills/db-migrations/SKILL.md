---
name: db-migrations
description: >
  Safe database schema migrations for alta-cancha-fs (Prisma ORM + PostgreSQL). Use this skill whenever you need to modify the schema, run migrations, regenerate TypeScript types, add a new model or field, rename or drop columns safely, change a column type, add indexes, or handle any database schema change. Always use this skill before editing prisma/schema.prisma or running any pnpm db:* command, to ensure schema changes are safe and no existing data is lost.
---

# Prisma Workflow for alta-cancha-fs

**Stack:** Prisma v7 + PostgreSQL + `@prisma/adapter-pg` (driver-adapter mode)
**Client output:** `generated/prisma/` (not the default `node_modules`)
**Env:** all `db:*` commands load `.env.local` via `dotenv-cli`

---

## Commands

```bash
pnpm db:migrate    # Create and apply a new migration (dev)
pnpm db:generate   # Regenerate Prisma client (TypeScript types)
pnpm db:push       # Push schema without migration — dev/prototyping ONLY
pnpm db:studio     # Open Prisma Studio
pnpm db:seed       # Seed the database

# Run migration with an explicit name (skips the interactive name prompt)
pnpx prisma migrate dev --name migration_name
```

Run `pnpm db:generate` **every time** you change `schema.prisma` — even if you already ran `db:migrate`. The migration updates the DB; `generate` updates the TypeScript types.

Never use `db:push` outside of early local prototyping. It bypasses the migration system and can silently drop data.

---

## Standard workflow for any schema change

1. Edit `prisma/schema.prisma`
2. `pnpm db:migrate` — Prisma diffs the schema, generates SQL, and applies it. You'll be prompted for a migration name (use snake_case, e.g. `add_field_images`)
3. Review the generated SQL in `prisma/migrations/<timestamp>_<name>/migration.sql` before confirming
4. `pnpm db:generate` — updates the TypeScript client in `generated/prisma/`
5. Commit both `schema.prisma` and the new `prisma/migrations/` directory together

---

## Schema patterns (follow exactly what's in the codebase)

### IDs
- Better Auth models (`User`, `Session`, `Account`, `Verification`): `String @id` (no default — Better Auth assigns the ID)
- Domain models: `String @id @default(cuid())`

### Timestamps
- System timestamps: `DateTime @default(now())` / `DateTime @updatedAt` (stored as `TIMESTAMP(3)`, no explicit `@db`)
- Business timestamps (booking start/end, unavailabilities): `DateTime @db.Timestamptz` — always UTC
- Local times (open/close hours): `String @db.VarChar(5)` — stored as `"HH:MM"`, interpreted using `Complex.timezone`

### Soft deletes
```prisma
isActive  Boolean   @default(true)
deletedAt DateTime? // UTC - Soft delete timestamp
deletedBy String?   // userId who deleted
```
Never hard-delete a Complex or Field with future bookings. Check before deleting.

### Indexes
Define them explicitly with `@@index()` and `@@unique()`. Always index:
- Foreign keys (`@@index([ownerId])`)
- Columns used in `WHERE` filters
- Composite indexes for common query patterns (e.g. `@@index([fieldId, status, startDateTime])`)

### Table naming
Always add `@@map("snake_case_table_name")` to every model.

### String lengths
Use `@db.VarChar(n)` for all user-facing strings. Use `@db.Text` for long text (description, notes, comments).

### Foreign keys
Always specify `onDelete` behavior:
- `onDelete: Cascade` — when parent is deleted, children are too (images, schedules, sub-fields)
- `onDelete: SetNull` — when parent is deleted, the FK becomes null (e.g. `Review.bookingId`)

---

## Safe patterns for risky changes

### Adding a new NOT NULL column to an existing table

Prisma will error if you add `NOT NULL` without a default on a table that has rows. Two safe approaches:

**A — provide a `@default`:**
```prisma
newColumn String @default("value") @db.VarChar(50)
```

**B — add as nullable first, backfill, then make NOT NULL:**
```sql
-- migration 1: add nullable
ALTER TABLE "my_table" ADD COLUMN "newCol" TEXT;
-- migration 2 (after backfill): add NOT NULL constraint
ALTER TABLE "my_table" ALTER COLUMN "newCol" SET NOT NULL;
```
To do this in Prisma: add the column as optional (`String?`), migrate, run a backfill script, then change to `String` and migrate again.

### Renaming a column

Prisma detects renames during `db:migrate` and asks: "Did you rename `oldName` to `newName`?" Answer **yes** — this generates a safe `ALTER TABLE RENAME COLUMN` instead of DROP + ADD (which loses data).

If you skip the interactive prompt (CI), use `--create-only` and edit the SQL manually before applying:
```bash
pnpm db:migrate -- --create-only
# edit migration.sql: replace DROP COLUMN + ADD COLUMN with RENAME COLUMN
pnpm db:migrate  # apply
```

### Renaming a model (table)

Same principle. Add `@@map("new_name")` while keeping the Prisma model name stable — or update both and handle the rename in the migration SQL.

### Changing a column type (e.g. Float → Decimal)

Prisma generates `ALTER TABLE ... ALTER COLUMN ... SET DATA TYPE ...`. This is safe when PostgreSQL can cast the type automatically (e.g. `DOUBLE PRECISION` → `DECIMAL(10,2)`). Always check the generated SQL — look for the `Warnings:` comment Prisma adds when data could be affected.

For incompatible type changes, use the three-step approach:
1. Add a new column with the new type
2. `UPDATE table SET new_col = CAST(old_col AS new_type)`
3. Drop the old column and rename the new one

### Adding a new enum value

Safe — just add the value and migrate. Existing rows are unaffected.

### Removing or renaming an enum value

Dangerous if rows reference it. Always check: `SELECT COUNT(*) FROM "table" WHERE "col" = 'OLD_VALUE'` before removing. If any rows reference it, migrate the data first.

### Dropping a column or table

Prisma will warn you in the migration SQL. Before applying:
- Confirm no application code references the column/table
- For tables: confirm no rows exist, or that losing them is intentional
- For soft-deleted data (`isActive=false`): decide whether to archive before dropping

---

## Adding a new domain model

Follow this checklist when adding a new model:

1. **ID**: `String @id @default(cuid())`
2. **Timestamps**: `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`
3. **Soft delete** (if needed): `isActive Boolean @default(true)` + `deletedAt DateTime?`
4. **FK relations**: specify `onDelete` on every `@relation`
5. **`@@map`**: snake_case table name
6. **Indexes**: at minimum, index every FK column and any column used in filters
7. **String types**: `@db.VarChar(n)` or `@db.Text` — never bare `String` for user content
8. **Business timestamps**: `@db.Timestamptz` if they represent a moment in time

---

## Migrations are git history — treat them that way

Never edit or delete a migration that has already been applied to any environment. If you need to undo a change, write a new migration that reverses it. The `prisma/migrations/` directory is the audit trail of the schema.

Migration names should describe what changed: `add_field_images`, `change_hourlyrate_to_decimal`, `add_booking_indexes` — not `update_schema` or `fix`.
