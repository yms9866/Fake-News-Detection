from __future__ import annotations

from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from packages.backend.fnd.adapters.models import modernbert as modernbert_module
from packages.backend.fnd.adapters.models.modernbert import ModernBertStyleModel
from packages.backend.fnd.domain.enums import StyleRiskSignal


class FakeModel:
    def to(self, device: object) -> None:
        self.device = device

    def eval(self) -> None:
        self.evaluated = True


class ModernBertLifecycleTests(unittest.TestCase):
    def test_model_config_label_mapping_is_validated(self) -> None:
        with self.subTest("id2label"):
            mapping = modernbert_module._label_strings_to_signal_map(
                {0: "fake-like", 1: "real-like"}
            )
            self.assertEqual(
                mapping,
                {
                    0: StyleRiskSignal.HIGH,
                    1: StyleRiskSignal.LOW,
                },
            )

        with self.subTest("unrecognized"):
            self.assertIsNone(
                modernbert_module._label_strings_to_signal_map(
                    {0: "LABEL_0", 1: "LABEL_1"}
                )
            )

    def test_training_source_mapping_is_used_as_safe_fallback(self) -> None:
        mapping = modernbert_module.resolve_style_label_mapping(
            model=None,
            model_path=Path("models/modernbert_fake_news_512"),
        )

        self.assertEqual(mapping[0], StyleRiskSignal.HIGH)
        self.assertEqual(mapping[1], StyleRiskSignal.LOW)

    def test_unverified_label_mapping_fails_safely(self) -> None:
        with patch.object(
            modernbert_module,
            "_mapping_from_training_source",
            return_value=None,
        ):
            with self.assertRaisesRegex(RuntimeError, "MODEL_LABEL_MAPPING_UNVERIFIED"):
                modernbert_module.resolve_style_label_mapping(
                    model=None,
                    model_path=Path("missing-model"),
                )

    def test_style_inference_uses_training_cleaning(self) -> None:
        cleaned = modernbert_module._prepare_style_model_input(
            "WASHINGTON (Reuters) - <p>Claim body</p> https://example.com "
            "subscribe now"
        )

        self.assertEqual(cleaned, "Claim body")

    def test_load_once_initializes_model_only_once(self) -> None:
        calls = {"load_model": 0}

        fake_src_model = ModuleType("src.model")

        def fake_load_model(path: Path) -> tuple[FakeModel, object]:
            calls["load_model"] += 1
            return FakeModel(), object()

        fake_src_model.load_model = fake_load_model  # type: ignore[attr-defined]
        fake_torch = SimpleNamespace(
            cuda=SimpleNamespace(is_available=lambda: False),
            device=lambda name: name,
        )

        with patch.dict(
            sys.modules,
            {
                "torch": fake_torch,
                "src.model": fake_src_model,
            },
        ):
            adapter = ModernBertStyleModel(Path("models/modernbert_fake_news_512"))
            with self.assertLogs(
                "packages.backend.fnd.adapters.models.modernbert",
                level="INFO",
            ) as captured:
                adapter._load_once()
                adapter._load_once()

        self.assertTrue(adapter._loaded)
        self.assertEqual(calls["load_model"], 1)
        self.assertEqual(adapter.initialization_count, 1)
        self.assertIn("model_initialization", "\n".join(captured.output))


if __name__ == "__main__":
    unittest.main()
