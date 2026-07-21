"""OpenTelemetry-compatible no-SDK recorder boundary."""

from __future__ import annotations

from dataclasses import dataclass, field
from time import perf_counter
from typing import Any


@dataclass
class InMemoryTraceRecorder:
    events: list[dict[str, Any]] = field(default_factory=list)

    def record(self, name: str, attributes: dict[str, Any]) -> None:
        safe_attributes = {
            key: value
            for key, value in attributes.items()
            if key not in {"text", "screenshot", "token", "provider_secret"}
        }
        self.events.append({"name": name, "attributes": safe_attributes})


@dataclass
class InMemoryMetricsRecorder:
    counters: dict[str, float] = field(default_factory=dict)
    gauges: dict[str, float] = field(default_factory=dict)
    histograms: dict[str, list[float]] = field(default_factory=dict)

    def increment(self, name: str, value: float = 1, **attributes: Any) -> None:
        key = self._key(name, attributes)
        self.counters[key] = self.counters.get(key, 0) + value

    def gauge(self, name: str, value: float, **attributes: Any) -> None:
        self.gauges[self._key(name, attributes)] = value

    def observe(self, name: str, value: float, **attributes: Any) -> None:
        self.histograms.setdefault(self._key(name, attributes), []).append(value)

    def _key(self, name: str, attributes: dict[str, Any]) -> str:
        if not attributes:
            return name
        labels = ",".join(
            f"{key}={attributes[key]}" for key in sorted(attributes.keys())
        )
        return f"{name}{{{labels}}}"


class SpanTimer:
    def __init__(
        self, recorder: InMemoryTraceRecorder, name: str, **attributes: Any
    ) -> None:
        self._recorder = recorder
        self._name = name
        self._attributes = attributes
        self._start = perf_counter()

    def end(self, **attributes: Any) -> None:
        self._recorder.record(
            self._name,
            {
                **self._attributes,
                **attributes,
                "duration_ms": round((perf_counter() - self._start) * 1000, 3),
            },
        )
