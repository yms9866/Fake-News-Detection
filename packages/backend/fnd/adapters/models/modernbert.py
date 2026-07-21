"""ModernBERT style-risk model adapter."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from threading import Lock
from time import perf_counter
from typing import Any, cast

from packages.backend.fnd.domain.entities import StyleAnalysis
from packages.backend.fnd.domain.enums import StyleRiskSignal

logger = logging.getLogger(__name__)


def _log_model_timing(event: str, **fields: float | str | int | bool) -> None:
    payload: dict[str, float | str | int | bool] = {"event": event, **fields}
    logger.info(json.dumps(payload, ensure_ascii=True))


class ModernBertStyleModel:
    """Load the local ModernBERT model lazily and reuse it for this process."""

    def __init__(self, model_path: Path) -> None:
        self.model_path = model_path
        self._lock = Lock()
        self._loaded = False
        self._model: Any | None = None
        self._tokenizer: Any | None = None
        self._device: Any | None = None
        self.initialization_count = 0
        self.last_initialization_duration_ms: float | None = None
        self.last_inference_duration_ms: float | None = None

    def _load_once(self) -> None:
        if self._loaded:
            return

        with self._lock:
            if self._loaded:
                return

            start = perf_counter()
            import torch

            from src.model import load_model

            model_obj, tokenizer_obj = load_model(self.model_path)
            model = cast(Any, model_obj)
            tokenizer = cast(Any, tokenizer_obj)
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model.to(device)
            model.eval()

            self._model = model
            self._tokenizer = tokenizer
            self._device = device
            self._loaded = True
            self.initialization_count += 1
            self.last_initialization_duration_ms = (perf_counter() - start) * 1000
            _log_model_timing(
                "model_initialization",
                model_path=str(self.model_path),
                duration_ms=round(self.last_initialization_duration_ms, 3),
                initialization_count=self.initialization_count,
            )

    def analyze(self, text: str, max_length: int) -> StyleAnalysis:
        self._load_once()

        import torch
        import torch.nn.functional as functional

        if self._model is None or self._tokenizer is None or self._device is None:
            raise RuntimeError("ModernBERT model did not initialize correctly.")

        inference_start = perf_counter()
        try:
            inputs = self._tokenizer(
                text,
                truncation=True,
                padding="max_length",
                max_length=max_length,
                return_tensors="pt",
            ).to(self._device)

            with torch.no_grad():
                outputs = self._model(**inputs)
                probabilities = functional.softmax(outputs.logits, dim=-1).squeeze(0)

            label = int(torch.argmax(probabilities).item())
            confidence = float(probabilities[label].item())
        finally:
            self.last_inference_duration_ms = (perf_counter() - inference_start) * 1000
            _log_model_timing(
                "style_inference",
                duration_ms=round(self.last_inference_duration_ms, 3),
                model_loaded=self._loaded,
            )

        signal = StyleRiskSignal.LOW if label == 1 else StyleRiskSignal.HIGH
        return StyleAnalysis.from_prediction(
            signal=signal,
            confidence=confidence,
            text=text,
            model_name="ModernBERT",
            model_version=str(self.model_path),
            max_length=max_length,
            inference_duration_ms=self.last_inference_duration_ms,
        )
