"""Default ASGI app for local development."""

from __future__ import annotations

from .factory import create_app

app = create_app()
