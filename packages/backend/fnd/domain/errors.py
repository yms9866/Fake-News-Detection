"""Stable domain errors for application workflows."""

from __future__ import annotations


class FndError(Exception):
    """Base class for platform errors."""

    code = "FND_ERROR"


class ExtractionError(FndError):
    code = "EXTRACTION_ERROR"


class UnsupportedInputError(FndError):
    code = "UNSUPPORTED_INPUT"


class UnsafeUrlError(FndError):
    code = "UNSAFE_URL"
