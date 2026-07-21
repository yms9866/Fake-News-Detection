"""Export the FastAPI OpenAPI schema to a JSON file."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from apps.api.app.factory import create_app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export OpenAPI schema.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("packages/contracts/openapi/openapi.json"),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    app = create_app()
    schema = app.openapi()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(schema, indent=2, ensure_ascii=True),
        encoding="utf-8",
    )
    print(f"Wrote OpenAPI schema to {args.output}")


if __name__ == "__main__":
    main()
