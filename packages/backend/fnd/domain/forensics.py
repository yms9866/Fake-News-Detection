"""Domain contracts for advisory multimodal forensic plugins."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any

from packages.backend.fnd.domain.entities import utc_now
from packages.backend.fnd.domain.enums import MediaType
from packages.backend.fnd.domain.media import MediaMetadata


class ForensicSignal(str, Enum):
    NONE = "NONE"
    SUSPICIOUS = "SUSPICIOUS"
    INCONCLUSIVE = "INCONCLUSIVE"
    ERROR = "ERROR"


@dataclass(frozen=True)
class ForensicPluginMetadata:
    name: str
    version: str
    supported_media_types: tuple[MediaType, ...]
    required_capabilities: tuple[str, ...] = ()
    model_version: str | None = None
    provider: str = "local"


@dataclass(frozen=True)
class ForensicPluginReadiness:
    ready: bool
    detail: str = ""
    checked_at: datetime = field(default_factory=utc_now)


@dataclass(frozen=True)
class ForensicPluginRequest:
    media_type: MediaType
    artifact_path: Path
    mime_type: str
    size_bytes: int
    sha256: str
    metadata: MediaMetadata


@dataclass(frozen=True)
class ForensicPluginResult:
    plugin_name: str
    plugin_version: str
    media_type: MediaType
    signal: ForensicSignal
    confidence: float | None = None
    scope_reliable: bool = True
    evidence: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    model_version: str | None = None
    latency_ms: float | None = None
    failure_class: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def public_dict(self) -> dict[str, Any]:
        return {
            "plugin_name": self.plugin_name,
            "plugin_version": self.plugin_version,
            "media_type": self.media_type.value,
            "signal": self.signal.value,
            "confidence": self.confidence,
            "scope_reliable": self.scope_reliable,
            "evidence": list(self.evidence),
            "warnings": list(self.warnings),
            "model_version": self.model_version,
            "latency_ms": self.latency_ms,
            "failure_class": self.failure_class,
            "metadata": self.metadata,
        }


def plugin_failure_result(
    *,
    metadata: ForensicPluginMetadata,
    media_type: MediaType,
    failure_class: str,
    warning: str,
    latency_ms: float | None = None,
) -> ForensicPluginResult:
    return ForensicPluginResult(
        plugin_name=metadata.name,
        plugin_version=metadata.version,
        media_type=media_type,
        signal=ForensicSignal.ERROR,
        confidence=None,
        scope_reliable=False,
        warnings=(warning,),
        model_version=metadata.model_version,
        latency_ms=latency_ms,
        failure_class=failure_class,
    )
