"""FastAPI application factory."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .composition import build_container
from .errors import register_error_handlers
from .middleware import RequestContextMiddleware
from .routes import analyses, auth, forensics, health, jobs, live, media, models
from .state import ApiContainer

DEFAULT_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:5500/",
]


def create_app(
    container: ApiContainer | None = None,
    allowed_origins: list[str] | None = None,
) -> FastAPI:
    origins = allowed_origins or DEFAULT_ALLOWED_ORIGINS
    if "*" in origins:
        raise ValueError("Wildcard CORS origins are not allowed.")

    app = FastAPI(
        title="Fake News Detection API",
        version="0.3.0",
        description="Local-first API adapter for fake-news and media analysis.",
    )
    app.state.container = container or build_container()
    app.state.allowed_origins = list(origins)

    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Idempotency-Key",
            "X-Request-ID",
            "X-CSRF-Token",
            "X-Trace-ID",
        ],
        expose_headers=["X-Request-ID", "X-Trace-ID"],
    )

    register_error_handlers(app)
    app.router.on_startup.append(app.state.container.start)
    app.router.on_shutdown.append(app.state.container.stop)

    app.include_router(health.router, prefix="/v1")
    app.include_router(auth.router, prefix="/v1")
    app.include_router(models.router, prefix="/v1")
    app.include_router(analyses.router, prefix="/v1")
    app.include_router(media.router, prefix="/v1")
    app.include_router(jobs.router, prefix="/v1")
    app.include_router(live.router, prefix="/v1")
    app.include_router(forensics.router, prefix="/v1")

    return app
