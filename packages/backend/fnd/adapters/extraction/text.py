"""Direct text extraction adapter."""

from __future__ import annotations

from packages.backend.fnd.domain.entities import ExtractedDocument, normalize_text
from packages.backend.fnd.domain.enums import InputType
from packages.backend.fnd.domain.errors import ExtractionError


class DirectTextExtractor:
    def extract(self, text: str) -> ExtractedDocument:
        extracted = normalize_text(text)

        if not extracted:
            raise ExtractionError("Extracted text is empty.")

        return ExtractedDocument(
            input_type=InputType.DIRECT_TEXT,
            text=extracted,
            source="direct-text",
        )
