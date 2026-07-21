"""Model registry endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from apps.api.app.dependencies import get_model_registry
from apps.api.app.middleware import get_request_id, get_trace_id
from apps.api.app.state import ModelRegistry
from packages.contracts.python.analysis_contracts import ModelInfo, ModelsResponse

router = APIRouter(tags=["models"])


@router.get("/models", response_model=ModelsResponse)
def list_models(
    request: Request,
    registry: ModelRegistry = Depends(get_model_registry),
) -> ModelsResponse:
    return ModelsResponse(
        models=[
            ModelInfo(
                name="modernbert_fake_news",
                path=str(registry.model_path),
                exists=registry.model_exists(),
                loaded=registry.is_loaded(),
                label_map={0: "HIGH_STYLE_RISK", 1: "LOW_STYLE_RISK"},
                max_length=registry.max_length,
            )
        ],
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
    )
