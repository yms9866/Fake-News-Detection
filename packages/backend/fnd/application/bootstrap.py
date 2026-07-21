"""Default dependency wiring for the local Slice 1 application."""

from __future__ import annotations

from packages.backend.fnd.adapters.extraction.file import LocalFileExtractor
from packages.backend.fnd.adapters.extraction.text import DirectTextExtractor
from packages.backend.fnd.adapters.extraction.url import UrlArticleExtractor
from packages.backend.fnd.adapters.extraction.url_safety import SafePageFetcher, UrlSafetyPolicy
from packages.backend.fnd.adapters.llm.gemini import GeminiEvidenceProvider
from packages.backend.fnd.adapters.models.modernbert import ModernBertStyleModel
from packages.backend.fnd.adapters.search.duckduckgo import DuckDuckGoSearchProvider
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

    evidence_provider = (
        GeminiEvidenceProvider(
            api_key=settings.gemini_api_key,
            model_name=settings.gemini_model,
        )
        if settings.enable_external_ai
        else DisabledEvidenceProvider()
    )

    return AnalyzeContentWorkflow(
        text_extractor=DirectTextExtractor(),
        url_extractor=UrlArticleExtractor(fetcher=fetcher),
        file_extractor=LocalFileExtractor(),
        style_model=ModernBertStyleModel(model_path=settings.modernbert_model_path),
        search_provider=DuckDuckGoSearchProvider(),
        evidence_provider=evidence_provider,
        verdict_policy=VerdictPolicy(),
    )
