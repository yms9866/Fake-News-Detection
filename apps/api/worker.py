"""Production worker entrypoint placeholder.

Slice 9 adds the deployable worker shape while retaining the in-process queue for
local mode and tests. A production deployment wires this entrypoint to the
selected Redis-backed queue consumer.
"""

from __future__ import annotations


def main() -> None:
    raise SystemExit(
        "Configure the production Redis worker consumer before starting apps.api.worker."
    )


if __name__ == "__main__":
    main()
