"""Forensic plugin discovery endpoints."""

from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, Depends, Request

from apps.api.app.dependencies import get_forensic_plugin_registry
from apps.api.app.middleware import get_request_id, get_trace_id
from packages.backend.fnd.application.services.forensics import ForensicPluginRegistry
from packages.contracts.python.analysis_contracts import (
    ForensicPluginInfo,
    ForensicPluginsResponse,
)

router = APIRouter(tags=["forensic plugins"])


@router.get("/forensic-plugins", response_model=ForensicPluginsResponse)
def list_forensic_plugins(
    request: Request,
    registry: ForensicPluginRegistry = Depends(get_forensic_plugin_registry),
) -> ForensicPluginsResponse:
    plugins = []
    for plugin in registry.list_plugins():
        plugins.append(
            ForensicPluginInfo(
                name=plugin.metadata.name,
                version=plugin.metadata.version,
                supported_media_types=cast(
                    Any,
                    [
                        media_type.value
                        for media_type in plugin.metadata.supported_media_types
                    ],
                ),
                required_capabilities=list(plugin.metadata.required_capabilities),
                enabled=plugin.enabled,
                ready=plugin.readiness.ready,
                readiness_detail=plugin.readiness.detail,
                model_version=plugin.metadata.model_version,
                provider=plugin.metadata.provider,
            )
        )
    return ForensicPluginsResponse(
        plugins=plugins,
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
    )
