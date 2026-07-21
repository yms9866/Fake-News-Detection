from __future__ import annotations

from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from packages.backend.fnd.adapters.models.modernbert import ModernBertStyleModel


class FakeModel:
    def to(self, device: object) -> None:
        self.device = device

    def eval(self) -> None:
        self.evaluated = True


class ModernBertLifecycleTests(unittest.TestCase):
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
