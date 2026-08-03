"""Stable domain errors for application workflows."""

from __future__ import annotations


class FndError(Exception):
    """Base class for platform errors."""

    code = "FND_ERROR"

    def __init__(self, message: str = "", *, code: str | None = None) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code


class ExtractionError(FndError):
    code = "EXTRACTION_ERROR"


class UnsupportedInputError(FndError):
    code = "UNSUPPORTED_INPUT"


class UnsafeUrlError(FndError):
    code = "UNSAFE_URL"


class MediaValidationError(FndError):
    code = "MEDIA_VALIDATION_ERROR"


class JobStateError(FndError):
    code = "INVALID_JOB_STATE_TRANSITION"


class JobNotFoundError(FndError):
    code = "JOB_NOT_FOUND"


class JobCancelledError(FndError):
    code = "JOB_CANCELLED"


class AuthenticationError(FndError):
    code = "AUTHENTICATION_REQUIRED"
