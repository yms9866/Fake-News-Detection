"""Registry and orchestration for advisory forensic plugins."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError
from dataclasses import dataclass
from time import perf_counter

from packages.backend.fnd.domain.forensics import (
    ForensicPluginMetadata,
    ForensicPluginReadiness,
    ForensicPluginRequest,
    ForensicPluginResult,
    plugin_failure_result,
)
from packages.backend.fnd.domain.media import MediaMetadata, StoredArtifact
from packages.backend.fnd.ports.forensics import ForensicPlugin


@dataclass(frozen=True)
class RegisteredForensicPlugin:
    metadata: ForensicPluginMetadata
    enabled: bool
    readiness: ForensicPluginReadiness


class ForensicPluginRegistry:
    def __init__(
        self,
        plugins: tuple[ForensicPlugin, ...] = (),
        *,
        default_timeout_seconds: float = 2.0,
        concurrency_limit: int = 2,
    ) -> None:
        self._plugins: dict[str, ForensicPlugin] = {}
        self._enabled: set[str] = set()
        self._default_timeout_seconds = max(0.001, default_timeout_seconds)
        self._executor = ThreadPoolExecutor(max_workers=max(1, concurrency_limit))
        for plugin in plugins:
            self.register(plugin)

    def register(self, plugin: ForensicPlugin, *, enabled: bool = True) -> None:
        metadata = plugin.metadata()
        if metadata.name in self._plugins:
            raise ValueError(f"Forensic plugin {metadata.name} is already registered.")
        self._plugins[metadata.name] = plugin
        if enabled:
            self._enabled.add(metadata.name)

    def enable(self, name: str) -> None:
        if name not in self._plugins:
            raise KeyError(name)
        self._enabled.add(name)

    def disable(self, name: str) -> None:
        self._enabled.discard(name)

    def list_plugins(self) -> list[RegisteredForensicPlugin]:
        plugins: list[RegisteredForensicPlugin] = []
        for name in sorted(self._plugins):
            plugin = self._plugins[name]
            plugins.append(
                RegisteredForensicPlugin(
                    metadata=plugin.metadata(),
                    enabled=name in self._enabled,
                    readiness=self._safe_readiness(plugin),
                )
            )
        return plugins

    def analyze_artifact(
        self,
        *,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        timeout_seconds: float | None = None,
    ) -> list[ForensicPluginResult]:
        request = ForensicPluginRequest(
            media_type=artifact.media_type,
            artifact_path=artifact.path,
            mime_type=artifact.mime_type,
            size_bytes=artifact.size_bytes,
            sha256=artifact.sha256,
            metadata=metadata,
        )
        timeout = timeout_seconds or self._default_timeout_seconds
        results: list[ForensicPluginResult] = []
        for name in sorted(self._enabled):
            plugin = self._plugins[name]
            plugin_metadata = plugin.metadata()
            if artifact.media_type not in plugin_metadata.supported_media_types:
                continue
            readiness = self._safe_readiness(plugin)
            if not readiness.ready:
                results.append(
                    plugin_failure_result(
                        metadata=plugin_metadata,
                        media_type=artifact.media_type,
                        failure_class="not_ready",
                        warning=readiness.detail or "Forensic plugin is not ready.",
                    )
                )
                continue
            results.append(self._run_plugin(plugin, plugin_metadata, request, timeout))
        return results

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _safe_readiness(self, plugin: ForensicPlugin) -> ForensicPluginReadiness:
        try:
            return plugin.readiness()
        except Exception as exc:
            return ForensicPluginReadiness(
                ready=False,
                detail=f"Readiness failed: {exc.__class__.__name__}",
            )

    def _run_plugin(
        self,
        plugin: ForensicPlugin,
        metadata: ForensicPluginMetadata,
        request: ForensicPluginRequest,
        timeout_seconds: float,
    ) -> ForensicPluginResult:
        started = perf_counter()
        future = self._executor.submit(plugin.analyze, request)
        try:
            result = future.result(timeout=timeout_seconds)
        except TimeoutError:
            future.cancel()
            return plugin_failure_result(
                metadata=metadata,
                media_type=request.media_type,
                failure_class="timeout",
                warning="Forensic plugin timed out.",
                latency_ms=round((perf_counter() - started) * 1000, 3),
            )
        except Exception as exc:
            return plugin_failure_result(
                metadata=metadata,
                media_type=request.media_type,
                failure_class=exc.__class__.__name__,
                warning="Forensic plugin failed without affecting the final verdict.",
                latency_ms=round((perf_counter() - started) * 1000, 3),
            )
        if result.latency_ms is not None:
            return result
        return ForensicPluginResult(
            plugin_name=result.plugin_name,
            plugin_version=result.plugin_version,
            media_type=result.media_type,
            signal=result.signal,
            confidence=result.confidence,
            scope_reliable=result.scope_reliable,
            evidence=result.evidence,
            warnings=result.warnings,
            model_version=result.model_version,
            latency_ms=round((perf_counter() - started) * 1000, 3),
            failure_class=result.failure_class,
            metadata=result.metadata,
        )
