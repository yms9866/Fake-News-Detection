"""Extraction ports."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from packages.backend.fnd.domain.entities import ExtractedDocument


class TextExtractor(Protocol):
    def extract(self, text: str) -> ExtractedDocument:
        ...


class UrlExtractor(Protocol):
    def extract(self, url: str) -> ExtractedDocument:
        ...


class FileExtractor(Protocol):
    def extract(self, path: Path) -> ExtractedDocument:
        ...
