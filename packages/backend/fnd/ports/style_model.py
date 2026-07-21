"""Style model port."""

from __future__ import annotations

from typing import Protocol

from packages.backend.fnd.domain.entities import StyleAnalysis


class StyleModelProvider(Protocol):
    def analyze(self, text: str, max_length: int) -> StyleAnalysis:
        ...
