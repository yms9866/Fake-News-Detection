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
from packages.contracts.python.analysis_contracts import (
    AnalysisResponse,
    EvidenceSummaryItem,
    ExtractionMetadata,
    JobError,
    JobProgressEvent,
    JobResponse,
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
