# fnd-database-portability

Use this guide when touching persistence, migrations, readiness, or database configuration.

Paths:

- `packages/backend/fnd/ports/enterprise.py`
- `packages/backend/fnd/adapters/persistence/`
- `infra/alembic/`
- `infra/docker/compose.yaml`
- `apps/api/app/routes/health.py`

Rules:

- Keep in-memory adapters for unit tests and local smoke checks.
- Support `PERSISTENCE_BACKEND=memory|postgresql|mysql`.
- Do not put SQL or ORM models in the domain layer.
- Use portable JSON/text/timestamp behavior unless a dialect branch is necessary.
- Hide credentials and driver details from readiness responses.

Database support is only user-facing after migrations and integration tests pass against the selected database.

