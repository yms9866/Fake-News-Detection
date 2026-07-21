"""ModernBERT style-risk model adapter."""

from __future__ import annotations

from pathlib import Path
from threading import Lock

from packages.backend.fnd.domain.entities import StyleAnalysis
from packages.backend.fnd.domain.enums import StyleRiskSignal


class ModernBertStyleModel:
    """Load the local ModernBERT model lazily and reuse it for this process."""

    def __init__(self, model_path: Path) -> None:
        self.model_path = model_path
        self._lock = Lock()
        self._loaded = False
        self._model = None
        self._tokenizer = None
        self._device = None

    def _load_once(self) -> None:
        if self._loaded:
            return

        with self._lock:
            if self._loaded:
                return

            import torch

            from src.model import load_model

            model, tokenizer = load_model(self.model_path)
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model.to(device)
            model.eval()

            self._model = model
            self._tokenizer = tokenizer
            self._device = device
            self._loaded = True

    def analyze(self, text: str, max_length: int) -> StyleAnalysis:
        self._load_once()

        import torch
        import torch.nn.functional as functional

        if self._model is None or self._tokenizer is None or self._device is None:
            raise RuntimeError("ModernBERT model did not initialize correctly.")

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

        signal = StyleRiskSignal.LOW if label == 1 else StyleRiskSignal.HIGH
        return StyleAnalysis(
            signal=signal,
            confidence=confidence,
            model_name="ModernBERT",
            model_version=str(self.model_path),
            max_length=max_length,
        )
