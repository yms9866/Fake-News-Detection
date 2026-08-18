"""Analyze-content workflow shared by CLI and future API clients."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import json
import logging
from time import perf_counter

from packages.backend.fnd.application.services.evidence_pipeline import (
    EvidenceReviewPipeline,
)
from packages.backend.fnd.application.services.verdict_policy import VerdictPolicy
from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    AnalyzeContentCommand,
    AtomicClaim,
    EvidenceAnalysis,
    ExtractedDocument,
    SearchContext,
    StyleAnalysis,
    normalize_text,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    FinalVerdict,
    StyleRiskSignal,
)
from packages.backend.fnd.domain.errors import UnsupportedInputError
from packages.backend.fnd.ports.extraction import (
    FileExtractor,
    TextExtractor,
    UrlExtractor,
)
from packages.backend.fnd.ports.llm import LanguageModelEvidenceProvider
from packages.backend.fnd.ports.search import SearchProvider
from packages.backend.fnd.ports.style_model import StyleModelProvider

logger = logging.getLogger(__name__)


def _log_timing(event: str, **fields: float | str) -> None:
    payload: dict[str, float | str] = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=True))


@dataclass
class AnalyzeContentWorkflow:
    text_extractor: TextExtractor
    url_extractor: UrlExtractor
    file_extractor: FileExtractor
    style_model: StyleModelProvider
    search_provider: SearchProvider
    evidence_provider: LanguageModelEvidenceProvider
    verdict_policy: VerdictPolicy
    evidence_review_pipeline: EvidenceReviewPipeline | None = None

    def analyze(self, command: AnalyzeContentCommand) -> AnalysisResult:
        document = self._extract(command)
        return self.analyze_document(
            document=document,
            deep_check=command.deep_check,
            max_length=command.max_length,
            max_search_results=command.max_search_results,
        )

    def analyze_document(
        self,
        *,
        document: ExtractedDocument,
        deep_check: bool = False,
        max_length: int | None = None,
        max_search_results: int | None = None,
    ) -> AnalysisResult:
        analysis_start = perf_counter()
        resolved_max_length = max_length or 1024
        timings_ms: dict[str, float] = {}
        run_parallel = bool(deep_check and normalize_text(document.text))

        if run_parallel:
            max_results = max_search_results or 6
            with ThreadPoolExecutor(max_workers=2) as pool:
                style_future = pool.submit(
                    self._analyze_style,
                    document.text,
                    resolved_max_length,
                )
                deep_future = pool.submit(
                    self._run_deep_check,
                    document.text,
                    max_results,
                )
                style, style_ms = style_future.result()
                search_context, evidence, claims, search_ms, evidence_ms = (
                    deep_future.result()
                )
            timings_ms["style_analysis"] = style_ms
            timings_ms["search_and_source_review"] = search_ms
            timings_ms["evidence_analysis"] = evidence_ms
        else:
            style, style_ms = self._analyze_style(
                document.text,
                resolved_max_length,
            )
            timings_ms["style_analysis"] = style_ms
            search_context = None
            evidence = None
            claims = ()

        final = self.verdict_policy.decide(style=style, evidence=evidence)
        timings_ms["analysis_total"] = (perf_counter() - analysis_start) * 1000
        _log_timing(
            "analysis_timing",
            analysis_duration_ms=round(timings_ms["analysis_total"], 3),
            style_analysis_duration_ms=round(timings_ms["style_analysis"], 3),
            input_type=document.input_type.value,
            word_count=str(style.word_count),
            parallel_analysis="true" if run_parallel else "false",
        )
        return AnalysisResult(
            document=document,
            style=style,
            evidence=evidence,
            search_context=search_context,
            final=final,
            claims=claims,
            timings_ms=timings_ms,
        )

    def _analyze_style(self, text: str, max_length: int) -> tuple[StyleAnalysis, float]:
        started = perf_counter()
        try:
            style = self.style_model.analyze(text, max_length=max_length)
        except Exception as exc:
            style = StyleAnalysis.from_prediction(
                signal=StyleRiskSignal.ERROR,
                confidence=None,
                text=text,
                error=str(exc),
            )
        return style, (perf_counter() - started) * 1000

    def _run_deep_check(
        self, text: str, max_results: int
    ) -> tuple[
        SearchContext,
        EvidenceAnalysis,
        tuple[AtomicClaim, ...],
        float,
        float,
    ]:
        search_start = perf_counter()
        if self.evidence_review_pipeline is not None:
            reviewed = self.evidence_review_pipeline.review(
                text=text,
                max_results=max_results,
            )
            claims = reviewed.claims
            search_context = reviewed.search_context
        else:
            search_context = self.search_provider.search(
                claim_text=text,
                max_results=max_results,
            )
            claims = ()
        search_ms = (perf_counter() - search_start) * 1000

        evidence_start = perf_counter()
        evidence = self.evidence_provider.verify(
            claim_text=text,
            search_context=search_context,
        )
        evidence_ms = (perf_counter() - evidence_start) * 1000
        return search_context, evidence, tuple(claims), search_ms, evidence_ms

    def _extract(self, command: AnalyzeContentCommand) -> ExtractedDocument:
        if command.text:
            return self.text_extractor.extract(command.text)

        if command.url:
            return self.url_extractor.extract(command.url)

        if command.file_path:
            return self.file_extractor.extract(command.file_path)

        raise UnsupportedInputError("You must provide text, URL, or file input.")

    def _evidence_provider_has_missing_key(self) -> bool:
        return getattr(self.evidence_provider, "api_key", None) in {None, ""}


class DisabledEvidenceProvider:
    def verify(
        self, claim_text: str, search_context: SearchContext
    ) -> EvidenceAnalysis:
        return EvidenceAnalysis(
            provider_name="disabled",
            verdict=FinalVerdict.ERROR,
            evidence_quality=EvidenceQuality.LOW,
            confidence=EvidenceQuality.LOW,
            explanation="External AI verification is disabled.",
            recommendation="Enable external AI and configure a provider key to run deep checks.",
            items=search_context.reviewed_sources,
            grounding_used=bool(search_context.reviewed_sources),
            raw_context=search_context.raw_context,
            error="EXTERNAL_AI_DISABLED",
        )
