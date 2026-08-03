"""Convert application workflow results into shared API contracts."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Sequence, cast
from urllib.parse import urlparse

from packages.backend.fnd.domain.media import (
    AnalysisJob,
    JobProgressEvent as DomainJobProgressEvent,
    MediaAnalysisAccepted as DomainMediaAnalysisAccepted,
)
from packages.backend.fnd.domain.entities import AnalysisResult
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    StyleRiskSignal,
)
from packages.backend.fnd.domain.live import (
    LiveRegion as DomainLiveRegion,
    LiveSession as DomainLiveSession,
    LiveSessionEvent as DomainLiveSessionEvent,
)
from packages.contracts.python.analysis_contracts import (
    AnalysisResponse,
    ClaimResponse,
    EvidenceSummaryItem,
    EvidenceSummaryStatement,
    ExtractionMetadata,
    FinalAssessmentResponse,
    ForensicPluginResultResponse,
    GeminiClaimAssessmentResponse,
    GeminiEvidenceAssessmentResponse,
    JobError,
    JobProgressEvent,
    JobResponse,
    LiveRegion,
    LiveSessionEventResponse,
    LiveSessionResponse,
    LiveVerificationSnapshotResponse,
    MediaAnalysisAccepted,
    ReviewedSourceResponse,
    SearchQueryResponse,
    SearchSummaryResponse,
    SourcePassageResponse,
    StyleAssessmentResponse,
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

    indexed_items = list(enumerate(evidence.items, start=1))
    qualifying_source_ids, qualifying_source_count = _qualifying_evidence_details(
        indexed_items
    )
    items = [
        EvidenceSummaryItem(
            source_id=f"source-{index}",
            source_number=index,
            url=_safe_evidence_url(item.url),
            title=item.title,
            publisher=item.publisher,
            domain=_domain_from_url(item.url),
            stance=item.stance.value,
            source_type=item.source_type.value,
            reliability=item.reliability.value,
            fetched=item.fetched,
            used_in_explanation=f"source-{index}" in qualifying_source_ids,
            citation_label=f"Source {index}",
        )
        for index, item in indexed_items
    ]

    user_verdict, user_quality, explanation = _user_facing_verification(
        result=result,
        qualifying_source_count=qualifying_source_count,
    )
    summary_items = [
        EvidenceSummaryStatement(
            text=str(item),
            source_ids=sorted(qualifying_source_ids),
        )
        for item in evidence.evidence_summary
    ]

    return VerificationResponse(
        verdict=user_verdict.value if user_verdict else None,
        evidence_quality=user_quality.value if user_quality else None,
        explanation=explanation,
        recommendation=evidence.recommendation,
        evidence_summary=list(evidence.evidence_summary),
        evidence_summary_items=summary_items,
        evidence=items,
        qualifying_source_count=qualifying_source_count,
        raw_assessment=None,
        web_context=None,
        error=_stable_provider_error(evidence.error),
    )


def _safe_evidence_url(value: str) -> str:
    raw = str(value or "").strip()
    if not raw or any(ord(char) < 32 or ord(char) == 127 for char in raw):
        return ""
    try:
        parsed = urlparse(raw)
    except ValueError:
        return ""
    if parsed.scheme not in {"http", "https"}:
        return ""
    if not parsed.hostname or parsed.username or parsed.password:
        return ""
    return raw


def _domain_from_url(value: str) -> str:
    safe_url = _safe_evidence_url(value)
    if not safe_url:
        return ""
    parsed = urlparse(safe_url)
    return parsed.hostname or ""


def _is_qualifying_evidence(item: object) -> bool:
    return bool(
        getattr(item, "fetched", False)
        and getattr(item, "reliability", EvidenceQuality.UNKNOWN)
        in {EvidenceQuality.HIGH, EvidenceQuality.MEDIUM}
        and not getattr(item, "is_original_claim", False)
        and not getattr(item, "mentions_only", False)
        and getattr(item, "matches_claim", False)
        and not getattr(item, "outdated", False)
        and getattr(item, "stance", EvidenceStance.UNKNOWN)
        in {EvidenceStance.SUPPORTS, EvidenceStance.CONTRADICTS}
    )


def _qualifying_evidence_details(
    indexed_items: Sequence[tuple[int, object]],
) -> tuple[set[str], int]:
    source_ids: set[str] = set()
    groups: set[str] = set()
    for index, item in indexed_items:
        if not _is_qualifying_evidence(item):
            continue
        source_id = f"source-{index}"
        source_ids.add(source_id)
        groups.add(_independence_group(item))
    return source_ids, len(groups)


def _independence_group(item: object) -> str:
    try:
        group = getattr(item, "independence_group")
    except Exception:
        group = None
    return str(
        group
        or getattr(item, "copied_from", None)
        or getattr(item, "independence_key", None)
        or getattr(item, "canonical_url", None)
        or getattr(item, "publisher", None)
        or getattr(item, "url", "")
    )


def _user_facing_verification(
    *,
    result: AnalysisResult,
    qualifying_source_count: int,
) -> tuple[FinalVerdict | None, EvidenceQuality | None, str]:
    evidence = result.evidence
    assert evidence is not None
    final_verdict = result.final.verdict
    if evidence.error or evidence.verdict == FinalVerdict.ERROR:
        return FinalVerdict.UNVERIFIED, EvidenceQuality.LOW, evidence.explanation

    if final_verdict in {FinalVerdict.REAL, FinalVerdict.FAKE}:
        return final_verdict, result.final.confidence, evidence.explanation

    if evidence.verdict in {FinalVerdict.REAL, FinalVerdict.FAKE}:
        return (
            FinalVerdict.UNVERIFIED,
            EvidenceQuality.LOW,
            (
                "The provider's raw assessment was not accepted as verified evidence "
                "by the deterministic policy. Qualified fetched sources were "
                f"insufficient ({qualifying_source_count})."
            ),
        )

    return evidence.verdict, evidence.evidence_quality, evidence.explanation


def _claim_responses(result: AnalysisResult) -> list[ClaimResponse]:
    return [
        ClaimResponse(
            claim_id=claim.claim_id,
            sequence=claim.sequence,
            claim_text=claim.claim_text,
            normalized_claim=claim.normalized_claim,
            importance=cast(Any, claim.importance.value),
            claim_type=claim.claim_type.value,
            entities=list(claim.entities),
            people=list(claim.people),
            organizations=list(claim.organizations),
            locations=list(claim.locations),
            detected_dates=list(claim.detected_dates),
            publication_period=claim.publication_period,
            verifiability=claim.verifiability,
            search_queries=list(claim.search_queries),
            verification_status=claim.verification_status.value,
            confidence=cast(Any, claim.confidence.value),
            explanation=claim.explanation,
            supporting_source_ids=list(claim.supporting_source_ids),
            contradicting_source_ids=list(claim.contradicting_source_ids),
            unresolved_reason=claim.unresolved_reason,
        )
        for claim in result.claims
    ]


def _search_summary(result: AnalysisResult) -> SearchSummaryResponse:
    context = result.search_context
    if context is None:
        return SearchSummaryResponse(
            limitations=[
                "Gemini Google Search grounding was not run for this analysis."
            ]
        )

    indexed_items = list(enumerate(context.reviewed_sources, start=1))
    _, qualifying_source_count = _qualifying_evidence_details(indexed_items)
    queries = [
        SearchQueryResponse(
            query_id=record.query_id,
            claim_id=record.claim_id,
            query=record.query,
            query_type=record.query_type,
            result_count=record.result_count,
            searched_at=record.searched_at,
            status="failed" if record.error else "completed",
            message="Search could not be completed." if record.error else "",
        )
        for record in context.queries
    ]
    limitations: list[str] = []
    if context.error:
        limitations.append("Gemini Google Search grounding could not be completed.")
    if context.results and not context.reviewed_sources:
        limitations.append(
            "Search results were found, but source pages could not be fully reviewed."
        )
    return SearchSummaryResponse(
        queries=queries,
        total_queries=len(context.queries),
        total_results=len(context.results),
        reviewed_source_count=len(context.reviewed_sources),
        qualifying_source_count=qualifying_source_count,
        limitations=limitations,
    )


def _reviewed_sources(result: AnalysisResult) -> list[ReviewedSourceResponse]:
    context = result.search_context
    if context is None:
        return []
    return [
        ReviewedSourceResponse(
            source_id=item.source_id or f"source-{index}",
            related_claim_ids=list(item.related_claim_ids),
            citation_label=f"Source {index}",
            url=_safe_evidence_url(item.url),
            title=item.title,
            publisher=item.publisher,
            domain=_domain_from_url(item.url),
            source_type=item.source_type.value,
            reliability=cast(Any, item.reliability.value),
            reliability_reason=item.reliability_reason,
            stance=item.stance.value,
            fetched=item.fetched,
            fetch_message=_friendly_fetch_message(item),
            relevant_passages=[
                SourcePassageResponse(
                    text=passage.text,
                    relevance_score=max(0.0, min(1.0, passage.relevance_score)),
                )
                for passage in item.relevant_passages
            ],
            qualification=(
                "qualifies"
                if item.qualification_status == "QUALIFIED"
                else "does_not_qualify"
            ),
            qualification_explanation=_qualification_explanation(item),
            used_in_explanation=item.used_in_explanation,
        )
        for index, item in enumerate(context.reviewed_sources, start=1)
    ]


def _gemini_evidence(
    result: AnalysisResult,
) -> GeminiEvidenceAssessmentResponse | None:
    evidence = result.evidence
    if evidence is None:
        return None
    provider = evidence.provider_name
    if provider not in {"gemini", "gemini_google_search", "disabled"}:
        provider = "unavailable"
    return GeminiEvidenceAssessmentResponse(
        provider=cast(Any, provider),
        grounding_used=evidence.grounding_used,
        assessment=evidence.verdict.value if evidence.verdict else None,
        confidence=cast(Any, evidence.confidence.value),
        evidence_quality=cast(Any, evidence.evidence_quality.value),
        explanation=evidence.explanation,
        claims=[
            GeminiClaimAssessmentResponse(
                claim_id=assessment.claim_id,
                verdict=assessment.verdict.value,
                confidence=cast(Any, assessment.confidence.value),
                supporting_source_ids=list(assessment.supporting_source_ids),
                contradicting_source_ids=list(assessment.contradicting_source_ids),
                explanation=assessment.explanation,
                unresolved_reason=assessment.unresolved_reason,
            )
            for assessment in evidence.claim_assessments
        ],
        limitations=list(evidence.limitations),
        recommendation=evidence.recommendation,
        error_message=_friendly_provider_error(evidence.error),
    )


def _final_assessment(result: AnalysisResult) -> FinalAssessmentResponse:
    return FinalAssessmentResponse(
        verdict=result.final.verdict.value,
        confidence=cast(Any, result.final.confidence.value),
        reason=result.final.reason,
        policy_version=result.final.policy_version,
    )


def _friendly_fetch_message(item: object) -> str:
    if getattr(item, "fetched", False):
        return "The source page was reviewed."
    return "A search result appears relevant, but the source page could not be fully reviewed."


def _qualification_explanation(item: object) -> str:
    if getattr(item, "qualification_status", "") == "QUALIFIED":
        return "This reviewed source was relevant, reliable enough, and counted as independent evidence."
    reasons = set(getattr(item, "rejection_reasons", ()) or ())
    messages = {
        "SOURCE_NOT_FETCHED": "The source page could not be fully reviewed.",
        "FETCH_BLOCKED": "The source could not be safely fetched.",
        "FETCH_TIMEOUT": "The source took too long to respond.",
        "HTTP_ERROR": "The source page could not be opened successfully.",
        "UNSUPPORTED_CONTENT_TYPE": "The source was not a readable article page.",
        "SEARCH_SNIPPET_ONLY": "Only a search snippet was available.",
        "IRRELEVANT_TO_CLAIM": "The reviewed content did not directly address the claim.",
        "NO_SUPPORTING_PASSAGE": "The page mentioned the topic but did not provide a direct supporting or contradicting passage.",
        "LOW_RELIABILITY": "The source is useful as a lead but is not reliable enough to count as confirmation.",
        "UNKNOWN_SOURCE": "The source reliability is not yet known.",
        "DUPLICATE_SOURCE_FAMILY": "This source repeats another report and was not counted as independent confirmation.",
        "DATE_MISMATCH": "The source appears to discuss a different time period.",
    }
    return " ".join(messages[reason] for reason in messages if reason in reasons) or (
        "This source did not qualify as independent evidence."
    )


def _stable_provider_error(error: str | None) -> str | None:
    if not error:
        return None
    return str(error).split(":", 1)[0].strip() or "EVIDENCE_PROVIDER_FAILED"


def _friendly_provider_error(error: str | None) -> str | None:
    if not error:
        return None
    code = _stable_provider_error(error)
    if code == "GEMINI_API_KEY_MISSING":
        return "Gemini evidence analysis is unavailable because the API key is not configured."
    if code == "EXTERNAL_AI_DISABLED":
        return "External evidence analysis is disabled in this environment."
    return "The evidence service could not complete the review."


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
        style_assessment=StyleAssessmentResponse(
            signal=result.style.signal.value,
            display_label=result.style.display_label,
            display_text=result.style.display_text,
            confidence_level=cast(Any, result.style.confidence_level),
            confidence_score=result.style.confidence,
            display_confidence=result.style.display_confidence,
            scope_reliable=result.style.scope_reliable,
            word_count=result.style.word_count,
            minimum_word_count=result.style.minimum_word_count,
            warning=result.style.warning,
            limitation=result.style.limitation,
        ),
        claims=_claim_responses(result),
        search_summary=_search_summary(result),
        sources=_reviewed_sources(result),
        gemini_evidence=_gemini_evidence(result),
        final_assessment=_final_assessment(result),
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
