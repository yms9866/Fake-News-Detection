"""Ports for optional advisory forensic plugins."""

from __future__ import annotations

from typing import Protocol

from packages.backend.fnd.domain.forensics import (
    ForensicPluginMetadata,
    ForensicPluginReadiness,
    ForensicPluginRequest,
    ForensicPluginResult,
)


class ForensicPlugin(Protocol):
    def metadata(self) -> ForensicPluginMetadata: ...

    def readiness(self) -> ForensicPluginReadiness: ...

    def analyze(self, request: ForensicPluginRequest) -> ForensicPluginResult: ...
