"""Deterministic forensic plugins for tests and local smoke checks."""

from __future__ import annotations

from dataclasses import dataclass

from packages.backend.fnd.domain.enums import MediaType
from packages.backend.fnd.domain.forensics import (
    ForensicPluginMetadata,
    ForensicPluginReadiness,
    ForensicPluginRequest,
    ForensicPluginResult,
    ForensicSignal,
)


@dataclass(frozen=True)
class DeterministicForensicPlugin:
    name: str
    signal: ForensicSignal = ForensicSignal.INCONCLUSIVE
    confidence: float | None = 0.5
    media_types: tuple[MediaType, ...] = (MediaType.IMAGE,)
    warning: str | None = None
    ready: bool = True
    version: str = "1.0.0"
    model_version: str = "deterministic-v1"

    def metadata(self) -> ForensicPluginMetadata:
        return ForensicPluginMetadata(
            name=self.name,
            version=self.version,
            supported_media_types=self.media_types,
            required_capabilities=("deterministic_fixture",),
            model_version=self.model_version,
            provider="test-double",
        )

    def readiness(self) -> ForensicPluginReadiness:
        return ForensicPluginReadiness(
            ready=self.ready,
            detail="ready" if self.ready else "disabled fixture",
        )

    def analyze(self, request: ForensicPluginRequest) -> ForensicPluginResult:
        warnings = (self.warning,) if self.warning else ()
        return ForensicPluginResult(
            plugin_name=self.name,
            plugin_version=self.version,
            media_type=request.media_type,
            signal=self.signal,
            confidence=self.confidence,
            scope_reliable=True,
            evidence=(f"sha256:{request.sha256}",),
            warnings=warnings,
            model_version=self.model_version,
        )
