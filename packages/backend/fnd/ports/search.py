"""Search provider port."""

from __future__ import annotations

from typing import Protocol

from packages.backend.fnd.domain.entities import SearchContext


class SearchProvider(Protocol):
    def search(self, claim_text: str, max_results: int) -> SearchContext: ...
