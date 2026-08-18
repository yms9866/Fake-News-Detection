from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from time import perf_counter, sleep
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch

from packages.backend.fnd.adapters.extraction.text import DirectTextExtractor
from packages.backend.fnd.adapters.llm.gemini_grounding import (
    GeminiGroundedSearchEvidenceProvider,
    _TtlLruCache,
)
from packages.backend.fnd.adapters.media.preprocessors import LocalMediaPreprocessor
from packages.backend.fnd.adapters.models.modernbert import ModernBertStyleModel
from packages.backend.fnd.application.services.verdict_policy import VerdictPolicy
from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from apps.api.app.state import ApiContainer, InMemoryAnalysisRepository, ModelRegistry
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import (
    EvidenceAnalysis,
    ExtractedDocument,
    SearchContext,
    StyleAnalysis,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    FinalVerdict,
    InputType,
    MediaType,
    StyleRiskSignal,
)
from packages.backend.fnd.domain.media import MediaMetadata, StoredArtifact
from tests.test_cli_gemini_grounding import _grounded_response
from tests.test_model_lifecycle import FakeModel


class SlowStyleModel:
    def analyze(self, text: str, max_length: int) -> StyleAnalysis:
        sleep(0.2)
        return StyleAnalysis.from_prediction(
            signal=StyleRiskSignal.LOW,
            confidence=0.9,
            text=text,
            model_name="slow-style",
            max_length=max_length,
        )


class SlowSearchProvider:
    def search(self, claim_text: str, max_results: int) -> SearchContext:
        sleep(0.2)
        return SearchContext(query=claim_text, raw_context="slow-search")


class InstantEvidenceProvider:
    def verify(
        self, claim_text: str, search_context: SearchContext
    ) -> EvidenceAnalysis:
        return EvidenceAnalysis(
            provider_name="instant",
            verdict=FinalVerdict.UNVERIFIED,
            evidence_quality=EvidenceQuality.LOW,
            confidence=EvidenceQuality.LOW,
            explanation="stub",
        )


class FakeUrlExtractor:
    def extract(self, url: str) -> ExtractedDocument:
        return ExtractedDocument(input_type=InputType.URL, text="url", source=url)


class FakeFileExtractor:
    def extract(self, path: Path) -> ExtractedDocument:
        return ExtractedDocument(
            input_type=InputType.FILE, text="file", source=str(path)
        )


class NeverCancel:
    def throw_if_cancelled(self) -> None:
        return None


class FakeVideoFfmpeg:
    def extract_video_audio(self, source, target, cancellation) -> None:
        cancellation.throw_if_cancelled()
        Path(target).write_bytes(b"wav")

    def sample_video_frames(
        self,
        source,
        output_directory,
        *,
        max_frames: int,
        cancellation,
    ) -> list[Path]:
        cancellation.throw_if_cancelled()
        output_directory.mkdir(parents=True, exist_ok=True)
        frames: list[Path] = []
        for index in range(min(max_frames, 3)):
            path = output_directory / f"frame_{index}.png"
            path.write_bytes(b"png")
            frames.append(path)
        return frames


class OrderedOcr:
    language = "eng"

    def extract_text(self, path: Path) -> str:
        sleep(0.12)
        labels = {
            "frame_0": "Minister announced the budget today",
            "frame_1": "Flood waters covered the downtown streets",
            "frame_2": "Election results were certified overnight",
        }
        return labels.get(path.stem, path.stem)


class SlowTranscription:
    model_size = "base"

    def transcribe(self, path: Path) -> dict[str, object]:
        sleep(0.2)
        return {
            "text": "spoken claim",
            "language": "en",
            "segments": [{"start": 0, "end": 1, "text": "spoken claim"}],
        }


def _settings(root: Path) -> Settings:
    return Settings(
        environment="test",
        project_root=root,
        modernbert_model_path=root / "model",
        gemini_model="gemini-test",
        gemini_api_key=None,
        max_search_results=3,
        max_length=512,
        high_style_risk_threshold=0.80,
        enable_external_ai=True,
        max_url_bytes=100_000,
        request_timeout_seconds=1.0,
        media_upload_directory=root / "uploads",
        media_temp_directory=root / "work",
        max_sampled_video_frames=3,
    )


class AnalyzeContentParallelTests(unittest.TestCase):
    def test_style_and_deep_check_run_in_parallel(self) -> None:
        workflow = AnalyzeContentWorkflow(
            text_extractor=DirectTextExtractor(),
            url_extractor=FakeUrlExtractor(),
            file_extractor=FakeFileExtractor(),
            style_model=SlowStyleModel(),
            search_provider=SlowSearchProvider(),
            evidence_provider=InstantEvidenceProvider(),
            verdict_policy=VerdictPolicy(),
        )
        document = ExtractedDocument(
            input_type=InputType.DIRECT_TEXT,
            text="A sufficiently long article or factual claim for testing.",
            source="direct-text",
        )

        started = perf_counter()
        result = workflow.analyze_document(
            document=document,
            deep_check=True,
            max_length=512,
        )
        elapsed_ms = (perf_counter() - started) * 1000

        self.assertGreaterEqual(result.timings_ms["style_analysis"], 180)
        self.assertGreaterEqual(result.timings_ms["search_and_source_review"], 180)
        self.assertLess(result.timings_ms["analysis_total"], 350)
        self.assertLess(elapsed_ms, 350)
        self.assertIsNotNone(result.evidence)
        self.assertIsNotNone(result.search_context)

    def test_style_only_path_skips_deep_check_timings(self) -> None:
        workflow = AnalyzeContentWorkflow(
            text_extractor=DirectTextExtractor(),
            url_extractor=FakeUrlExtractor(),
            file_extractor=FakeFileExtractor(),
            style_model=SlowStyleModel(),
            search_provider=SlowSearchProvider(),
            evidence_provider=InstantEvidenceProvider(),
            verdict_policy=VerdictPolicy(),
        )
        document = ExtractedDocument(
            input_type=InputType.DIRECT_TEXT,
            text="A sufficiently long article or factual claim for testing.",
            source="direct-text",
        )
        result = workflow.analyze_document(document=document, deep_check=False)
        self.assertNotIn("search_and_source_review", result.timings_ms)
        self.assertIsNone(result.evidence)


class StyleModelWarmupTests(unittest.TestCase):
    def test_warmup_loads_the_model_once(self) -> None:
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
            {"torch": fake_torch, "src.model": fake_src_model},
        ):
            adapter = ModernBertStyleModel(Path("models/modernbert_fake_news_512"))
            adapter.warmup()
            adapter.warmup()

        self.assertTrue(adapter._loaded)
        self.assertEqual(calls["load_model"], 1)
        self.assertEqual(adapter.initialization_count, 1)

    def test_api_container_start_warms_the_style_model(self) -> None:
        class WarmableStyle:
            def __init__(self) -> None:
                self.warmup_count = 0
                self._loaded = False

            def warmup(self) -> None:
                self.warmup_count += 1
                self._loaded = True

        class MiniWorkflow:
            def __init__(self) -> None:
                self.style_model = WarmableStyle()

        class SilentQueue:
            def start(self) -> None:
                return None

            def stop(self) -> None:
                return None

        with TemporaryDirectory() as raw_root:
            root = Path(raw_root)
            settings = _settings(root)
            workflow = MiniWorkflow()
            container = ApiContainer(
                settings=settings,
                workflow=workflow,  # type: ignore[arg-type]
                analyses=InMemoryAnalysisRepository(),
                model_registry=ModelRegistry(
                    model_path=settings.modernbert_model_path,
                    max_length=settings.max_length,
                    style_model=workflow.style_model,
                ),
                job_queue=SilentQueue(),  # type: ignore[arg-type]
            )
            container.start()
            self.assertEqual(workflow.style_model.warmup_count, 1)

    def test_warmup_failure_does_not_prevent_startup(self) -> None:
        class BoomStyle:
            def warmup(self) -> None:
                raise RuntimeError("missing weights")

        class MiniWorkflow:
            def __init__(self) -> None:
                self.style_model = BoomStyle()

        class SilentQueue:
            def start(self) -> None:
                return None

            def stop(self) -> None:
                return None

        with TemporaryDirectory() as raw_root:
            root = Path(raw_root)
            settings = _settings(root)
            workflow = MiniWorkflow()
            container = ApiContainer(
                settings=settings,
                workflow=workflow,  # type: ignore[arg-type]
                analyses=InMemoryAnalysisRepository(),
                model_registry=ModelRegistry(
                    model_path=settings.modernbert_model_path,
                    max_length=settings.max_length,
                    style_model=workflow.style_model,
                ),
                job_queue=SilentQueue(),  # type: ignore[arg-type]
            )
            container.start()


class VideoParallelExtractionTests(unittest.TestCase):
    def test_video_transcription_overlaps_frame_ocr_and_keeps_order(self) -> None:
        with TemporaryDirectory() as raw_root:
            root = Path(raw_root)
            settings = _settings(root)
            preprocessor = LocalMediaPreprocessor(
                settings=settings,
                ocr_provider=OrderedOcr(),  # type: ignore[arg-type]
                transcription_provider=SlowTranscription(),  # type: ignore[arg-type]
                ffmpeg=FakeVideoFfmpeg(),  # type: ignore[arg-type]
            )
            artifact = StoredArtifact(
                artifact_id="a1",
                media_type=MediaType.VIDEO,
                path=root / "clip.mp4",
                original_filename="clip.mp4",
                sanitized_filename="clip.mp4",
                mime_type="video/mp4",
                size_bytes=12,
                sha256="abc",
            )
            artifact.path.write_bytes(b"mp4")
            metadata = MediaMetadata(
                media_type=MediaType.VIDEO,
                mime_type="video/mp4",
                size_bytes=12,
                sha256="abc",
            )

            started = perf_counter()
            document, extraction = preprocessor.extract(
                artifact, metadata, NeverCancel()
            )
            elapsed_ms = (perf_counter() - started) * 1000

            self.assertIn("spoken claim", document.text)
            self.assertEqual(
                extraction.channels["frame_ocr"]["segments"],
                [
                    "Minister announced the budget today",
                    "Flood waters covered the downtown streets",
                    "Election results were certified overnight",
                ],
            )
            self.assertLess(elapsed_ms, 450)


class GeminiRunCacheTests(unittest.TestCase):
    def test_identical_claims_reuse_the_grounded_run(self) -> None:
        calls: list[str] = []

        def transport(*_args, **_kwargs):
            calls.append("hit")
            return _grounded_response()

        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=transport,
        )
        first = provider.search("Example claim", max_results=6)
        second = provider.search("  Example   claim ", max_results=6)

        self.assertEqual(len(calls), 1)
        self.assertEqual(first.reviewed_sources[0].url, second.reviewed_sources[0].url)

    def test_errors_are_not_cached(self) -> None:
        calls = {"count": 0}

        def failing_transport(*_args, **_kwargs):
            calls["count"] += 1
            raise RuntimeError("quota")

        provider = GeminiGroundedSearchEvidenceProvider(
            api_key="test-key",
            transport=failing_transport,
        )
        first = provider.search("Example claim", max_results=6)
        second = provider.search("Example claim", max_results=6)

        self.assertEqual(calls["count"], 2)
        self.assertEqual(first.error, "GEMINI_GROUNDED_SEARCH_FAILED")
        self.assertEqual(second.error, "GEMINI_GROUNDED_SEARCH_FAILED")

    def test_ttl_cache_evicts_expired_and_lru_entries(self) -> None:
        cache = _TtlLruCache(max_entries=2, ttl_seconds=60)
        cache.set("a", SimpleNamespace(name="a"))  # type: ignore[arg-type]
        cache.set("b", SimpleNamespace(name="b"))  # type: ignore[arg-type]
        cache.get("a")
        cache.set("c", SimpleNamespace(name="c"))  # type: ignore[arg-type]
        self.assertIsNone(cache.get("b"))
        self.assertIsNotNone(cache.get("a"))
        self.assertIsNotNone(cache.get("c"))

        expired = _TtlLruCache(max_entries=2, ttl_seconds=0.01)
        expired.set("a", SimpleNamespace(name="a"))  # type: ignore[arg-type]
        sleep(0.02)
        self.assertIsNone(expired.get("a"))


if __name__ == "__main__":
    unittest.main()
