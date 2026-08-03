"""Backward-compatible CLI import for Gemini Google Search grounding."""

from __future__ import annotations

from packages.backend.fnd.adapters.llm.gemini_grounding import (
    GeminiGroundedSearchEvidenceProvider,
)

__all__ = ["GeminiGroundedSearchEvidenceProvider"]
