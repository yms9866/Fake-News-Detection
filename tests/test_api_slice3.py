from __future__ import annotations

from pathlib import Path
import sys
import tempfile
from typing import Any, Callable, cast
import types
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from apps.api.app.factory import create_app
from apps.api.app.state import ApiContainer, InMemoryAnalysisRepository, ModelRegistry
from packages.backend.fnd.adapters.jobs.in_memory import (
    InMemoryIdempotencyRepository,
    InMemoryJobEventRepository,
    InMemoryJobRepository,
)
from packages.backend.fnd.adapters.jobs.in_process_queue import SynchronousJobQueue
from packages.backend.fnd.adapters.media.artifacts import TemporaryLocalArtifactStore
from packages.backend.fnd.adapters.media.preprocessors import (
    FfmpegMediaAdapter,
    WhisperTranscriptionProvider,
)
from packages.backend.fnd.application.services.media_jobs import (
    MediaAnalysisJobService,
    MediaAnalysisSubmissionService,
)
from packages.backend.fnd.application.services.media_text import deduplicate_segments
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import (
    AnalysisResult,
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
from packages.backend.fnd.domain.errors import FndError, JobStateError
from packages.backend.fnd.domain.media import (
    AnalysisJob,
    ExtractionMetadata,
    MediaAnalysisJobCommand,
    MediaMetadata,
    StoredArtifact,
)

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
)
WAV_BYTES = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 64
MP4_BYTES = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 64


class FakeStyleModel:
    _loaded = False


class FakeEvidenceProvider:
    api_key = None


class FakeSearchProvider:
    pass


class CapturingWorkflow:
    def __init__(self) -> None:
        self.style_model = FakeStyleModel()
        self.evidence_provider = FakeEvidenceProvider()
        self.search_provider = FakeSearchProvider()
        self.document_calls: list[ExtractedDocument] = []

    def analyze_document(
        self,
        *,
        document: ExtractedDocument,
        deep_check: bool = False,
        max_length: int | None = None,
        max_search_results: int | None = None,
    ) -> AnalysisResult:
        self.document_calls.append(document)
        return AnalysisResult(
            document=document,
            style=StyleAnalysis.from_prediction(
                signal=StyleRiskSignal.LOW,
                confidence=0.76,
                text=document.text,
                model_name="fake-media-model",
                max_length=max_length,
            ),
            evidence=None,
            search_context=None,
            final=VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason="Deterministic fake media workflow decision.",
            ),
        )

    def analyze(self, command: object) -> AnalysisResult:
        raise AssertionError("Media tests should call analyze_document")


class FakeMediaProbe:
    def __init__(self, *, duration_seconds: float = 10.0) -> None:
        self.duration_seconds = duration_seconds
        self.calls: list[StoredArtifact] = []

    def capabilities(self) -> dict[str, object]:
        return {
            "ffmpeg": {"available": True, "path": "fake-ffmpeg"},
            "ffprobe": {"available": True, "path": "fake-ffprobe"},
            "ocr": {"available": True, "provider": "fake-ocr"},
            "transcription": {
                "available": True,
                "provider": "fake-whisper",
                "loaded": False,
            },
        }

    def probe(self, artifact: StoredArtifact) -> MediaMetadata:
        self.calls.append(artifact)
        details: dict[str, object] = {}
        if artifact.media_type == MediaType.IMAGE:
            details = {"width": 2, "height": 2, "format": "PNG"}
        elif artifact.media_type == MediaType.AUDIO:
            details = {"duration_seconds": self.duration_seconds}
        elif artifact.media_type == MediaType.VIDEO:
            details = {
                "duration_seconds": self.duration_seconds,
                "width": 1920,
                "height": 1080,
                "frame_rate": 30.0,
            }
        return MediaMetadata(
            media_type=artifact.media_type,
            mime_type=artifact.mime_type,
            size_bytes=artifact.size_bytes,
            sha256=artifact.sha256,
            details=details,
        )


class FakeMediaPreprocessor:
    def __init__(
        self,
        *,
        text: str = "Extracted media claim text with enough words for workflow.",
        fail: Exception | None = None,
    ) -> None:
        self.text = text
        self.fail = fail
        self.calls: list[tuple[StoredArtifact, MediaMetadata]] = []

    def capabilities(self) -> dict[str, object]:
        return {
            "ocr": {"available": True, "provider": "fake-ocr"},
            "transcription": {
                "available": True,
                "provider": "fake-whisper",
                "loaded": False,
            },
            "media_worker": {"available": True, "concurrency": 1},
        }

    def extract(
        self,
        artifact: StoredArtifact,
        metadata: MediaMetadata,
        cancellation: object,
    ) -> tuple[ExtractedDocument, ExtractionMetadata]:
        self.calls.append((artifact, metadata))
        cancellation.throw_if_cancelled()  # type: ignore[attr-defined]
        if self.fail is not None:
            raise self.fail
        warnings = () if self.text else ("No readable text was extracted.",)
        extraction = ExtractionMetadata(
            media_type=artifact.media_type,
            warnings=warnings,
            channels={
                "transcript": {
                    "segments": [{"start": 0.0, "end": 1.0, "text": self.text}]
                },
                "frame_ocr": {
                    "sampled_frame_count": 3,
                    "ocr_frame_count": 1,
                },
            },
            timings_ms={"extracting": 1.0},
        )
        return (
            ExtractedDocument(
                input_type=InputType.FILE,
                text=self.text,
                source=str(artifact.path),
                metadata={"unsafe_source_for_test": str(artifact.path)},
            ),
            extraction,
        )


class RecordingJobQueue:
    def __init__(self, handler: Callable[[MediaAnalysisJobCommand], None]) -> None:
        self.handler = handler
        self.enqueued: list[MediaAnalysisJobCommand] = []
        self.started = False

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        self.started = False

    def enqueue(self, command: MediaAnalysisJobCommand) -> None:
        self.enqueued.append(command)


class ApiSlice3Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def make_settings(
        self,
        *,
        max_image_size_mb: int = 10,
        max_audio_size_mb: int = 10,
        max_video_size_mb: int = 10,
        max_audio_duration_seconds: int = 120,
        max_video_duration_seconds: int = 120,
    ) -> Settings:
        model_path = self.root / "model"
        model_path.mkdir(exist_ok=True)
        return Settings(
            environment="test",
            project_root=self.root,
            modernbert_model_path=model_path,
            gemini_model="gemini-test",
            gemini_api_key=None,
            max_search_results=3,
            max_length=512,
            high_style_risk_threshold=0.80,
            enable_external_ai=True,
            max_url_bytes=100_000,
            request_timeout_seconds=1.0,
            media_upload_directory=self.root / "uploads",
            media_temp_directory=self.root / "work",
            max_image_size_mb=max_image_size_mb,
            max_audio_size_mb=max_audio_size_mb,
            max_video_size_mb=max_video_size_mb,
            max_audio_duration_seconds=max_audio_duration_seconds,
            max_video_duration_seconds=max_video_duration_seconds,
            media_worker_concurrency=1,
        )

    def make_app(
        self,
        *,
        queue_mode: str = "recording",
        probe: FakeMediaProbe | None = None,
        preprocessor: FakeMediaPreprocessor | None = None,
        settings: Settings | None = None,
    ) -> tuple[
        TestClient,
        ApiContainer,
        CapturingWorkflow,
        RecordingJobQueue | SynchronousJobQueue,
    ]:
        settings = settings or self.make_settings()
        workflow = CapturingWorkflow()
        analyses = InMemoryAnalysisRepository()
        jobs = InMemoryJobRepository()
        events = InMemoryJobEventRepository()
        idempotency = InMemoryIdempotencyRepository()
        artifacts = TemporaryLocalArtifactStore(settings.media_upload_directory)
        probe = probe or FakeMediaProbe()
        preprocessor = preprocessor or FakeMediaPreprocessor()
        job_service = MediaAnalysisJobService(
            settings=settings,
            workflow=cast(Any, workflow),
            artifacts=artifacts,
            jobs=jobs,
            events=events,
            analyses=analyses,
            media_preprocessor=cast(Any, preprocessor),
        )
        queue: RecordingJobQueue | SynchronousJobQueue
        if queue_mode == "sync":
            queue = SynchronousJobQueue(job_service.execute)
        else:
            queue = RecordingJobQueue(job_service.execute)
        submission = MediaAnalysisSubmissionService(
            settings=settings,
            artifacts=artifacts,
            jobs=jobs,
            events=events,
            idempotency=idempotency,
            analyses=analyses,
            queue=cast(Any, queue),
            media_probe=cast(Any, probe),
        )
        container = ApiContainer(
            settings=settings,
            workflow=cast(Any, workflow),
            analyses=analyses,
            model_registry=ModelRegistry(
                model_path=settings.modernbert_model_path,
                max_length=settings.max_length,
                style_model=workflow.style_model,
            ),
            jobs=jobs,
            job_events=events,
            idempotency=idempotency,
            artifacts=artifacts,
            media_probe=cast(Any, probe),
            media_preprocessor=cast(Any, preprocessor),
            job_service=job_service,
            media_submission_service=submission,
            job_queue=cast(Any, queue),
        )
        app = create_app(
            container=container,
            allowed_origins=["http://127.0.0.1:5173"],
        )
        return TestClient(app), container, workflow, queue

    def post_file(
        self,
        client: TestClient,
        endpoint: str,
        *,
        filename: str,
        content: bytes,
        mime_type: str,
        headers: dict[str, str] | None = None,
    ):
        return client.post(
            endpoint,
            files={"file": (filename, content, mime_type)},
            data={"deep_check": "false", "max_length": "512"},
            headers=headers or {},
        )

    def test_valid_image_upload_returns_202_with_urls(self) -> None:
        client, _, _, _ = self.make_app()

        response = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        )

        self.assertEqual(response.status_code, 202)
        body = response.json()
        self.assertEqual(body["status"], "queued")
        self.assertEqual(body["input_type"], "file")
        self.assertEqual(body["media_type"], "image")
        self.assertIn("/v1/analyses/", body["status_url"])
        self.assertIn("/v1/jobs/", body["job_url"])
        self.assertIn("/events", body["events_url"])

    def test_valid_audio_upload_returns_202(self) -> None:
        client, _, _, _ = self.make_app()

        response = self.post_file(
            client,
            "/v1/analyses/audio",
            filename="claim.wav",
            content=WAV_BYTES,
            mime_type="audio/wav",
        )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["media_type"], "audio")

    def test_valid_video_upload_returns_202(self) -> None:
        client, _, _, _ = self.make_app()

        response = self.post_file(
            client,
            "/v1/analyses/video",
            filename="claim.mp4",
            content=MP4_BYTES,
            mime_type="video/mp4",
        )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.json()["media_type"], "video")

    def test_job_can_be_retrieved_and_unknown_job_is_stable(self) -> None:
        client, _, _, _ = self.make_app()
        accepted = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        ).json()

        job_response = client.get(accepted["job_url"])
        missing = client.get("/v1/jobs/not-found")

        self.assertEqual(job_response.status_code, 200)
        self.assertEqual(job_response.json()["job_id"], accepted["job_id"])
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.json()["error_code"], "JOB_NOT_FOUND")

    def test_cancellation_works_for_queued_job_and_terminal_cancel_is_idempotent(
        self,
    ) -> None:
        client, _, _, _ = self.make_app()
        accepted = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        ).json()

        first = client.post(f"/v1/jobs/{accepted['job_id']}/cancel")
        second = client.post(f"/v1/jobs/{accepted['job_id']}/cancel")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["status"], "cancelled")
        self.assertEqual(second.json()["status"], "cancelled")

    def test_progress_events_are_ordered_and_sse_emits_events(self) -> None:
        client, container, _, _ = self.make_app()
        accepted = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        ).json()
        events = container.job_events
        assert events is not None
        events.append(
            job_id=accepted["job_id"],
            status=JobStatus.VALIDATING,
            progress=10,
            message="Validating media",
        )

        stored = events.list_events(accepted["job_id"])
        sse = client.get(accepted["events_url"])

        self.assertEqual([event.sequence for event in stored], [1, 2])
        self.assertIn("event: progress", sse.text)
        self.assertIn('"sequence":1', sse.text)
        self.assertIn('"sequence":2', sse.text)

    def test_unsupported_mime_type_is_rejected(self) -> None:
        client, _, _, _ = self.make_app()

        response = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.gif",
            content=b"GIF89a",
            mime_type="image/gif",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "UNSUPPORTED_MEDIA_TYPE")

    def test_executable_renamed_as_image_is_rejected(self) -> None:
        client, _, _, _ = self.make_app()

        response = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=b"MZ" + b"\x00" * 64,
            mime_type="image/png",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "MEDIA_SIGNATURE_MISMATCH")

    def test_mime_signature_mismatch_is_rejected(self) -> None:
        client, _, _, _ = self.make_app()

        response = self.post_file(
            client,
            "/v1/analyses/audio",
            filename="claim.mp3",
            content=PNG_BYTES,
            mime_type="audio/mpeg",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "MEDIA_SIGNATURE_MISMATCH")

    def test_oversized_image_audio_and_video_are_rejected(self) -> None:
        settings = self.make_settings(
            max_image_size_mb=0,
            max_audio_size_mb=0,
            max_video_size_mb=0,
        )
        client, _, _, _ = self.make_app(settings=settings)

        image = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        )
        audio = self.post_file(
            client,
            "/v1/analyses/audio",
            filename="claim.wav",
            content=WAV_BYTES,
            mime_type="audio/wav",
        )
        video = self.post_file(
            client,
            "/v1/analyses/video",
            filename="claim.mp4",
            content=MP4_BYTES,
            mime_type="video/mp4",
        )

        self.assertEqual(image.json()["error_code"], "MEDIA_TOO_LARGE")
        self.assertEqual(audio.json()["error_code"], "MEDIA_TOO_LARGE")
        self.assertEqual(video.json()["error_code"], "MEDIA_TOO_LARGE")

    def test_excessive_audio_and_video_duration_are_rejected(self) -> None:
        settings = self.make_settings(
            max_audio_duration_seconds=1,
            max_video_duration_seconds=1,
        )
        client, _, _, _ = self.make_app(
            settings=settings,
            probe=FakeMediaProbe(duration_seconds=5),
        )

        audio = self.post_file(
            client,
            "/v1/analyses/audio",
            filename="claim.wav",
            content=WAV_BYTES,
            mime_type="audio/wav",
        )
        video = self.post_file(
            client,
            "/v1/analyses/video",
            filename="claim.mp4",
            content=MP4_BYTES,
            mime_type="video/mp4",
        )

        self.assertEqual(audio.json()["error_code"], "MEDIA_TOO_LONG")
        self.assertEqual(video.json()["error_code"], "MEDIA_TOO_LONG")

    def test_filename_path_traversal_is_sanitized_and_paths_are_not_exposed(
        self,
    ) -> None:
        client, container, _, _ = self.make_app()

        response = self.post_file(
            client,
            "/v1/analyses/image",
            filename="../../secret.png",
            content=PNG_BYTES,
            mime_type="image/png",
        )

        self.assertEqual(response.status_code, 202)
        self.assertNotIn(str(self.root), response.text)
        artifacts = container.artifacts
        assert artifacts is not None
        accepted = response.json()
        job = container.jobs.get(accepted["job_id"]) if container.jobs else None
        assert job is not None
        artifact = artifacts.get(job.artifact_id)
        assert artifact is not None
        self.assertEqual(artifact.sanitized_filename, "secret.png")

    def test_valid_image_reaches_preprocessor_and_shared_workflow(self) -> None:
        preprocessor = FakeMediaPreprocessor()
        client, _, workflow, _ = self.make_app(
            queue_mode="sync",
            preprocessor=preprocessor,
        )

        response = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        )

        self.assertEqual(response.status_code, 202)
        self.assertEqual(len(preprocessor.calls), 1)
        self.assertEqual(len(workflow.document_calls), 1)
        self.assertIsNone(workflow.document_calls[0].source)

    def test_deterministic_api_smoke_upload_completes_and_cleans_artifact(
        self,
    ) -> None:
        client, container, _, _ = self.make_app(queue_mode="sync")

        accepted = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        )
        job = client.get(accepted.json()["job_url"])
        analysis = client.get(accepted.json()["status_url"])

        self.assertEqual(accepted.status_code, 202)
        self.assertEqual(job.json()["status"], "completed")
        self.assertEqual(analysis.json()["status"], "completed")
        assert container.artifacts is not None
        self.assertEqual(container.artifacts._items, {})

    def test_empty_ocr_returns_stable_completed_unverified_result(self) -> None:
        client, _, _, _ = self.make_app(
            queue_mode="sync",
            preprocessor=FakeMediaPreprocessor(text=""),
        )

        accepted = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        ).json()
        result = client.get(accepted["status_url"])

        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["status"], "completed")
        self.assertEqual(result.json()["final_verdict"], "UNVERIFIED")
        self.assertIn("extraction_metadata", result.json())

    def test_ocr_failure_does_not_expose_stack_trace(self) -> None:
        client, _, _, _ = self.make_app(
            queue_mode="sync",
            preprocessor=FakeMediaPreprocessor(
                fail=FndError("OCR failed.", code="OCR_FAILED")
            ),
        )

        accepted = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        ).json()
        job = client.get(accepted["job_url"])

        self.assertEqual(job.json()["status"], "failed")
        self.assertEqual(job.json()["error"]["code"], "OCR_FAILED")
        self.assertNotIn("traceback", job.text.lower())

    def test_audio_metadata_and_segments_are_preserved(self) -> None:
        client, _, _, _ = self.make_app(queue_mode="sync")

        accepted = self.post_file(
            client,
            "/v1/analyses/audio",
            filename="claim.wav",
            content=WAV_BYTES,
            mime_type="audio/wav",
        ).json()
        result = client.get(accepted["status_url"]).json()

        self.assertEqual(result["media_metadata"]["duration_seconds"], 10.0)
        self.assertIn("transcript", result["extraction_metadata"]["channels"])

    def test_missing_ffmpeg_returns_stable_error(self) -> None:
        settings = self.make_settings()
        adapter = FfmpegMediaAdapter(
            Settings(
                **{
                    **settings.__dict__,
                    "ffmpeg_executable": "definitely-not-installed-ffmpeg",
                }
            )
        )

        with self.assertRaises(FndError) as captured:
            adapter.normalize_audio(
                self.root / "missing.wav",
                self.root / "target.wav",
                cast(Any, types.SimpleNamespace(throw_if_cancelled=lambda: None)),
            )

        self.assertEqual(captured.exception.code, "FFMPEG_UNAVAILABLE")

    def test_transcription_provider_initializes_once(self) -> None:
        load_count = 0

        class FakeWhisperModel:
            def transcribe(self, path: str) -> dict[str, object]:
                return {"text": "hello world", "segments": []}

        def load_model(size: str) -> FakeWhisperModel:
            nonlocal load_count
            load_count += 1
            return FakeWhisperModel()

        fake_module = types.SimpleNamespace(load_model=load_model)
        provider = WhisperTranscriptionProvider("tiny")

        with patch.dict(sys.modules, {"whisper": fake_module}):
            provider.transcribe(self.root / "one.wav")
            provider.transcribe(self.root / "two.wav")

        self.assertEqual(load_count, 1)
        self.assertEqual(provider.initialization_count, 1)

    def test_repeated_video_subtitles_are_deduplicated(self) -> None:
        deduped = deduplicate_segments(
            [
                "Breaking news the minister resigned",
                "Breaking news the minister resigned",
                "Breaking news: the minister resigned",
            ]
        )

        self.assertEqual(deduped, ["Breaking news the minister resigned"])

    def test_temporary_files_are_cleaned_after_success_failure_and_cancellation(
        self,
    ) -> None:
        success_client, success_container, _, _ = self.make_app(queue_mode="sync")
        self.post_file(
            success_client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        )
        assert success_container.artifacts is not None
        self.assertEqual(success_container.artifacts._items, {})

        failure_client, failure_container, _, _ = self.make_app(
            queue_mode="sync",
            preprocessor=FakeMediaPreprocessor(
                fail=FndError("OCR failed.", code="OCR_FAILED")
            ),
        )
        failure_client.post(
            "/v1/analyses/image",
            files={"file": ("claim.png", PNG_BYTES, "image/png")},
        )
        assert failure_container.artifacts is not None
        self.assertEqual(failure_container.artifacts._items, {})

        cancel_client, cancel_container, _, _ = self.make_app()
        accepted = self.post_file(
            cancel_client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        ).json()
        cancel_client.post(f"/v1/jobs/{accepted['job_id']}/cancel")
        assert cancel_container.artifacts is not None
        self.assertEqual(cancel_container.artifacts._items, {})

    def test_worker_exception_fails_job_without_crashing_api(self) -> None:
        client, _, _, _ = self.make_app(
            queue_mode="sync",
            preprocessor=FakeMediaPreprocessor(fail=RuntimeError("boom stack")),
        )

        accepted = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
        )
        job = client.get(accepted.json()["job_url"])

        self.assertEqual(accepted.status_code, 202)
        self.assertEqual(job.json()["status"], "failed")
        self.assertEqual(job.json()["error"]["code"], "JOB_EXECUTION_FAILED")
        self.assertNotIn("boom stack", job.text)

    def test_duplicate_idempotency_key_does_not_create_duplicate_work(self) -> None:
        client, _, _, queue = self.make_app()

        first = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
            headers={"Idempotency-Key": "same-key"},
        ).json()
        second = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim-copy.png",
            content=PNG_BYTES,
            mime_type="image/png",
            headers={"Idempotency-Key": "same-key"},
        ).json()

        self.assertEqual(first["analysis_id"], second["analysis_id"])
        self.assertEqual(first["job_id"], second["job_id"])
        self.assertEqual(len(cast(RecordingJobQueue, queue).enqueued), 1)

    def test_idempotency_key_conflict_is_stable(self) -> None:
        client, _, _, _ = self.make_app()
        self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES,
            mime_type="image/png",
            headers={"Idempotency-Key": "same-key"},
        )

        conflict = self.post_file(
            client,
            "/v1/analyses/image",
            filename="claim.png",
            content=PNG_BYTES + b"changed",
            mime_type="image/png",
            headers={"Idempotency-Key": "same-key"},
        )

        self.assertEqual(conflict.status_code, 400)
        self.assertEqual(conflict.json()["error_code"], "IDEMPOTENCY_KEY_CONFLICT")

    def test_job_state_transitions_reject_invalid_terminal_transition(self) -> None:
        job = AnalysisJob(
            job_id="job",
            analysis_id="analysis",
            artifact_id="artifact",
            media_type=MediaType.IMAGE,
        )
        job.transition(JobStatus.VALIDATING)
        job.transition(JobStatus.PREPROCESSING)
        job.transition(JobStatus.EXTRACTING)
        job.transition(JobStatus.CLEANING)
        job.transition(JobStatus.STYLE_ANALYSIS)
        job.transition(JobStatus.DECIDING)
        job.transition(JobStatus.COMPLETED)

        with self.assertRaises(JobStateError):
            job.transition(JobStatus.EXTRACTING)

    def test_readiness_reports_media_capabilities(self) -> None:
        client, _, _, _ = self.make_app()

        response = client.get("/v1/health/ready")
        components = {
            item["name"]: item["status"] for item in response.json()["components"]
        }

        self.assertEqual(components["ffmpeg"], "ready")
        self.assertEqual(components["ffprobe"], "ready")
        self.assertEqual(components["ocr"], "ready")
        self.assertEqual(components["transcription"], "ready")
        self.assertEqual(components["media_worker"], "ready")

    def test_openapi_and_typescript_include_slice3_contracts(self) -> None:
        client, _, _, _ = self.make_app()
        schema = cast(Any, client.app).openapi()
        ts_contract = Path.cwd() / "packages" / "contracts" / "typescript" / "api.ts"
        ts_text = ts_contract.read_text(encoding="utf-8")

        self.assertIn("/v1/analyses/image", schema["paths"])
        self.assertIn("/v1/jobs/{job_id}", schema["paths"])
        self.assertIn("MediaAnalysisAccepted", schema["components"]["schemas"])
        self.assertIn("JobResponse", schema["components"]["schemas"])
        self.assertIn("MediaAnalysisAccepted", ts_text)
        self.assertIn("JobStatusCode", ts_text)

    def test_api_routes_do_not_import_heavy_media_or_model_libraries(self) -> None:
        route_root = Path.cwd() / "apps" / "api" / "app" / "routes"
        forbidden = ["torch", "whisper", "pytesseract", "cv2", "ffmpeg"]
        offenders: list[str] = []
        for path in route_root.glob("*.py"):
            text = path.read_text(encoding="utf-8").lower()
            for token in forbidden:
                if token in text:
                    offenders.append(f"{path.name}:{token}")

        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
