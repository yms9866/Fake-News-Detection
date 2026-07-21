"""Minimal migration entrypoint used by deployment manifests."""

from __future__ import annotations

from importlib import import_module
from typing import Any, cast


def main() -> None:
    migration = cast(
        Any, import_module("infra.alembic.versions.0001_enterprise_schema")
    )
    print(migration.upgrade())


if __name__ == "__main__":
    main()
