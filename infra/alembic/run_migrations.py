"""Minimal migration entrypoint used by deployment manifests."""

from __future__ import annotations

from importlib import import_module
import os
from pathlib import Path
import sys
from typing import Any, cast

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def main() -> None:
    dialect = os.environ.get("PERSISTENCE_BACKEND", "postgresql")
    migrations = [
        cast(Any, import_module("infra.alembic.versions.0001_enterprise_schema")),
        cast(
            Any, import_module("infra.alembic.versions.0002_portable_analysis_schema")
        ),
    ]
    print("\n\n".join(_upgrade(migration, dialect) for migration in migrations))


def _upgrade(migration: Any, dialect: str) -> str:
    try:
        return cast(str, migration.upgrade(dialect))
    except TypeError:
        return cast(str, migration.upgrade())


if __name__ == "__main__":
    main()
