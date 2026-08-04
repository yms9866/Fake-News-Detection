from __future__ import annotations

from pathlib import Path
import tempfile
from typing import cast
import unittest

from fastapi.testclient import TestClient

from apps.api.app.factory import create_app
from apps.api.app.state import ApiContainer, InMemoryAnalysisRepository, ModelRegistry
from packages.backend.fnd.adapters.extraction.text import DirectTextExtractor
from packages.backend.fnd.adapters.llm.gemini_grounding import (
    GeminiGroundedSearchEvidenceProvider,
)
from packages.backend.fnd.application.bootstrap import build_analyze_content_workflow
from packages.backend.fnd.application.services.verdict_policy import VerdictPolicy
from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    AnalyzeContentCommand,
    EvidenceAnalysis,
    EvidenceItem,
    ExtractedDocument,
    SearchContext,
    StyleAnalysis,
    VerdictDecision,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    InputType,
    SourceType,
    StyleRiskSignal,
)


class FakeEvidenceProvider:
    api_key = None


class FakeSearchProvider:
    pass


class FakeStyleModel:
    _loaded = False


class FakeUrlExtractor:
    def extract(self, url: str) -> ExtractedDocument:
        return ExtractedDocument(
            input_type=InputType.URL,
            text="Fetched URL article body.",
            source=url,
            metadata={"url": url},
        )


class FakeFileExtractor:
    def extract(self, path: Path) -> ExtractedDocument:
        return ExtractedDocument(
            input_type=InputType.FILE,
            text="Fetched file article body.",
            source=str(path),
        )


class FakeSearchProviderForWorkflow:
    def search(self, claim_text: str, max_results: int) -> SearchContext:
        return SearchContext(query="fake query", raw_context="")


class NullEvidenceProvider:
    api_key = None

    def verify(
        self, claim_text: str, search_context: SearchContext
    ) -> EvidenceAnalysis:
        return EvidenceAnalysis(
            provider_name="null",
            verdict=FinalVerdict.ERROR,
            evidence_quality=EvidenceQuality.LOW,
            explanation="not configured",
            error="MISSING_PROVIDER",
        )


class CountingHighRiskStyleModel:
    def __init__(self) -> None:
        self._loaded = False
        self.initialization_count = 0
        self.analyze_count = 0

    def analyze(self, text: str, max_length: int) -> StyleAnalysis:
        if not self._loaded:
            self._loaded = True
            self.initialization_count += 1

        self.analyze_count += 1
        return StyleAnalysis.from_prediction(
            signal=StyleRiskSignal.HIGH,
            confidence=0.9894812107086182,
            text=text,
            model_name="counting-test-model",
            max_length=max_length,
            inference_duration_ms=1.0,
        )


class FakeWorkflow:
    def __init__(self) -> None:
        self.calls: list[AnalyzeContentCommand] = []
        self.evidence_provider = FakeEvidenceProvider()
        self.search_provider = FakeSearchProvider()
        self.style_model = FakeStyleModel()
        self.next_result = self._result(
            input_type=InputType.DIRECT_TEXT,
            text="Example article text with enough words for the local classifier.",
            source=None,
        )

    def analyze(self, command: AnalyzeContentCommand) -> AnalysisResult:
        self.calls.append(command)
        return self.next_result

    def _result(
        self,
        *,
        input_type: InputType,
        text: str,
        source: str | None,
        evidence_error: str | None = None,
    ) -> AnalysisResult:
        evidence = None
        search_context = None
        if evidence_error:
            search_context = SearchContext(
                query="claim query",
                raw_context="WEB_SEARCH_ERROR: provider unavailable",
                error="provider unavailable",
            )
            evidence = EvidenceAnalysis(
                provider_name="fake",
                verdict=FinalVerdict.ERROR,
                evidence_quality=EvidenceQuality.LOW,
                explanation="Evidence provider failed.",
                recommendation="Try again later.",
                raw_context=search_context.raw_context,
                error=evidence_error,
            )

        return AnalysisResult(
            document=ExtractedDocument(
                input_type=input_type,
                text=text,
                source=source,
                metadata={"url": source} if source else {},
            ),
            style=StyleAnalysis.from_prediction(
                signal=StyleRiskSignal.LOW,
                confidence=0.91,
                text=text,
                model_name="fake-model",
            ),
            evidence=evidence,
            search_context=search_context,
            final=VerdictDecision(
                verdict=(
                    FinalVerdict.UNVERIFIED if evidence_error else FinalVerdict.REAL
                ),
                confidence=(
                    EvidenceQuality.LOW if evidence_error else EvidenceQuality.HIGH
                ),
                reason="Fake workflow decision.",
            ),
        )


def make_settings(model_path: Path) -> Settings:
    return Settings(
        environment="test",
        project_root=model_path.parent,
        modernbert_model_path=model_path,
        gemini_model="gemini-test",
        gemini_api_key=None,
        max_search_results=3,
        max_length=512,
        high_style_risk_threshold=0.80,
        enable_external_ai=True,
        max_url_bytes=100_000,
        request_timeout_seconds=1.0,
    )


class ApiSlice2Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.model_path = Path(self.temp_dir.name) / "model"
        self.model_path.mkdir()
        self.workflow = FakeWorkflow()
        settings = make_settings(self.model_path)
        container = ApiContainer(
            settings=settings,
            workflow=cast(AnalyzeContentWorkflow, self.workflow),
            analyses=InMemoryAnalysisRepository(),
            model_registry=ModelRegistry(
                model_path=self.model_path,
                max_length=settings.max_length,
                style_model=self.workflow.style_model,
            ),
        )
        self.app = create_app(
            container=container,
            allowed_origins=["http://127.0.0.1:5173"],
        )
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_default_workflow_uses_gemini_grounded_search_provider(self) -> None:
        workflow = build_analyze_content_workflow(make_settings(self.model_path))

        self.assertIsInstance(
            workflow.search_provider,
            GeminiGroundedSearchEvidenceProvider,
        )
        self.assertIs(workflow.search_provider, workflow.evidence_provider)
        self.assertIsNone(workflow.evidence_review_pipeline)

    def test_liveness_succeeds_without_calling_workflow(self) -> None:
        response = self.client.get("/v1/health/live")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "live")
        self.assertEqual(self.workflow.calls, [])

    def test_readiness_reports_model_and_provider_status(self) -> None:
        response = self.client.get("/v1/health/ready")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["status"], "ready")
        statuses = {item["name"]: item["status"] for item in body["components"]}
        self.assertEqual(statuses["modernbert_model_path"], "ready")
        self.assertEqual(statuses["modernbert_model_runtime"], "unloaded")
        self.assertEqual(statuses["evidence_provider"], "missing")

    def test_text_endpoint_calls_workflow(self) -> None:
        response = self.client.post(
            "/v1/analyses/text",
            json={
                "text": "This is a real article-shaped test payload with enough words.",
                "deep_check": False,
                "max_length": 512,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.workflow.calls), 1)
        command = self.workflow.calls[0]
        self.assertEqual(
            command.text,
            "This is a real article-shaped test payload with enough words.",
        )
        self.assertEqual(command.max_length, 512)
        self.assertEqual(response.json()["status"], "completed")
        self.assertEqual(response.json()["input_type"], "text")
        self.assertIn("style_scope_reliable", response.json())
        self.assertEqual(
            response.json()["style_assessment"]["display_text"],
            "The writing style seems similar to real or legitimate news reporting.",
        )
        self.assertIn(
            "Writing style alone cannot establish",
            response.json()["style_assessment"]["limitation"],
        )

    def test_url_endpoint_calls_workflow(self) -> None:
        self.workflow.next_result = self.workflow._result(
            input_type=InputType.URL,
            text="Fetched article body",
            source="https://example.com/article",
        )
        response = self.client.post(
            "/v1/analyses/url",
            json={
                "url": "https://example.com/article",
                "deep_check": True,
                "max_length": 512,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(self.workflow.calls), 1)
        command = self.workflow.calls[0]
        self.assertEqual(command.url, "https://example.com/article")
        self.assertTrue(command.deep_check)
        self.assertEqual(response.json()["source_url"], "https://example.com/article")
        self.assertEqual(response.json()["input_type"], "url")

    def test_get_analysis_returns_stored_result(self) -> None:
        created = self.client.post(
            "/v1/analyses/text",
            json={"text": "Enough text for a normal analysis result."},
        )
        analysis_id = created.json()["analysis_id"]

        fetched = self.client.get(f"/v1/analyses/{analysis_id}")

        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["analysis_id"], analysis_id)

    def test_invalid_url_returns_stable_validation_error(self) -> None:
        response = self.client.post(
            "/v1/analyses/url",
            json={"url": "not-a-url", "deep_check": False},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error_code"], "VALIDATION_ERROR")

    def test_empty_text_returns_stable_validation_error(self) -> None:
        response = self.client.post(
            "/v1/analyses/text",
            json={"text": "   "},
        )

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["error_code"], "VALIDATION_ERROR")

    def test_provider_failure_does_not_expose_stack_trace(self) -> None:
        self.workflow.next_result = self.workflow._result(
            input_type=InputType.DIRECT_TEXT,
            text="Article-shaped text",
            source=None,
            evidence_error="GEMINI_VERIFICATION_FAILED",
        )

        response = self.client.post(
            "/v1/analyses/text",
            json={"text": "Article-shaped text", "deep_check": True},
        )

        self.assertEqual(response.status_code, 200)
        body_text = response.text.lower()
        self.assertNotIn("traceback", body_text)
        self.assertNotIn("stack", body_text)
        self.assertEqual(response.json()["final_verdict"], "UNVERIFIED")

    def test_request_id_is_present_in_response_headers(self) -> None:
        response = self.client.get(
            "/v1/health/live",
            headers={"X-Request-ID": "req-test", "X-Trace-ID": "trace-test"},
        )

        self.assertEqual(response.headers["X-Request-ID"], "req-test")
        self.assertEqual(response.headers["X-Trace-ID"], "trace-test")
        self.assertEqual(response.json()["request_id"], "req-test")

    def test_auth_sign_in_restore_and_sign_out_revoke_session(self) -> None:
        sign_in = self.client.post(
            "/v1/auth/sign-in",
            json={
                "username": "local-reviewer",
                "tenant_id": "local",
                "client_type": "web",
            },
        )
        self.assertEqual(sign_in.status_code, 200)
        session = sign_in.json()
        self.assertTrue(session["authenticated"])
        self.assertEqual(session["user"]["user_id"], "local-reviewer")
        token = session["access_token"]
        self.assertIsInstance(token, str)

        restored = self.client.get(
            "/v1/auth/session",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.json()["authenticated"])
        self.assertIsNone(restored.json()["access_token"])

        signed_out = self.client.post(
            "/v1/auth/sign-out",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(signed_out.status_code, 200)
        self.assertTrue(signed_out.json()["signed_out"])

        rejected = self.client.get(
            "/v1/auth/session",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(rejected.status_code, 401)
        self.assertEqual(rejected.json()["error_code"], "AUTHENTICATION_REQUIRED")

    def test_wildcard_cors_is_not_enabled(self) -> None:
        self.assertNotIn("*", self.app.state.allowed_origins)
        with self.assertRaises(ValueError):
            create_app(
                container=self.app.state.container,
                allowed_origins=["*"],
            )

    def test_cors_preflight_accepts_configured_origin(self) -> None:
        response = self.client.options(
            "/v1/analyses/text",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization,Content-Type,X-CSRF-Token",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://127.0.0.1:5173",
        )
        self.assertIn("POST", response.headers["access-control-allow-methods"])
        self.assertIn(
            "Authorization",
            response.headers["access-control-allow-headers"],
        )
        self.assertIn(
            "X-CSRF-Token",
            response.headers["access-control-allow-headers"],
        )

    def test_cors_rejects_unconfigured_origin(self) -> None:
        response = self.client.get(
            "/v1/health/live",
            headers={"Origin": "https://unconfigured.example"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("access-control-allow-origin", response.headers)

    def test_structured_evidence_keeps_policy_verdict_authoritative(self) -> None:
        self.workflow.next_result = self._analysis_with_evidence(
            items=(
                EvidenceItem(
                    url="https://news.example/article",
                    title="Mentions the topic",
                    publisher="Example News",
                    source_type=SourceType.REPUTABLE_NEWS,
                    stance=EvidenceStance.MENTIONS,
                    reliability=EvidenceQuality.LOW,
                    fetched=False,
                    mentions_only=True,
                ),
                EvidenceItem(
                    url="javascript:alert(1)",
                    title="Unsafe source",
                    source_type=SourceType.UNKNOWN,
                    stance=EvidenceStance.MENTIONS,
                    reliability=EvidenceQuality.LOW,
                    fetched=False,
                    mentions_only=True,
                ),
            ),
            provider_verdict=FinalVerdict.REAL,
            provider_quality=EvidenceQuality.HIGH,
            final_verdict=FinalVerdict.UNVERIFIED,
            final_quality=EvidenceQuality.LOW,
        )

        response = self.client.post(
            "/v1/analyses/text",
            json={"text": "Evidence serializer regression claim.", "deep_check": True},
        )

        body = response.json()
        verification = body["verification"]
        self.assertEqual(body["final_verdict"], "UNVERIFIED")
        self.assertEqual(verification["verdict"], "UNVERIFIED")
        self.assertEqual(verification["evidence_quality"], "LOW")
        self.assertEqual(verification["qualifying_source_count"], 0)
        self.assertIsNone(verification["raw_assessment"])
        self.assertIsNone(verification["web_context"])
        self.assertIn("final_assessment", body)
        self.assertEqual(body["final_assessment"]["verdict"], "UNVERIFIED")
        self.assertEqual(verification["evidence"][0]["source_id"], "source-1")
        self.assertEqual(verification["evidence"][0]["source_number"], 1)
        self.assertEqual(verification["evidence"][0]["domain"], "news.example")
        self.assertEqual(verification["evidence"][0]["stance"], "MENTIONS")
        self.assertFalse(verification["evidence"][0]["fetched"])
        self.assertFalse(verification["evidence"][0]["used_in_explanation"])
        self.assertEqual(verification["evidence"][1]["url"], "")

    def test_gemini_grounded_sources_have_human_fetch_messages(self) -> None:
        self.workflow.next_result = self._analysis_with_evidence(
            items=(
                EvidenceItem(
                    source_id="source-1",
                    url="https://vertexaisearch.cloud.google.com/grounding-api-redirect/example",
                    title="reuters.com",
                    publisher="reuters.com",
                    source_type=SourceType.WIRE_SERVICE,
                    stance=EvidenceStance.CONTRADICTS,
                    reliability=EvidenceQuality.HIGH,
                    fetched=True,
                    search_provider="gemini_google_search",
                    qualification_status="QUALIFIED",
                    used_in_explanation=True,
                ),
            ),
            provider_verdict=FinalVerdict.FAKE,
            provider_quality=EvidenceQuality.HIGH,
            final_verdict=FinalVerdict.FAKE,
            final_quality=EvidenceQuality.HIGH,
        )

        response = self.client.post(
            "/v1/analyses/text",
            json={"text": "Gemini grounded source serializer regression claim."},
        )

        source = response.json()["sources"][0]
        self.assertEqual(source["publisher"], "reuters.com")
        self.assertEqual(
            source["fetch_message"],
            "Gemini returned this source through Google Search grounding.",
        )
        self.assertIn("Gemini grounding cited", source["qualification_explanation"])

    def test_duplicate_qualifying_sources_count_once(self) -> None:
        self.workflow.next_result = self._analysis_with_evidence(
            items=(
                EvidenceItem(
                    url="https://first.example/article",
                    title="First copy",
                    publisher="Wire Copy",
                    independence_key="wire-copy",
                    source_type=SourceType.REPUTABLE_NEWS,
                    stance=EvidenceStance.SUPPORTS,
                    reliability=EvidenceQuality.MEDIUM,
                    fetched=True,
                ),
                EvidenceItem(
                    url="https://second.example/article",
                    title="Second copy",
                    publisher="Wire Copy",
                    independence_key="wire-copy",
                    source_type=SourceType.REPUTABLE_NEWS,
                    stance=EvidenceStance.SUPPORTS,
                    reliability=EvidenceQuality.MEDIUM,
                    fetched=True,
                ),
            ),
            provider_verdict=FinalVerdict.REAL,
            provider_quality=EvidenceQuality.HIGH,
            final_verdict=FinalVerdict.UNVERIFIED,
            final_quality=EvidenceQuality.LOW,
        )

        response = self.client.post(
            "/v1/analyses/text",
            json={"text": "Duplicate evidence grouping regression claim."},
        )

        verification = response.json()["verification"]
        self.assertEqual(verification["qualifying_source_count"], 1)
        self.assertTrue(verification["evidence"][0]["used_in_explanation"])
        self.assertTrue(verification["evidence"][1]["used_in_explanation"])

    def test_openapi_response_schemas_match_shared_contracts(self) -> None:
        schema = self.app.openapi()
        schemas = schema["components"]["schemas"]

        self.assertIn("AnalysisResponse", schemas)
        self.assertIn("ApiErrorResponse", schemas)
        properties = schemas["AnalysisResponse"]["properties"]
        self.assertIn("style_scope_reliable", properties)
        self.assertIn("style_word_count", properties)
        self.assertIn("style_minimum_word_count", properties)
        self.assertIn("style_warning", properties)
        self.assertIn("style_assessment", properties)
        self.assertIn("claims", properties)
        self.assertIn("search_summary", properties)
        self.assertIn("sources", properties)
        self.assertIn("gemini_evidence", properties)
        self.assertIn("final_assessment", properties)
        self.assertIn("StyleAssessmentResponse", schemas)
        self.assertIn("ClaimResponse", schemas)
        self.assertIn("ReviewedSourceResponse", schemas)
        self.assertIn("GeminiEvidenceAssessmentResponse", schemas)
        self.assertIn("FinalAssessmentResponse", schemas)
        verification = schemas["VerificationResponse"]["properties"]
        self.assertIn("evidence_summary_items", verification)
        self.assertIn("qualifying_source_count", verification)
        self.assertIn("raw_assessment", verification)
        evidence = schemas["EvidenceSummaryItem"]["properties"]
        self.assertIn("source_id", evidence)
        self.assertIn("source_number", evidence)
        self.assertIn("domain", evidence)
        self.assertIn("used_in_explanation", evidence)
        text_response = schema["paths"]["/v1/analyses/text"]["post"]["responses"]["200"]
        ref = text_response["content"]["application/json"]["schema"]["$ref"]
        self.assertEqual(ref, "#/components/schemas/AnalysisResponse")

    def test_typescript_contract_contains_python_response_fields(self) -> None:
        ts_contract = Path.cwd() / "packages" / "contracts" / "typescript" / "api.ts"
        text = ts_contract.read_text(encoding="utf-8")

        for field_name in [
            "style_scope_reliable",
            "style_word_count",
            "style_minimum_word_count",
            "style_warning",
            "style_assessment",
            "claims",
            "search_summary",
            "sources",
            "gemini_evidence",
            "final_assessment",
            "source_id",
            "qualifying_source_count",
            "raw_assessment",
            'InputTypeCode = "text" | "url" | "file" | "unknown"',
        ]:
            self.assertIn(field_name, text)

    def test_domain_and_application_have_no_fastapi_dependency(self) -> None:
        root = Path.cwd() / "packages" / "backend" / "fnd"
        checked_dirs = [root / "domain", root / "application"]
        offenders: list[Path] = []
        for checked_dir in checked_dirs:
            for path in checked_dir.rglob("*.py"):
                text = path.read_text(encoding="utf-8")
                if "fastapi" in text.lower():
                    offenders.append(path)

        self.assertEqual(offenders, [])

    def test_real_workflow_nine_word_input_does_not_become_suspicious(self) -> None:
        style_model = CountingHighRiskStyleModel()
        workflow = AnalyzeContentWorkflow(
            text_extractor=DirectTextExtractor(),
            url_extractor=FakeUrlExtractor(),
            file_extractor=FakeFileExtractor(),
            style_model=style_model,
            search_provider=FakeSearchProviderForWorkflow(),
            evidence_provider=NullEvidenceProvider(),
            verdict_policy=VerdictPolicy(),
        )
        settings = make_settings(self.model_path)
        app = create_app(
            container=ApiContainer(
                settings=settings,
                workflow=workflow,
                analyses=InMemoryAnalysisRepository(),
                model_registry=ModelRegistry(
                    model_path=self.model_path,
                    max_length=settings.max_length,
                    style_model=style_model,
                ),
            ),
            allowed_origins=["http://127.0.0.1:5173"],
        )
        client = TestClient(app)

        response = client.post(
            "/v1/analyses/text",
            json={
                "text": "A sufficiently long article or factual claim for testing.",
                "deep_check": False,
                "max_length": 512,
            },
        )

        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["style_signal"], "HIGH_STYLE_RISK")
        self.assertFalse(body["style_scope_reliable"])
        self.assertEqual(body["style_word_count"], 9)
        self.assertEqual(body["style_minimum_word_count"], 20)
        self.assertEqual(body["final_verdict"], "UNVERIFIED")
        self.assertEqual(body["confidence"], "LOW")
        self.assertEqual(
            body["reason"],
            "The input is too short for reliable article-style analysis, and factual "
            "verification was not performed.",
        )
        self.assertIn("Short input (9 words)", body["warnings"][0])

    def test_two_requests_reuse_one_style_analyzer_instance(self) -> None:
        style_model = CountingHighRiskStyleModel()
        workflow = AnalyzeContentWorkflow(
            text_extractor=DirectTextExtractor(),
            url_extractor=FakeUrlExtractor(),
            file_extractor=FakeFileExtractor(),
            style_model=style_model,
            search_provider=FakeSearchProviderForWorkflow(),
            evidence_provider=NullEvidenceProvider(),
            verdict_policy=VerdictPolicy(),
        )
        settings = make_settings(self.model_path)
        app = create_app(
            container=ApiContainer(
                settings=settings,
                workflow=workflow,
                analyses=InMemoryAnalysisRepository(),
                model_registry=ModelRegistry(
                    model_path=self.model_path,
                    max_length=settings.max_length,
                    style_model=style_model,
                ),
            ),
            allowed_origins=["http://127.0.0.1:5173"],
        )
        client = TestClient(app)

        for _ in range(2):
            response = client.post(
                "/v1/analyses/text",
                json={
                    "text": "A sufficiently long article or factual claim for testing."
                },
            )
            self.assertEqual(response.status_code, 200)

        self.assertIs(app.state.container.workflow.style_model, style_model)
        self.assertIs(app.state.container.model_registry.style_model, style_model)
        self.assertEqual(style_model.initialization_count, 1)
        self.assertEqual(style_model.analyze_count, 2)

    def test_timing_logs_do_not_contain_input_text(self) -> None:
        style_model = CountingHighRiskStyleModel()
        workflow = AnalyzeContentWorkflow(
            text_extractor=DirectTextExtractor(),
            url_extractor=FakeUrlExtractor(),
            file_extractor=FakeFileExtractor(),
            style_model=style_model,
            search_provider=FakeSearchProviderForWorkflow(),
            evidence_provider=NullEvidenceProvider(),
            verdict_policy=VerdictPolicy(),
        )
        sensitive_text = "private user claim text should not appear in logs"

        with self.assertLogs(
            "packages.backend.fnd.application.workflows.analyze_content",
            level="INFO",
        ) as captured:
            workflow.analyze(AnalyzeContentCommand(text=sensitive_text))

        joined_logs = "\n".join(captured.output)
        self.assertIn("analysis_timing", joined_logs)
        self.assertNotIn(sensitive_text, joined_logs)

    def _analysis_with_evidence(
        self,
        *,
        items: tuple[EvidenceItem, ...],
        provider_verdict: FinalVerdict,
        provider_quality: EvidenceQuality,
        final_verdict: FinalVerdict,
        final_quality: EvidenceQuality,
    ) -> AnalysisResult:
        text = "Evidence serializer regression claim with enough words for a stable style result."
        evidence = EvidenceAnalysis(
            provider_name="fake",
            verdict=provider_verdict,
            evidence_quality=provider_quality,
            explanation="Raw provider explanation.",
            evidence_summary=("Provider summary.",),
            recommendation="Review qualified fetched sources.",
            items=items,
            raw_context="raw web context",
        )
        return AnalysisResult(
            document=ExtractedDocument(
                input_type=InputType.DIRECT_TEXT,
                text=text,
                source=None,
            ),
            style=StyleAnalysis.from_prediction(
                signal=StyleRiskSignal.LOW,
                confidence=0.91,
                text=text,
                model_name="fake-model",
            ),
            evidence=evidence,
            search_context=SearchContext(
                query="claim query",
                raw_context="search context",
                reviewed_sources=items,
            ),
            final=VerdictDecision(
                verdict=final_verdict,
                confidence=final_quality,
                reason="Deterministic policy decision.",
            ),
        )


if __name__ == "__main__":
    unittest.main()
