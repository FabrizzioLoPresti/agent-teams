---
name: db-migration
description: Create and apply Prisma database migrations for alta-cancha-fs. Handles schema changes, migration files, and post-migration steps following ADR-002, ADR-009, ADR-011 conventions.
argument-hint: "<migration description>"
---

# db-migration

Design and apply a **safe, production-ready Prisma migration** for alta-cancha-fs.

## Scope Discipline

**Only modify `prisma/schema.prisma` and the migration files required by this task.** Do not reformat, restructure, or touch any other file — even if you notice issues while reading for context. Report unrelated issues; never fix them inline.

## Step-by-step process

### Step 1 — Read current schema

Always start by reading `prisma/schema.prisma` to understand the current state before making changes.

### Step 2 — Design the schema change

Apply these conventions:

**Model fields — always include:**
```prisma
id        String   @id @default(cuid())
createdAt DateTime @default(now()) @db.Timestamptz
updatedAt DateTime @updatedAt @db.Timestamptz
```

**Soft delete (ADR-009) — for entities that should not be hard-deleted:**
```prisma
deletedAt DateTime? @db.Timestamptz  // null = active, set = deleted
```

**Financial values (ADR-011) — never Float:**
```prisma
pricePerHour Decimal @db.Decimal(10, 2)
totalAmount  Decimal @db.Decimal(10, 2)
```

**Datetime fields (ADR-008) — always Timestamptz:**
```prisma
startDateTime DateTime @db.Timestamptz
endDateTime   DateTime @db.Timestamptz
```

**Working schedule times — String HH:MM:**
```prisma
openTime  String  // "08:00" — local timezone, NOT Timestamptz
closeTime String  // "22:00"
```

**Divisible fields (ADR-012) — self-referential relation:**
```prisma
parentFieldId String?
parentField   Field?   @relation("FieldSubFields", fields: [parentFieldId], references: [id])
subFields     Field[]  @relation("FieldSubFields")
```

### Step 3 — Add appropriate indexes

```prisma
// For conflict detection queries
@@index([fieldId, startDateTime, endDateTime])

// For user-filtered queries
@@index([userId, createdAt])

// For soft-delete filtered queries
@@index([deletedAt, createdAt])
```

### Step 4 — Apply migration

```bash
pnpm db:migrate
# This runs: prisma migrate dev --name <migration-name>
# Creates migration SQL in prisma/migrations/
# Applies migration to the database
```

**REQUIRED after every schema change:**
```bash
pnpm db:generate
# Regenerates the Prisma client with updated types
```

### Step 5 — Verify migration

After applying:
1. Check the generated SQL in `prisma/migrations/[timestamp]_[name]/migration.sql`
2. Verify the Prisma client generates without errors
3. Confirm TypeScript types reflect the new schema

## Migration Checklist

- [ ] New model has `id`, `createdAt`, `updatedAt` fields
- [ ] All datetime fields use `@db.Timestamptz`
- [ ] All monetary fields use `Decimal @db.Decimal(10, 2)`, not `Float`
- [ ] Working schedule times use `String` (HH:MM), not datetime
- [ ] Soft-delete models have `deletedAt DateTime?`
- [ ] Indexes added for foreign keys in WHERE clauses
- [ ] Indexes added for sort fields on large tables
- [ ] `pnpm db:migrate` succeeded
- [ ] `pnpm db:generate` succeeded
- [ ] No TypeScript errors after generation

## Common Schema Patterns

### New entity with owner relationship
```prisma
model NewEntity {
  id        String    @id @default(cuid())
  title     String
  ownerId   String
  owner     User      @relation(fields: [ownerId], references: [id])
  deletedAt DateTime? @db.Timestamptz
  createdAt DateTime  @default(now()) @db.Timestamptz
  updatedAt DateTime  @updatedAt @db.Timestamptz

  @@index([ownerId, createdAt])
  @@index([deletedAt, createdAt])
}
```

### Adding a nullable field to existing model
```prisma
// Add with ? (optional) to avoid breaking existing records
newField String?  // Prisma sets to NULL for existing rows
```

### Adding a required field to existing model
```prisma
// Must provide @default() or the migration will fail on existing data
status String @default("ACTIVE")
```

## Rules

- NEVER edit migration SQL files manually after creation
- NEVER use `Float` for monetary values
- ALWAYS use `@db.Timestamptz` for datetime columns
- ALWAYS run `pnpm db:generate` after `pnpm db:migrate`
- If a migration fails in production, follow `docs/runbooks/database-migrations.md`
- Working schedule (openTime/closeTime) stores HH:MM strings, not timestamps
