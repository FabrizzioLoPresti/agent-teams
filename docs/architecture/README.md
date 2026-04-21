# Alta Cancha Architecture

System architecture documentation. Each section is in its own file.

## Index

| # | Section | Description |
|---|---------|-------------|
| 1 | [Overview](./01-overview.md) | General description, actors, and context diagram |
| 2 | [Domain Model](./02-domain-model.md) | Aggregates, entities, divisible fields, and relationships |
| 3 | [Layers](./03-layers.md) | Layered architecture and routing conventions |
| 4 | [Data Flow](./04-data-flow.md) | E2E flow, isomorphic client, and middleware chain |
| 5 | [Auth](./05-auth.md) | Authentication, RBAC authorization, and rate limiting |
| 6 | [Key Decisions](./06-key-decisions.md) | Summary of main ADRs |
| 7 | [Infrastructure](./07-infrastructure.md) | Infrastructure, local environment, and observability |
| 8 | [Glossary](./08-glossary.md) | Domain and technical terms |

## Related Documents

- [`docs/decisions/`](../decisions/) — Detailed ADRs per architectural decision
- [`docs/runbooks/`](../runbooks/) — Operational guides (migrations, deploys, etc.)
- [`CLAUDE.md`](../../CLAUDE.md) — Commands, stack, and project conventions
