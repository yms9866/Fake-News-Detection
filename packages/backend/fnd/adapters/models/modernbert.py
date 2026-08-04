"""ModernBERT style-risk model adapter."""

from __future__ import annotations

import json
import logging
from pathlib import Path
import re
from threading import Lock
from time import perf_counter
from typing import Any, cast

from packages.backend.fnd.domain.entities import StyleAnalysis
from packages.backend.fnd.domain.enums import StyleRiskSignal
from src.text_cleaning import clean_news_text

logger = logging.getLogger(__name__)

STYLE_LABEL_MAP_ERROR = "MODEL_LABEL_MAPPING_UNVERIFIED"
TRAINING_LABEL_MAP = {
    0: StyleRiskSignal.HIGH,
    1: StyleRiskSignal.LOW,
}


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
        self._label_signal_map: dict[int, StyleRiskSignal] | None = None
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
            label_signal_map = resolve_style_label_mapping(
                model=model,
                model_path=self.model_path,
            )
            device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            model.to(device)
            model.eval()

            self._model = model
            self._tokenizer = tokenizer
            self._device = device
            self._label_signal_map = label_signal_map
            self._loaded = True
            self.initialization_count += 1
            self.last_initialization_duration_ms = (perf_counter() - start) * 1000
            _log_model_timing(
                "model_initialization",
                model_path=str(self.model_path),
                duration_ms=round(self.last_initialization_duration_ms, 3),
                initialization_count=self.initialization_count,
                label_map=_label_map_for_log(label_signal_map),
            )

    def label_map(self) -> dict[int, str]:
        if self._label_signal_map is None:
            self._label_signal_map = resolve_style_label_mapping(
                model=self._model,
                model_path=self.model_path,
            )
        return {
            label_id: signal.value
            for label_id, signal in sorted(self._label_signal_map.items())
        }

    def analyze(self, text: str, max_length: int) -> StyleAnalysis:
        self._load_once()

        import torch
        import torch.nn.functional as functional

        if self._model is None or self._tokenizer is None or self._device is None:
            raise RuntimeError("ModernBERT model did not initialize correctly.")

        inference_start = perf_counter()
        try:
            model_input_text = _prepare_style_model_input(text)
            inputs = self._tokenizer(
                model_input_text,
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
            signal = self._signal_for_label(label)
        finally:
            self.last_inference_duration_ms = (perf_counter() - inference_start) * 1000
            _log_model_timing(
                "style_inference",
                duration_ms=round(self.last_inference_duration_ms, 3),
                model_loaded=self._loaded,
                label_id=label if "label" in locals() else -1,
                token_count=_token_count(inputs if "inputs" in locals() else None),
                truncated=_was_truncated(
                    inputs if "inputs" in locals() else None,
                    max_length,
                ),
                cleaned_for_inference="model_input_text" in locals()
                and model_input_text != text,
            )

        return StyleAnalysis.from_prediction(
            signal=signal,
            confidence=confidence,
            text=text,
            model_name="ModernBERT",
            model_version=str(self.model_path),
            max_length=max_length,
            inference_duration_ms=self.last_inference_duration_ms,
        )

    def _signal_for_label(self, label: int) -> StyleRiskSignal:
        if self._label_signal_map is None:
            raise RuntimeError(STYLE_LABEL_MAP_ERROR)
        try:
            return self._label_signal_map[label]
        except KeyError as exc:
            raise RuntimeError(
                f"{STYLE_LABEL_MAP_ERROR}: predicted label {label} is not mapped"
            ) from exc


def resolve_style_label_mapping(
    *,
    model: Any | None,
    model_path: Path,
) -> dict[int, StyleRiskSignal]:
    from_model = _mapping_from_model_config(model)
    if from_model:
        return from_model

    from_file = _mapping_from_config_file(model_path)
    if from_file:
        return from_file

    from_training = _mapping_from_training_source()
    if from_training:
        return from_training

    raise RuntimeError(
        f"{STYLE_LABEL_MAP_ERROR}: expected fake/suspicious label 0 and "
        "real/credible label 1 from model config or training source."
    )


def _mapping_from_model_config(model: Any | None) -> dict[int, StyleRiskSignal] | None:
    if model is None:
        return None
    config = getattr(model, "config", None)
    return _mapping_from_config_object(config)


def _mapping_from_config_file(model_path: Path) -> dict[int, StyleRiskSignal] | None:
    config_path = model_path / "config.json"
    if not config_path.is_file():
        return None
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return _mapping_from_config_object(payload)


def _mapping_from_config_object(config: Any) -> dict[int, StyleRiskSignal] | None:
    if config is None:
        return None
    id2label = _config_value(config, "id2label")
    label2id = _config_value(config, "label2id")
    candidates: dict[int, str] = {}

    if isinstance(id2label, dict):
        for key, value in id2label.items():
            try:
                candidates[int(key)] = str(value)
            except (TypeError, ValueError):
                return None

    if isinstance(label2id, dict):
        for raw_label, raw_id in label2id.items():
            try:
                label_id = int(raw_id)
            except (TypeError, ValueError):
                return None
            candidates.setdefault(label_id, str(raw_label))

    return _label_strings_to_signal_map(candidates)


def _config_value(config: Any, key: str) -> Any:
    if isinstance(config, dict):
        return config.get(key)
    return getattr(config, key, None)


def _label_strings_to_signal_map(
    labels: dict[int, str],
) -> dict[int, StyleRiskSignal] | None:
    if not labels:
        return None

    resolved: dict[int, StyleRiskSignal] = {}
    for label_id, label in labels.items():
        normalized = label.lower().replace("-", "_").replace(" ", "_")
        if any(token in normalized for token in ("fake", "suspicious", "misleading")):
            resolved[label_id] = StyleRiskSignal.HIGH
        elif any(token in normalized for token in ("real", "credible", "legitimate")):
            resolved[label_id] = StyleRiskSignal.LOW

    if set(resolved.values()) >= {StyleRiskSignal.HIGH, StyleRiskSignal.LOW}:
        return resolved
    return None


def _mapping_from_training_source() -> dict[int, StyleRiskSignal] | None:
    source = Path(__file__).resolve().parents[5] / "src" / "data_loader.py"
    try:
        text = source.read_text(encoding="utf-8")
    except OSError:
        return None

    fake_match = re.search(r"^\s*FAKE_LABEL\s*=\s*(\d+)\s*$", text, re.MULTILINE)
    real_match = re.search(r"^\s*REAL_LABEL\s*=\s*(\d+)\s*$", text, re.MULTILINE)
    if not fake_match or not real_match:
        return None

    fake_label = int(fake_match.group(1))
    real_label = int(real_match.group(1))
    if fake_label == real_label:
        return None

    return {
        fake_label: StyleRiskSignal.HIGH,
        real_label: StyleRiskSignal.LOW,
    }


def _label_map_for_log(mapping: dict[int, StyleRiskSignal]) -> str:
    return ",".join(
        f"{label_id}:{signal.value}" for label_id, signal in sorted(mapping.items())
    )


def _prepare_style_model_input(text: str) -> str:
    cleaned = clean_news_text(text)
    return cleaned if cleaned else str(text or "").strip()


def _token_count(inputs: Any | None) -> int:
    attention_mask = _input_field(inputs, "attention_mask")
    if attention_mask is not None:
        try:
            return int(attention_mask.sum().item())
        except Exception:
            pass
    input_ids = _input_field(inputs, "input_ids")
    if input_ids is None:
        return 0
    try:
        return int(input_ids.ne(0).sum().item())
    except Exception:
        try:
            return int(len(input_ids[0]))
        except Exception:
            return 0


def _was_truncated(inputs: Any | None, max_length: int) -> bool:
    input_ids = _input_field(inputs, "input_ids")
    if input_ids is None:
        return False
    try:
        return int(input_ids.shape[-1]) >= max_length
    except Exception:
        try:
            return len(input_ids[0]) >= max_length
        except Exception:
            return False


def _input_field(inputs: Any | None, key: str) -> Any | None:
    if inputs is None:
        return None
    if isinstance(inputs, dict):
        return inputs.get(key)
    return getattr(inputs, key, None)
