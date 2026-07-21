"""Live OCR session endpoints."""

from __future__ import annotations

import json
from typing import Any, cast

from fastapi import APIRouter, Depends, Query
from fastapi import Request
from fastapi.responses import StreamingResponse

from apps.api.app.dependencies import (
    get_live_event_repository,
    get_live_service,
)
from apps.api.app.middleware import get_request_id, get_trace_id
from apps.api.app.serializers import (
    live_event_response_from_domain,
    live_session_response_from_domain,
)
from packages.backend.fnd.adapters.live.in_memory import (
    InMemoryLiveSessionEventRepository,
)
from packages.backend.fnd.application.services.live_ocr import (
    CreateLiveSessionCommand,
    LiveOcrSessionService,
    SubmitLiveFrameCommand,
    VerifyLiveSessionCommand,
)
from packages.backend.fnd.domain.live import (
    LiveOcrBlock as DomainLiveOcrBlock,
    LiveRegion as DomainLiveRegion,
    LiveSessionConfig,
    LiveSourceType,
    LiveVerificationTrigger,
)
from packages.contracts.python.analysis_contracts import (
    ApiErrorResponse,
    CreateLiveSessionRequest,
    LiveSessionResponse,
    SubmitLiveFrameRequest,
    VerifyLiveSessionRequest,
)

router = APIRouter(tags=["live ocr"])

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    400: {"model": ApiErrorResponse},
    403: {"model": ApiErrorResponse},
    404: {"model": ApiErrorResponse},
    422: {"model": ApiErrorResponse},
    500: {"model": ApiErrorResponse},
}


@router.post(
    "/live-sessions",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def create_live_session(
    payload: CreateLiveSessionRequest,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    session = service.create(
        CreateLiveSessionCommand(
            source_type=LiveSourceType(payload.source_type),
            source_id=payload.source_id,
            permission_granted=payload.permission_granted,
            region=_region(payload.region),
            source_url=str(payload.source_url) if payload.source_url else None,
            config=_config(payload),
        )
    )
    return _response(session, request)


@router.get(
    "/live-sessions/{session_id}",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def get_live_session(
    session_id: str,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    return _response(service.get(session_id), request)


@router.post(
    "/live-sessions/{session_id}/frames",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def submit_live_frame(
    session_id: str,
    payload: SubmitLiveFrameRequest,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    session = service.submit_frame(
        SubmitLiveFrameCommand(
            session_id=session_id,
            frame_id=payload.frame_id,
            perceptual_hash=payload.perceptual_hash,
            ocr_text=payload.ocr_text,
            ocr_blocks=tuple(
                DomainLiveOcrBlock(
                    text=block.text,
                    confidence=block.confidence,
                    bbox=_region(block.bbox),
                )
                for block in payload.ocr_blocks
            ),
            dom_text=payload.dom_text,
            source_url=str(payload.source_url) if payload.source_url else None,
        )
    )
    return _response(session, request)


@router.post(
    "/live-sessions/{session_id}/pause",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def pause_live_session(
    session_id: str,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    return _response(service.pause(session_id), request)


@router.post(
    "/live-sessions/{session_id}/resume",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def resume_live_session(
    session_id: str,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    return _response(service.resume(session_id), request)


@router.post(
    "/live-sessions/{session_id}/stop",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def stop_live_session(
    session_id: str,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    return _response(service.stop(session_id), request)


@router.post(
    "/live-sessions/{session_id}/cancel",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def cancel_live_session(
    session_id: str,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    return _response(service.cancel(session_id), request)


@router.post(
    "/live-sessions/{session_id}/verify",
    response_model=LiveSessionResponse,
    responses=ERROR_RESPONSES,
)
def verify_live_session(
    session_id: str,
    payload: VerifyLiveSessionRequest,
    request: Request,
    service: LiveOcrSessionService = Depends(get_live_service),
) -> LiveSessionResponse:
    return _response(
        service.verify(
            VerifyLiveSessionCommand(
                session_id=session_id,
                trigger=LiveVerificationTrigger(payload.trigger),
                deep_check=payload.deep_check,
                max_length=payload.max_length,
                force=payload.force,
            )
        ),
        request,
    )


@router.get(
    "/live-sessions/{session_id}/events",
    response_model=None,
    responses={
        **ERROR_RESPONSES,
        200: {
            "content": {"text/event-stream": {"schema": {"type": "string"}}},
            "description": "Server-Sent Events stream of live OCR progress.",
        },
    },
)
def get_live_events(
    session_id: str,
    request: Request,
    after_sequence: int = Query(default=0, ge=0),
    service: LiveOcrSessionService = Depends(get_live_service),
    events: InMemoryLiveSessionEventRepository = Depends(get_live_event_repository),
) -> StreamingResponse:
    service.get(session_id)
    event_payloads = [
        live_event_response_from_domain(event).model_dump(mode="json")
        for event in events.list_events(session_id, after_sequence=after_sequence)
    ]

    def stream_events():
        for payload in event_payloads:
            yield "event: live_ocr\n"
            yield f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


def _config(payload: CreateLiveSessionRequest) -> LiveSessionConfig:
    settings = payload.settings
    return LiveSessionConfig(
        capture_interval_ms=settings.capture_interval_ms,
        perceptual_change_threshold=settings.perceptual_change_threshold,
        stability_required_frames=settings.stability_required_frames,
        ocr_language=settings.ocr_language,
        max_buffer_chars=settings.max_buffer_chars,
        max_events=settings.max_events,
        ai_cleaning_cooldown_seconds=settings.ai_cleaning_cooldown_seconds,
        verification_cooldown_seconds=settings.verification_cooldown_seconds,
        max_session_duration_seconds=settings.max_session_duration_seconds,
    )


def _region(region: object) -> DomainLiveRegion | None:
    if region is None:
        return None
    value = cast(Any, region)
    return DomainLiveRegion(
        x=value.x,
        y=value.y,
        width=value.width,
        height=value.height,
    )


def _response(session: object, request: Request) -> LiveSessionResponse:
    return live_session_response_from_domain(
        cast(Any, session),
        request_id=get_request_id(request),
        trace_id=get_trace_id(request),
    )
