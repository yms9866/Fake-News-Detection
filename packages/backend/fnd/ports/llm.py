"""Language-model evidence structuring port."""

from __future__ import annotations

from typing import Protocol

from packages.backend.fnd.domain.entities import EvidenceAnalysis, SearchContext


class LanguageModelEvidenceProvider(Protocol):
    def verify(self, claim_text: str, search_context: SearchContext) -> EvidenceAnalysis:
        ...
