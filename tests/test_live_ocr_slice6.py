from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
from typing import Any, cast
import unittest

from fastapi.testclient import TestClient

from apps.api.app.factory import create_app
from apps.api.app.state import ApiContainer, InMemoryAnalysisRepository, ModelRegistry
from packages.backend.fnd.adapters.live.in_memory import (
    InMemoryLiveSessionEventRepository,
    InMemoryLiveSessionRepository,
)
from packages.backend.fnd.application.services.live_ocr import (
    CreateLiveSessionCommand,
    LiveOcrSessionService,
    SubmitLiveFrameCommand,
    merge_scroll_text,
    rule_clean_live_text,
)
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
    StyleRiskSignal,
)
from packages.backend.fnd.domain.live import (
    LiveSessionConfig,
    LiveSourceType,
)


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
                confidence=0.77,
                text=document.text,
                model_name="fake-live-model",
                max_length=max_length,
            ),
            evidence=None,
            search_context=None,
            final=VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason="Deterministic fake live workflow decision.",
            ),
        )

    def analyze(self, command: object) -> AnalysisResult:
        raise AssertionError("Live OCR tests should call analyze_document")


class CountingCleaner:
    def __init__(self) -> None:
        self.calls = 0

    def clean(self, text: str) -> str:
        self.calls += 1
        return text


class LiveOcrSlice6Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def make_settings(self) -> Settings:
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
            media_worker_concurrency=1,
        )

    def make_app(self) -> tuple[TestClient, ApiContainer, CapturingWorkflow]:
        settings = self.make_settings()
        workflow = CapturingWorkflow()
        container = ApiContainer(
            settings=settings,
            workflow=cast(Any, workflow),
            analyses=InMemoryAnalysisRepository(),
            model_registry=ModelRegistry(
                model_path=settings.modernbert_model_path,
                max_length=settings.max_length,
                style_model=workflow.style_model,
            ),
        )
        app = create_app(
            container=container,
            allowed_origins=["http://127.0.0.1:5173"],
        )
        return TestClient(app), container, workflow

    def create_session(
        self,
        client: TestClient,
        *,
        source_type: str = "screen",
        source_url: str | None = None,
        settings: dict[str, object] | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, object] = {
            "source_type": source_type,
            "source_id": "source-1",
            "permission_granted": True,
            "settings": settings or {"perceptual_change_threshold": 0},
        }
        if source_url is not None:
            payload["source_url"] = source_url
        response = client.post("/v1/live-sessions", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return cast(dict[str, Any], response.json())

    def submit_frame(
        self,
        client: TestClient,
        session_id: str,
        *,
        frame_id: str = "f1",
        frame_hash: str = "0000",
        text: str = "Breaking claim text",
        dom_text: str | None = None,
        source_url: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, object] = {
            "frame_id": frame_id,
            "perceptual_hash": frame_hash,
            "ocr_text": text,
        }
        if dom_text is not None:
            payload["dom_text"] = dom_text
        if source_url is not None:
            payload["source_url"] = source_url
        response = client.post(f"/v1/live-sessions/{session_id}/frames", json=payload)
        self.assertEqual(response.status_code, 200, response.text)
        return cast(dict[str, Any], response.json())

    def test_source_selection_required(self) -> None:
        client, _, _ = self.make_app()
        response = client.post(
            "/v1/live-sessions",
            json={
                "source_type": "screen",
                "source_id": "   ",
                "permission_granted": True,
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error_code"], "VALIDATION_ERROR")

    def test_permission_denial_is_structured(self) -> None:
        client, _, _ = self.make_app()
        response = client.post(
            "/v1/live-sessions",
            json={
                "source_type": "screen",
                "source_id": "source-1",
                "permission_granted": False,
            },
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error_code"], "LIVE_PERMISSION_DENIED")

    def test_create_session_sets_visible_indicator(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(client)
        self.assertEqual(session["status"], "capturing")
        self.assertTrue(session["visible_indicator_required"])
        self.assertTrue(session["visible_indicator_active"])

    def test_pause_resume_stop_and_cancel(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(client)
        paused = client.post(f"/v1/live-sessions/{session['session_id']}/pause").json()
        resumed = client.post(
            f"/v1/live-sessions/{session['session_id']}/resume"
        ).json()
        stopped = client.post(f"/v1/live-sessions/{session['session_id']}/stop").json()
        cancelled_session = self.create_session(client)
        cancelled = client.post(
            f"/v1/live-sessions/{cancelled_session['session_id']}/cancel"
        ).json()

        self.assertEqual(paused["status"], "paused")
        self.assertFalse(paused["visible_indicator_active"])
        self.assertEqual(resumed["status"], "capturing")
        self.assertTrue(resumed["visible_indicator_active"])
        self.assertEqual(stopped["status"], "completed")
        self.assertEqual(cancelled["status"], "cancelled")

    def test_static_frame_deduplication(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(client)
        self.submit_frame(
            client, session["session_id"], frame_id="f1", frame_hash="aaaa"
        )
        result = self.submit_frame(
            client,
            session["session_id"],
            frame_id="f2",
            frame_hash="aaaa",
            text="Changed words should not matter for static frame",
        )

        self.assertEqual(result["frame_count"], 2)
        self.assertEqual(result["skipped_frame_count"], 1)
        self.assertEqual(result["changed_frame_count"], 1)

    def test_perceptual_change_threshold_skips_near_static_frame(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(
            client,
            settings={"perceptual_change_threshold": 4},
        )
        self.submit_frame(
            client, session["session_id"], frame_id="f1", frame_hash="0000"
        )
        result = self.submit_frame(
            client,
            session["session_id"],
            frame_id="f2",
            frame_hash="0001",
            text="Nearby hash should be skipped",
        )

        self.assertEqual(result["skipped_frame_count"], 1)

    def test_scroll_merge_adds_only_new_trailing_text(self) -> None:
        self.assertEqual(
            merge_scroll_text("A B C", "B C D E"),
            "A B C D E",
        )

    def test_ocr_stabilization_waits_for_repeated_text(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(
            client,
            settings={
                "perceptual_change_threshold": 0,
                "stability_required_frames": 2,
            },
        )
        first = self.submit_frame(
            client,
            session["session_id"],
            frame_id="f1",
            frame_hash="0000",
            text="Stable article headline",
        )
        second = self.submit_frame(
            client,
            session["session_id"],
            frame_id="f2",
            frame_hash="ffff",
            text="Stable article headline",
        )

        self.assertEqual(first["stable_text"], "")
        self.assertIn("Stable article headline", second["stable_text"])

    def test_subtitle_deduplication_and_rule_cleaner(self) -> None:
        cleaned = rule_clean_live_text(
            "Skip ad. Breaking news claim. Breaking news claim. Accept cookies."
        )
        self.assertIn("Breaking news claim", cleaned)
        self.assertEqual(cleaned.count("Breaking news claim"), 1)
        self.assertNotIn("Skip ad", cleaned)
        self.assertNotIn("Accept cookies", cleaned)

    def test_ai_cleaner_is_rate_limited(self) -> None:
        now = datetime(2026, 7, 22, tzinfo=timezone.utc)
        cleaner = CountingCleaner()
        service = LiveOcrSessionService(
            sessions=InMemoryLiveSessionRepository(),
            events=InMemoryLiveSessionEventRepository(),
            workflow=cast(Any, CapturingWorkflow()),
            cleaner=cleaner,
            clock=lambda: now,
        )
        session = service.create(
            CreateLiveSessionCommand(
                source_type=LiveSourceType.SCREEN,
                source_id="screen-1",
                permission_granted=True,
                config=LiveSessionConfig(
                    perceptual_change_threshold=0,
                    ai_cleaning_cooldown_seconds=60,
                ),
            )
        )
        service.submit_frame(
            SubmitLiveFrameCommand(
                session_id=session.session_id,
                frame_id="f1",
                perceptual_hash="0000",
                ocr_text="First claim",
            )
        )
        service.submit_frame(
            SubmitLiveFrameCommand(
                session_id=session.session_id,
                frame_id="f2",
                perceptual_hash="ffff",
                ocr_text="Second claim",
            )
        )

        self.assertEqual(cleaner.calls, 1)

    def test_verification_is_rate_limited(self) -> None:
        client, _, workflow = self.make_app()
        session = self.create_session(client)
        self.submit_frame(client, session["session_id"], text="Enough text to verify")

        first = client.post(
            f"/v1/live-sessions/{session['session_id']}/verify",
            json={"trigger": "user", "force": False},
        )
        second = client.post(
            f"/v1/live-sessions/{session['session_id']}/verify",
            json={"trigger": "idle", "force": False},
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len(workflow.document_calls), 1)
        self.assertEqual(second.json()["verification_count"], 1)

    def test_frame_bytes_are_not_retained(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(client)
        result = self.submit_frame(client, session["session_id"])
        self.assertFalse(result["frame_bytes_retained"])

    def test_stable_buffer_is_capped_for_long_sessions(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(
            client,
            settings={
                "perceptual_change_threshold": 0,
                "max_buffer_chars": 500,
            },
        )
        session_id = session["session_id"]
        latest = session
        for index in range(120):
            latest = self.submit_frame(
                client,
                session_id,
                frame_id=f"f{index}",
                frame_hash=f"{index + 1:04x}",
                text=f"scrolling article sentence number {index}",
            )

        self.assertLessEqual(latest["buffer_chars"], 500)
        self.assertFalse(latest["frame_bytes_retained"])

    def test_session_reconnect_and_sse_events(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(client)
        self.submit_frame(client, session["session_id"])
        reconnected = client.get(f"/v1/live-sessions/{session['session_id']}")
        events = client.get(f"/v1/live-sessions/{session['session_id']}/events")

        self.assertEqual(reconnected.status_code, 200)
        self.assertIn("event: live_ocr", events.text)
        self.assertNotIn("Breaking claim text", events.text)

    def test_browser_tab_dom_text_and_url_are_used(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(
            client,
            source_type="browser_tab",
            source_url="https://example.com/article",
        )
        result = self.submit_frame(
            client,
            session["session_id"],
            dom_text="DOM article text from extension",
            source_url="https://example.com/article",
        )

        self.assertEqual(result["source_url"], "https://example.com/article")
        self.assertIn("DOM article text from extension", result["stable_text"])

    def test_screenshot_sources_do_not_invent_urls(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(
            client,
            source_type="screen",
            source_url="https://example.com/should-not-stick",
        )
        result = self.submit_frame(
            client,
            session["session_id"],
            source_url="https://example.com/should-not-stick",
        )

        self.assertIsNone(session["source_url"])
        self.assertIsNone(result["source_url"])

    def test_one_hour_memory_simulation_keeps_buffer_bounded(self) -> None:
        now = datetime(2026, 7, 22, tzinfo=timezone.utc)

        def tick() -> datetime:
            nonlocal now
            now = now + timedelta(seconds=1)
            return now

        service = LiveOcrSessionService(
            sessions=InMemoryLiveSessionRepository(),
            events=InMemoryLiveSessionEventRepository(retention_limit=50),
            workflow=cast(Any, CapturingWorkflow()),
            clock=tick,
        )
        session = service.create(
            CreateLiveSessionCommand(
                source_type=LiveSourceType.SCREEN,
                source_id="screen-1",
                permission_granted=True,
                config=LiveSessionConfig(
                    perceptual_change_threshold=0,
                    max_buffer_chars=1000,
                    max_session_duration_seconds=3600,
                ),
            )
        )
        for index in range(3600):
            service.submit_frame(
                SubmitLiveFrameCommand(
                    session_id=session.session_id,
                    frame_id=f"f{index}",
                    perceptual_hash=f"{index + 1:08x}",
                    ocr_text=f"hour long session text {index}",
                )
            )

        recovered = service.get(session.session_id)
        self.assertLessEqual(len(recovered.stable_text), 1000)
        self.assertFalse(recovered.frame_bytes_retained)

    def test_manual_verify_uses_shared_workflow(self) -> None:
        client, _, workflow = self.make_app()
        session = self.create_session(client)
        self.submit_frame(client, session["session_id"], text="A live OCR claim")
        verified = client.post(
            f"/v1/live-sessions/{session['session_id']}/verify",
            json={"trigger": "user", "deep_check": False, "force": True},
        )

        self.assertEqual(verified.status_code, 200)
        self.assertEqual(
            verified.json()["latest_verification"]["final_verdict"], "UNVERIFIED"
        )
        self.assertEqual(len(workflow.document_calls), 1)

    def test_stopped_session_rejects_more_frames(self) -> None:
        client, _, _ = self.make_app()
        session = self.create_session(client)
        client.post(f"/v1/live-sessions/{session['session_id']}/stop")
        response = client.post(
            f"/v1/live-sessions/{session['session_id']}/frames",
            json={"frame_id": "late", "perceptual_hash": "ffff", "ocr_text": "late"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error_code"], "LIVE_SESSION_NOT_CAPTURING")

    def test_region_source_preserves_region(self) -> None:
        client, _, _ = self.make_app()
        response = client.post(
            "/v1/live-sessions",
            json={
                "source_type": "region",
                "source_id": "region-1",
                "permission_granted": True,
                "region": {"x": 10, "y": 20, "width": 300, "height": 200},
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["region"],
            {"x": 10, "y": 20, "width": 300, "height": 200},
        )

    def test_openapi_and_typescript_include_live_contracts(self) -> None:
        client, _, _ = self.make_app()
        schema = cast(Any, client.app).openapi()
        ts_text = (
            Path.cwd() / "packages" / "contracts" / "typescript" / "api.ts"
        ).read_text(encoding="utf-8")

        self.assertIn("/v1/live-sessions", schema["paths"])
        self.assertIn("LiveSessionResponse", schema["components"]["schemas"])
        self.assertIn("LiveSessionResponse", ts_text)
        self.assertIn("CreateLiveSessionRequest", ts_text)

    def test_readiness_reports_live_ocr(self) -> None:
        client, _, _ = self.make_app()
        response = client.get("/v1/health/ready")
        components = {
            item["name"]: item["status"] for item in response.json()["components"]
        }

        self.assertEqual(components["live_ocr_sessions"], "ready")


if __name__ == "__main__":
    unittest.main()
