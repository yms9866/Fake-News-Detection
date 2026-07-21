"""Convert application workflow results into shared API contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from packages.backend.fnd.domain.media import (
    AnalysisJob,
    JobProgressEvent as DomainJobProgressEvent,
    MediaAnalysisAccepted as DomainMediaAnalysisAccepted,
)
from packages.backend.fnd.domain.entities import AnalysisResult
from packages.backend.fnd.domain.enums import StyleRiskSignal
from packages.backend.fnd.domain.live import (
    LiveRegion as DomainLiveRegion,
    LiveSession as DomainLiveSession,
    LiveSessionEvent as DomainLiveSessionEvent,
)
from packages.contracts.python.analysis_contracts import (
    AnalysisResponse,
    EvidenceSummaryItem,
    ExtractionMetadata,
    ForensicPluginResultResponse,
    JobError,
    JobProgressEvent,
    JobResponse,
    LiveRegion,
    LiveSessionEventResponse,
    LiveSessionResponse,
    LiveVerificationSnapshotResponse,
    MediaAnalysisAccepted,
    VerificationResponse,
)


def _source_url(result: AnalysisResult) -> str | None:
    metadata_url = result.document.metadata.get("url")
    if metadata_url:
        return str(metadata_url)
    if result.document.source and result.document.source.startswith(
        ("http://", "https://")
    ):
        return result.document.source
    return None


def _warnings(result: AnalysisResult) -> list[str]:
    warnings: list[str] = []

    if result.style.warning:
        warnings.append(result.style.warning)

    if result.style.signal == StyleRiskSignal.ERROR and result.style.error:
        warnings.append(
            "Local style model failed. The final verdict does not use style evidence."
        )

    if result.search_context is not None and result.search_context.error:
        warnings.append("Web search failed. Evidence verification may be incomplete.")

    if result.evidence is not None and result.evidence.error:
        warnings.append("Evidence provider failed. The final verdict is UNVERIFIED.")

    for item in _forensic_results(result):
        for warning in item.warnings:
            warnings.append(f"Forensic advisory ({item.plugin_name}): {warning}")
        if item.signal == "SUSPICIOUS":
            warnings.append(
                f"Forensic advisory ({item.plugin_name}) reported a suspicious signal."
            )

    return warnings


def _verification(result: AnalysisResult) -> VerificationResponse | None:
    evidence = result.evidence
    if evidence is None:
        return None

    items = [
        EvidenceSummaryItem(
            url=item.url,
            title=item.title,
            stance=item.stance.value,
            source_type=item.source_type.value,
            reliability=item.reliability.value,
            fetched=item.fetched,
        )
        for item in evidence.items
    ]

    web_context = (
        result.search_context.raw_context
        if result.search_context is not None
        else evidence.raw_context
    )

    return VerificationResponse(
        verdict=evidence.verdict.value if evidence.verdict else None,
        evidence_quality=evidence.evidence_quality.value,
        explanation=evidence.explanation,
        recommendation=evidence.recommendation,
        evidence_summary=list(evidence.evidence_summary),
        evidence=items,
        web_context=web_context,
        error=evidence.error,
    )


def _forensic_results(result: AnalysisResult) -> list[ForensicPluginResultResponse]:
    raw_results = result.document.metadata.get("forensic_results", [])
    if not isinstance(raw_results, list):
        return []
    responses: list[ForensicPluginResultResponse] = []
    for item in raw_results:
        if isinstance(item, dict):
            responses.append(ForensicPluginResultResponse.model_validate(item))
    return responses


def analysis_response_from_result(
    result: AnalysisResult,
    *,
    analysis_id: str,
    request_id: str,
    trace_id: str,
    created_at: datetime,
    completed_at: datetime,
) -> AnalysisResponse:
    media_type = result.document.metadata.get("media_type")
    extraction_metadata_payload = result.document.metadata.get("extraction_metadata")
    extraction_metadata = (
        ExtractionMetadata.model_validate(extraction_metadata_payload)
        if isinstance(extraction_metadata_payload, dict)
        else None
    )
    return AnalysisResponse(
        analysis_id=analysis_id,
        status="completed",
        input_type=result.document.input_type.value,
        media_type=cast(Any, str(media_type)) if media_type else None,
        extracted_text=result.document.text,
        cleaned_text=result.document.text,
        source_url=_source_url(result),
        media_metadata=result.document.metadata.get("media_metadata"),
        extraction_metadata=extraction_metadata,
        style_signal=result.style.signal.value,
        style_confidence=result.style.confidence,
        style_scope_reliable=result.style.scope_reliable,
        style_word_count=result.style.word_count,
        style_minimum_word_count=result.style.minimum_word_count,
        style_warning=result.style.warning,
        verification=_verification(result),
        forensic_results=_forensic_results(result),
        final_verdict=result.final.verdict.value,
        confidence=result.final.confidence.value,
        reason=result.final.reason,
        warnings=_warnings(result),
        created_at=created_at,
        completed_at=completed_at,
        request_id=request_id,
        trace_id=trace_id,
    )


def media_accepted_response_from_domain(
    accepted: DomainMediaAnalysisAccepted,
) -> MediaAnalysisAccepted:
    return MediaAnalysisAccepted(
        analysis_id=accepted.analysis_id,
        job_id=accepted.job_id,
        status="queued",
        input_type="file",
        media_type=cast(Any, accepted.media_type.value),
        status_url=f"/v1/analyses/{accepted.analysis_id}",
        job_url=f"/v1/jobs/{accepted.job_id}",
        events_url=f"/v1/jobs/{accepted.job_id}/events",
        request_id=accepted.request_id,
        trace_id=accepted.trace_id,
    )


def job_response_from_domain(job: AnalysisJob) -> JobResponse:
    return JobResponse(
        job_id=job.job_id,
        analysis_id=job.analysis_id,
        status=cast(Any, job.status.value),
        progress=job.progress,
        current_stage=cast(Any, job.current_stage),
        message=job.message,
        created_at=job.created_at,
        started_at=job.started_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
        error=(
            JobError(
                code=job.error.code,
                message=job.error.message,
                retryable=job.error.retryable,
            )
            if job.error
            else None
        ),
        request_id=job.request_id,
        trace_id=job.trace_id,
    )


def job_event_response_from_domain(
    event: DomainJobProgressEvent,
) -> JobProgressEvent:
    return JobProgressEvent(
        event_id=event.event_id,
        job_id=event.job_id,
        sequence=event.sequence,
        status=cast(Any, event.status.value),
        progress=event.progress,
        message=event.message,
        timestamp=event.timestamp,
        metadata=event.metadata,
    )


def _live_region(region: DomainLiveRegion | None) -> LiveRegion | None:
    if region is None:
        return None
    return LiveRegion(
        x=region.x,
        y=region.y,
        width=region.width,
        height=region.height,
    )


def live_session_response_from_domain(
    session: DomainLiveSession,
    *,
    request_id: str,
    trace_id: str,
) -> LiveSessionResponse:
    latest = session.latest_verification
    return LiveSessionResponse(
        session_id=session.session_id,
        status=cast(Any, session.status.value),
        source_type=cast(Any, session.source_type.value),
        source_id=session.source_id,
        region=_live_region(session.region),
        source_url=session.source_url,
        stable_text=session.stable_text,
        pending_text=session.pending_text,
        frame_count=session.frame_count,
        skipped_frame_count=session.skipped_frame_count,
        changed_frame_count=session.changed_frame_count,
        buffer_chars=len(session.stable_text),
        visible_indicator_required=session.visible_indicator_required,
        visible_indicator_active=session.visible_indicator_active,
        frame_bytes_retained=session.frame_bytes_retained,
        ai_cleaning_call_count=session.ai_cleaning_call_count,
        verification_count=session.verification_count,
        latest_verification=(
            LiveVerificationSnapshotResponse(
                analysis_id=latest.analysis_id,
                trigger=cast(Any, latest.trigger.value),
                final_verdict=latest.final_verdict,
                confidence=cast(Any, latest.confidence),
                reason=latest.reason,
                verified_at=latest.verified_at,
                rate_limited=latest.rate_limited,
            )
            if latest
            else None
        ),
        created_at=session.created_at,
        updated_at=session.updated_at,
        completed_at=session.completed_at,
        request_id=request_id,
        trace_id=trace_id,
    )


def live_event_response_from_domain(
    event: DomainLiveSessionEvent,
) -> LiveSessionEventResponse:
    return LiveSessionEventResponse(
        event_id=event.event_id,
        session_id=event.session_id,
        sequence=event.sequence,
        event_type=cast(Any, event.event_type.value),
        status=cast(Any, event.status.value),
        message=event.message,
        timestamp=event.timestamp,
        metadata=event.metadata,
    )
