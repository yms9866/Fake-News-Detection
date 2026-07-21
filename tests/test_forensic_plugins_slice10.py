from __future__ import annotations

from pathlib import Path
import tempfile
import time
from typing import cast
import unittest

from fastapi.testclient import TestClient

from apps.api.app.factory import create_app
from apps.api.app.state import ApiContainer, InMemoryAnalysisRepository, ModelRegistry
from packages.backend.fnd.adapters.forensics.fakes import DeterministicForensicPlugin
from packages.backend.fnd.adapters.jobs.in_memory import (
    InMemoryJobEventRepository,
    InMemoryJobRepository,
)
from packages.backend.fnd.application.services.forensics import ForensicPluginRegistry
from packages.backend.fnd.application.services.media_jobs import MediaAnalysisJobService
from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    AnalyzeContentCommand,
    ExtractedDocument,
    StyleAnalysis,
    VerdictDecision,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    FinalVerdict,
    InputType,
    JobStatus,
    MediaType,
    StyleRiskSignal,
)
from packages.backend.fnd.domain.forensics import (
    ForensicPluginMetadata,
    ForensicPluginReadiness,
    ForensicPluginRequest,
    ForensicPluginResult,
    ForensicSignal,
)
from packages.backend.fnd.domain.media import (
    AnalysisJob,
    ExtractionMetadata,
    MediaAnalysisJobCommand,
    MediaMetadata,
    StoredArtifact,
)
from packages.contracts.python.analysis_contracts import AnalysisResponse


class FailingPlugin:
    def metadata(self) -> ForensicPluginMetadata:
        return ForensicPluginMetadata(
            name="failing",
            version="1.0.0",
            supported_media_types=(MediaType.IMAGE,),
        )

    def readiness(self) -> ForensicPluginReadiness:
        return ForensicPluginReadiness(ready=True, detail="ready")

    def analyze(self, request: ForensicPluginRequest) -> ForensicPluginResult:
        raise RuntimeError("boom")


class SlowPlugin:
    def metadata(self) -> ForensicPluginMetadata:
        return ForensicPluginMetadata(
            name="slow",
            version="1.0.0",
            supported_media_types=(MediaType.IMAGE,),
        )

    def readiness(self) -> ForensicPluginReadiness:
        return ForensicPluginReadiness(ready=True, detail="ready")

    def analyze(self, request: ForensicPluginRequest) -> ForensicPluginResult:
        time.sleep(0.05)
        return ForensicPluginResult(
            plugin_name="slow",
            plugin_version="1.0.0",
            media_type=request.media_type,
            signal=ForensicSignal.NONE,
        )


class FakeStyleModel:
    _loaded = False


class FakeEvidenceProvider:
    api_key = None


class FakeSearchProvider:
    pass


class FakeWorkflow:
    def __init__(self) -> None:
        self.style_model = FakeStyleModel()
        self.evidence_provider = FakeEvidenceProvider()
        self.search_provider = FakeSearchProvider()
        self.documents: list[ExtractedDocument] = []
        self.calls: list[AnalyzeContentCommand] = []

    def analyze(self, command: AnalyzeContentCommand) -> AnalysisResult:
        self.calls.append(command)
        document = ExtractedDocument(
            input_type=InputType.DIRECT_TEXT,
            text=command.text or "text with enough words for local analysis",
        )
        return self._result(document)

    def analyze_document(
        self,
        *,
        document: ExtractedDocument,
        deep_check: bool = False,
        max_length: int | None = None,
        max_search_results: int | None = None,
    ) -> AnalysisResult:
        self.documents.append(document)
        return self._result(document, max_length=max_length)

    def _result(
        self,
        document: ExtractedDocument,
        *,
        max_length: int | None = None,
    ) -> AnalysisResult:
        return AnalysisResult(
            document=document,
            style=StyleAnalysis.from_prediction(
                signal=StyleRiskSignal.LOW,
                confidence=0.9,
                text=document.text,
                model_name="forensic-test-model",
                max_length=max_length,
            ),
            evidence=None,
            search_context=None,
            final=VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason="Forensic plugins are advisory only.",
            ),
        )


class FakeArtifactStore:
    def __init__(self, artifact: StoredArtifact) -> None:
        self.artifact = artifact
        self.deleted: list[str] = []

    def save(
        self,
        *,
        media_type: MediaType,
        content: bytes,
        original_filename: str,
        mime_type: str,
    ) -> StoredArtifact:
        return self.artifact

    def get(self, artifact_id: str) -> StoredArtifact | None:
        return self.artifact if artifact_id == self.artifact.artifact_id else None

    def delete(self, artifact_id: str) -> None:
        self.deleted.append(artifact_id)


class FakePreprocessor:
    def extract(
        self,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        cancellation: object,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]:
        return (
            ExtractedDocument(
                input_type=InputType.FILE,
                text="Extracted image text for advisory plugin analysis.",
            ),
            ExtractionMetadata(media_type=artifact.media_type),
        )

    def capabilities(self) -> dict[str, object]:
        return {"fake_preprocessor": {"available": True}}


def make_settings(root: Path) -> Settings:
    model_path = root / "model"
    model_path.mkdir(exist_ok=True)
    return Settings(
        environment="test",
        project_root=root,
        modernbert_model_path=model_path,
        gemini_model="gemini-test",
        gemini_api_key=None,
        max_search_results=3,
        max_length=512,
        high_style_risk_threshold=0.80,
        enable_external_ai=False,
        max_url_bytes=100_000,
        request_timeout_seconds=1.0,
        media_upload_directory=root / "uploads",
        media_temp_directory=root / "work",
        forensic_plugin_timeout_seconds=0.01,
        forensic_plugin_concurrency=2,
    )


def make_artifact(path: Path) -> StoredArtifact:
    return StoredArtifact(
        artifact_id="artifact-1",
        media_type=MediaType.IMAGE,
        path=path,
        original_filename="image.png",
        sanitized_filename="image.png",
        mime_type="image/png",
        size_bytes=3,
        sha256="abc123",
    )


class ForensicPluginSlice10Tests(unittest.TestCase):
    def test_register_disable_enable_and_readiness(self) -> None:
        registry = ForensicPluginRegistry()
        plugin = DeterministicForensicPlugin(
            name="metadata-forensics",
            signal=ForensicSignal.INCONCLUSIVE,
            media_types=(MediaType.IMAGE, MediaType.VIDEO),
        )

        registry.register(plugin)
        registered = registry.list_plugins()[0]
        self.assertEqual(registered.metadata.name, "metadata-forensics")
        self.assertTrue(registered.enabled)
        self.assertTrue(registered.readiness.ready)

        registry.disable("metadata-forensics")
        self.assertFalse(registry.list_plugins()[0].enabled)
        registry.enable("metadata-forensics")
        self.assertTrue(registry.list_plugins()[0].enabled)
        registry.close()

    def test_duplicate_plugin_registration_is_rejected(self) -> None:
        registry = ForensicPluginRegistry()
        plugin = DeterministicForensicPlugin(name="same")
        registry.register(plugin)

        with self.assertRaises(ValueError):
            registry.register(plugin)

        registry.close()

    def test_timeout_failure_is_isolated(self) -> None:
        registry = ForensicPluginRegistry(
            (SlowPlugin(),), default_timeout_seconds=0.001
        )
        with tempfile.TemporaryDirectory() as temp:
            artifact = make_artifact(Path(temp) / "image.png")
            result = registry.analyze_artifact(
                artifact=artifact,
                metadata=MediaMetadata(
                    media_type=MediaType.IMAGE,
                    mime_type="image/png",
                    size_bytes=3,
                    sha256="abc123",
                ),
            )[0]

        self.assertEqual(result.signal, ForensicSignal.ERROR)
        self.assertEqual(result.failure_class, "timeout")
        self.assertIn("timed out", result.warnings[0])
        registry.close()

    def test_plugin_exception_is_isolated(self) -> None:
        registry = ForensicPluginRegistry((FailingPlugin(),))
        with tempfile.TemporaryDirectory() as temp:
            artifact = make_artifact(Path(temp) / "image.png")
            result = registry.analyze_artifact(
                artifact=artifact,
                metadata=MediaMetadata(
                    media_type=MediaType.IMAGE,
                    mime_type="image/png",
                    size_bytes=3,
                    sha256="abc123",
                ),
            )[0]

        self.assertEqual(result.signal, ForensicSignal.ERROR)
        self.assertEqual(result.failure_class, "RuntimeError")
        self.assertIn("failed", result.warnings[0])
        registry.close()

    def test_not_ready_plugin_returns_advisory_error(self) -> None:
        registry = ForensicPluginRegistry(
            (
                DeterministicForensicPlugin(
                    name="not-ready",
                    ready=False,
                ),
            )
        )
        with tempfile.TemporaryDirectory() as temp:
            artifact = make_artifact(Path(temp) / "image.png")
            result = registry.analyze_artifact(
                artifact=artifact,
                metadata=MediaMetadata(
                    media_type=MediaType.IMAGE,
                    mime_type="image/png",
                    size_bytes=3,
                    sha256="abc123",
                ),
            )[0]

        self.assertEqual(result.signal, ForensicSignal.ERROR)
        self.assertEqual(result.failure_class, "not_ready")
        self.assertFalse(result.scope_reliable)
        registry.close()

    def test_multiple_plugin_aggregation_and_version_reporting(self) -> None:
        registry = ForensicPluginRegistry(
            (
                DeterministicForensicPlugin(
                    name="synthetic-image",
                    version="2.0.0",
                    signal=ForensicSignal.SUSPICIOUS,
                    warning="synthetic pattern detected",
                ),
                DeterministicForensicPlugin(
                    name="metadata-forensics",
                    version="1.1.0",
                    signal=ForensicSignal.NONE,
                ),
            )
        )
        with tempfile.TemporaryDirectory() as temp:
            artifact = make_artifact(Path(temp) / "image.png")
            results = registry.analyze_artifact(
                artifact=artifact,
                metadata=MediaMetadata(
                    media_type=MediaType.IMAGE,
                    mime_type="image/png",
                    size_bytes=3,
                    sha256="abc123",
                ),
            )

        self.assertEqual(
            [result.plugin_name for result in results],
            ["metadata-forensics", "synthetic-image"],
        )
        self.assertEqual(
            [plugin.metadata.version for plugin in registry.list_plugins()],
            ["1.1.0", "2.0.0"],
        )
        registry.close()

    def test_disabled_and_unsupported_plugins_do_not_run(self) -> None:
        registry = ForensicPluginRegistry(
            (
                DeterministicForensicPlugin(name="image-plugin"),
                DeterministicForensicPlugin(
                    name="audio-plugin",
                    media_types=(MediaType.AUDIO,),
                ),
            )
        )
        registry.disable("image-plugin")
        with tempfile.TemporaryDirectory() as temp:
            artifact = make_artifact(Path(temp) / "image.png")
            results = registry.analyze_artifact(
                artifact=artifact,
                metadata=MediaMetadata(
                    media_type=MediaType.IMAGE,
                    mime_type="image/png",
                    size_bytes=3,
                    sha256="abc123",
                ),
            )

        self.assertEqual(results, [])
        registry.close()

    def test_media_job_calls_plugins_without_verdict_bypass(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            artifact_path = root / "image.png"
            artifact_path.write_bytes(b"png")
            artifact = make_artifact(artifact_path)
            artifact_store = FakeArtifactStore(artifact)
            jobs = InMemoryJobRepository()
            events = InMemoryJobEventRepository()
            analyses = InMemoryAnalysisRepository()
            workflow = FakeWorkflow()
            registry = ForensicPluginRegistry(
                (
                    DeterministicForensicPlugin(
                        name="synthetic-image",
                        signal=ForensicSignal.SUSPICIOUS,
                        confidence=0.88,
                        warning="Possible generated-image artifact.",
                    ),
                )
            )
            service = MediaAnalysisJobService(
                settings=make_settings(root),
                workflow=cast(AnalyzeContentWorkflow, workflow),
                artifacts=artifact_store,
                jobs=jobs,
                events=events,
                analyses=analyses,
                media_preprocessor=FakePreprocessor(),
                forensic_plugins=registry,
            )
            job = AnalysisJob(
                job_id="job-1",
                analysis_id="analysis-1",
                artifact_id=artifact.artifact_id,
                media_type=MediaType.IMAGE,
                media_metadata=MediaMetadata(
                    media_type=MediaType.IMAGE,
                    mime_type="image/png",
                    size_bytes=3,
                    sha256="abc123",
                ),
                request_id="req-1",
                trace_id="trace-1",
            )
            jobs.create(job)

            service.execute(
                MediaAnalysisJobCommand(
                    job_id=job.job_id,
                    analysis_id=job.analysis_id,
                    artifact_id=artifact.artifact_id,
                    deep_check=False,
                    max_length=512,
                    request_id="req-1",
                    trace_id="trace-1",
                )
            )

            response = analyses.get("analysis-1")
            completed_job = jobs.get("job-1")

        self.assertIsNotNone(response)
        assert response is not None
        self.assertIsInstance(response, AnalysisResponse)
        assert isinstance(response, AnalysisResponse)
        self.assertEqual(response.final_verdict, "UNVERIFIED")
        self.assertEqual(response.forensic_results[0].signal, "SUSPICIOUS")
        self.assertIn("Forensic advisory", " ".join(response.warnings))
        self.assertIsNotNone(completed_job)
        assert completed_job is not None
        self.assertEqual(completed_job.status, JobStatus.COMPLETED)

    def test_api_lists_plugins_and_readiness_reports_registry(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            settings = make_settings(root)
            workflow = FakeWorkflow()
            registry = ForensicPluginRegistry(
                (
                    DeterministicForensicPlugin(
                        name="deepfake-video",
                        media_types=(MediaType.VIDEO,),
                        version="0.1.0",
                    ),
                )
            )
            container = ApiContainer(
                settings=settings,
                workflow=cast(AnalyzeContentWorkflow, workflow),
                analyses=InMemoryAnalysisRepository(),
                model_registry=ModelRegistry(
                    model_path=settings.modernbert_model_path,
                    max_length=settings.max_length,
                    style_model=workflow.style_model,
                ),
                forensic_plugins=registry,
            )
            client = TestClient(
                create_app(
                    container=container,
                    allowed_origins=["http://127.0.0.1:5173"],
                )
            )

            plugins = client.get("/v1/forensic-plugins")
            ready = client.get("/v1/health/ready")

        self.assertEqual(plugins.status_code, 200)
        body = plugins.json()
        self.assertEqual(body["plugins"][0]["name"], "deepfake-video")
        self.assertEqual(body["plugins"][0]["version"], "0.1.0")
        self.assertEqual(body["plugins"][0]["supported_media_types"], ["video"])
        statuses = {item["name"]: item["status"] for item in ready.json()["components"]}
        self.assertEqual(statuses["forensic_plugin_registry"], "configured")

    def test_openapi_and_typescript_include_forensic_contracts(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            settings = make_settings(root)
            workflow = FakeWorkflow()
            container = ApiContainer(
                settings=settings,
                workflow=cast(AnalyzeContentWorkflow, workflow),
                analyses=InMemoryAnalysisRepository(),
                model_registry=ModelRegistry(
                    model_path=settings.modernbert_model_path,
                    max_length=settings.max_length,
                    style_model=workflow.style_model,
                ),
            )
            schema = create_app(
                container=container,
                allowed_origins=["http://127.0.0.1:5173"],
            ).openapi()

        schemas = schema["components"]["schemas"]
        self.assertIn("ForensicPluginResultResponse", schemas)
        self.assertIn("ForensicPluginsResponse", schemas)
        self.assertIn(
            "forensic_results",
            schemas["AnalysisResponse"]["properties"],
        )
        self.assertIn("/v1/forensic-plugins", schema["paths"])

        ts_contract = (
            Path.cwd() / "packages" / "contracts" / "typescript" / "api.ts"
        ).read_text(encoding="utf-8")
        self.assertIn("ForensicPluginResultResponse", ts_contract)
        self.assertIn("ForensicSignalCode", ts_contract)
        self.assertIn("ForensicPluginsResponse", ts_contract)


if __name__ == "__main__":
    unittest.main()
