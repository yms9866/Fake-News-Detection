"""Analyze-content workflow shared by CLI and future API clients."""

from __future__ import annotations

from dataclasses import dataclass

from packages.backend.fnd.application.services.verdict_policy import VerdictPolicy
from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    AnalyzeContentCommand,
    EvidenceAnalysis,
    ExtractedDocument,
    SearchContext,
    StyleAnalysis,
)
from packages.backend.fnd.domain.enums import EvidenceQuality, FinalVerdict, StyleRiskSignal
from packages.backend.fnd.domain.errors import UnsupportedInputError
from packages.backend.fnd.ports.extraction import FileExtractor, TextExtractor, UrlExtractor
from packages.backend.fnd.ports.llm import LanguageModelEvidenceProvider
from packages.backend.fnd.ports.search import SearchProvider
from packages.backend.fnd.ports.style_model import StyleModelProvider


@dataclass
class AnalyzeContentWorkflow:
    text_extractor: TextExtractor
    url_extractor: UrlExtractor
    file_extractor: FileExtractor
    style_model: StyleModelProvider
    search_provider: SearchProvider
    evidence_provider: LanguageModelEvidenceProvider
    verdict_policy: VerdictPolicy

    def analyze(self, command: AnalyzeContentCommand) -> AnalysisResult:
        document = self._extract(command)
        max_length = command.max_length or 1024

        try:
            style = self.style_model.analyze(document.text, max_length=max_length)
        except Exception as exc:
            style = StyleAnalysis(
                signal=StyleRiskSignal.ERROR,
                confidence=None,
                error=str(exc),
            )

        search_context: SearchContext | None = None
        evidence: EvidenceAnalysis | None = None

        if command.deep_check:
            if self._evidence_provider_has_missing_key():
                evidence = self.evidence_provider.verify(
                    claim_text=document.text,
                    search_context=SearchContext(query="", raw_context=""),
                )
            else:
                max_results = command.max_search_results or 6
                search_context = self.search_provider.search(
                    claim_text=document.text,
                    max_results=max_results,
                )
                evidence = self.evidence_provider.verify(
                    claim_text=document.text,
                    search_context=search_context,
                )

        final = self.verdict_policy.decide(style=style, evidence=evidence)
        return AnalysisResult(
            document=document,
            style=style,
            evidence=evidence,
            search_context=search_context,
            final=final,
        )

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
    def verify(self, claim_text: str, search_context: SearchContext) -> EvidenceAnalysis:
        return EvidenceAnalysis(
            provider_name="disabled",
            verdict=FinalVerdict.ERROR,
            evidence_quality=EvidenceQuality.LOW,
            explanation="External AI verification is disabled.",
            recommendation="Enable external AI and configure a provider key to run deep checks.",
            raw_context=search_context.raw_context,
            error="EXTERNAL_AI_DISABLED",
        )
