"""Default dependency wiring for the local Slice 1 application."""

from __future__ import annotations

from packages.backend.fnd.adapters.extraction.file import LocalFileExtractor
from packages.backend.fnd.adapters.extraction.text import DirectTextExtractor
from packages.backend.fnd.adapters.extraction.url import UrlArticleExtractor
from packages.backend.fnd.adapters.extraction.url_safety import (
    SafePageFetcher,
    UrlSafetyPolicy,
)
from packages.backend.fnd.adapters.llm.gemini_grounding import (
    GeminiGroundedSearchEvidenceProvider,
)
from packages.backend.fnd.adapters.models.modernbert import ModernBertStyleModel
from packages.backend.fnd.application.services.verdict_policy import VerdictPolicy
from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
    DisabledEvidenceProvider,
)
from packages.backend.fnd.config.settings import Settings


def build_analyze_content_workflow(settings: Settings) -> AnalyzeContentWorkflow:
    safety_policy = UrlSafetyPolicy()
    fetcher = SafePageFetcher(
        safety_policy=safety_policy,
        timeout_seconds=settings.request_timeout_seconds,
        max_bytes=settings.max_url_bytes,
    )

    if settings.enable_external_ai:
        provider = GeminiGroundedSearchEvidenceProvider(
            api_key=settings.gemini_api_key,
            model_name=settings.gemini_model,
            timeout_seconds=settings.request_timeout_seconds,
        )
        search_provider = provider
        evidence_provider = provider
    else:
        search_provider = _DisabledSearchProvider()
        evidence_provider = DisabledEvidenceProvider()

    return AnalyzeContentWorkflow(
        text_extractor=DirectTextExtractor(),
        url_extractor=UrlArticleExtractor(fetcher=fetcher),
        file_extractor=LocalFileExtractor(),
        style_model=ModernBertStyleModel(model_path=settings.modernbert_model_path),
        search_provider=search_provider,
        evidence_provider=evidence_provider,
        verdict_policy=VerdictPolicy(
            high_style_risk_threshold=settings.high_style_risk_threshold
        ),
        evidence_review_pipeline=None,
    )


class _DisabledSearchProvider:
    def search(self, claim_text: str, max_results: int):
        del max_results
        from packages.backend.fnd.domain.entities import SearchContext

        return SearchContext(
            query=claim_text,
            error="EXTERNAL_AI_DISABLED",
            raw_context="External evidence analysis is disabled.",
        )
