"""Health endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Request

from apps.api.app.dependencies import get_container, get_model_registry
from apps.api.app.middleware import get_request_id, get_trace_id
from apps.api.app.state import ApiContainer, ModelRegistry
from packages.contracts.python.analysis_contracts import (
    ComponentStatus,
    HealthResponse,
    ReadinessResponse,
)

router = APIRouter(tags=["health"])


@router.get("/health/live", response_model=HealthResponse)
def live(request: Request) -> HealthResponse:
    return HealthResponse(
        status="live",
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
    )


@router.get("/health/ready", response_model=ReadinessResponse)
def ready(
    request: Request,
    container: ApiContainer = Depends(get_container),
    model_registry: ModelRegistry = Depends(get_model_registry),
) -> ReadinessResponse:
    model_exists = model_registry.model_exists()
    provider = container.workflow.evidence_provider
    provider_key = getattr(provider, "api_key", None)
    external_ai_status: Literal["configured", "missing", "disabled"] = (
        "configured" if provider_key else "missing"
    )
    if not container.settings.enable_external_ai:
        external_ai_status = "disabled"

    components = [
        ComponentStatus(
            name="modernbert_model_path",
            status="ready" if model_exists else "missing",
            detail=str(model_registry.model_path),
        ),
        ComponentStatus(
            name="modernbert_model_runtime",
            status="loaded" if model_registry.is_loaded() else "unloaded",
            detail="Model loads lazily and is reused by the composition root.",
        ),
        ComponentStatus(
            name="search_provider",
            status="configured",
            detail=container.workflow.search_provider.__class__.__name__,
        ),
        ComponentStatus(
            name="evidence_provider",
            status=external_ai_status,
            detail=provider.__class__.__name__,
        ),
        ComponentStatus(
            name="live_ocr_sessions",
            status="ready" if container.live_service is not None else "missing",
            detail="SSE live OCR sessions with explicit source selection.",
        ),
    ]
    media_capabilities: dict[str, object] = {}
    if container.media_probe is not None:
        media_capabilities.update(container.media_probe.capabilities())
    if container.media_preprocessor is not None:
        media_capabilities.update(container.media_preprocessor.capabilities())

    for name, value in media_capabilities.items():
        if isinstance(value, dict):
            available = bool(value.get("available", False))
            detail = ", ".join(f"{key}={item}" for key, item in value.items())
        else:
            available = bool(value)
            detail = str(value)
        components.append(
            ComponentStatus(
                name=str(name),
                status="ready" if available else "missing",
                detail=detail,
            )
        )

    enterprise_components = {
        "postgresql": container.settings.database_url,
        "redis_queue": container.settings.redis_url,
        "s3_object_storage": container.settings.s3_bucket,
        "oidc": container.settings.oidc_issuer and container.settings.oidc_client_id,
        "opentelemetry": container.settings.otel_endpoint,
    }
    for name, configured in enterprise_components.items():
        components.append(
            ComponentStatus(
                name=name,
                status="configured" if configured else "disabled",
                detail=(
                    "Configured for enterprise mode."
                    if configured
                    else "Disabled in local mode."
                ),
            )
        )

    return ReadinessResponse(
        status="ready" if model_exists else "unready",
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
        components=components,
    )
