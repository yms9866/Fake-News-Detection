from __future__ import annotations

from datetime import timedelta
import json
from pathlib import Path
import tempfile
from typing import Any, cast
import unittest

from fastapi.testclient import TestClient

from apps.api.app.factory import create_app
from apps.api.app.state import ApiContainer, InMemoryAnalysisRepository, ModelRegistry
from packages.backend.fnd.adapters.persistence.in_memory_enterprise import (
    InMemoryAuditRepository,
    InMemoryDeviceRepository,
    InMemoryRetentionPolicyRepository,
    InMemorySessionRepository,
    InMemoryTenantJsonRepository,
)
from packages.backend.fnd.adapters.persistence.postgres import (
    PostgresAuditRepository,
    PostgresEventRepository,
    PostgresIdempotencyRepository,
    PostgresJsonRepository,
)
from packages.backend.fnd.adapters.queue.redis_queue import (
    RedisQueueAdapter,
    RedisRetryPolicy,
)
from packages.backend.fnd.adapters.storage.s3 import (
    S3ObjectStoreAdapter,
    S3RetentionConfig,
)
from packages.backend.fnd.adapters.telemetry.otel import (
    InMemoryMetricsRecorder,
    InMemoryTraceRecorder,
    SpanTimer,
)
from packages.backend.fnd.application.services.auth import (
    AuthService,
    OidcConfiguration,
    pkce_challenge,
)
from packages.backend.fnd.application.workflows.analyze_content import (
    AnalyzeContentWorkflow,
)
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.enterprise import (
    AuditAction,
    AuditEvent,
    Principal,
    RetentionPolicy,
    Role,
    TenantContext,
)
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
    StyleRiskSignal,
)


class FakeSqlConnection:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[object, ...]]] = []
        self.fetchone_row: dict[str, Any] | None = None
        self.fetchall_rows: list[dict[str, Any]] = []

    def execute(self, sql: str, params: tuple[object, ...]) -> None:
        self.executed.append((sql, params))

    def fetchone(self, sql: str, params: tuple[object, ...]) -> dict[str, Any] | None:
        self.executed.append((sql, params))
        return self.fetchone_row

    def fetchall(self, sql: str, params: tuple[object, ...]) -> list[dict[str, Any]]:
        self.executed.append((sql, params))
        return self.fetchall_rows


class FakeRedisClient:
    def __init__(self) -> None:
        self.lists: dict[str, list[str]] = {}
        self.sets: dict[str, set[str]] = {}
        self.hashes: dict[str, dict[str, str]] = {}

    def lpush(self, name: str, value: str) -> None:
        self.lists.setdefault(name, []).insert(0, value)

    def sadd(self, name: str, value: str) -> None:
        self.sets.setdefault(name, set()).add(value)

    def hset(self, name: str, key: str, value: str) -> None:
        self.hashes.setdefault(name, {})[key] = value

    def llen(self, name: str) -> int:
        return len(self.lists.get(name, []))


class FakeS3Client:
    def __init__(self) -> None:
        self.puts: list[dict[str, Any]] = []
        self.deletes: list[dict[str, Any]] = []
        self.presigns: list[dict[str, Any]] = []

    def put_object(self, **kwargs: Any) -> None:
        self.puts.append(kwargs)

    def delete_object(self, **kwargs: Any) -> None:
        self.deletes.append(kwargs)

    def generate_presigned_url(
        self,
        client_method: str,
        *,
        Params: dict[str, object],
        ExpiresIn: int,
    ) -> str:
        self.presigns.append(
            {"client_method": client_method, "Params": Params, "ExpiresIn": ExpiresIn}
        )
        return f"https://s3.example.test/{Params['Key']}"


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
        self.calls: list[AnalyzeContentCommand] = []

    def analyze(self, command: AnalyzeContentCommand) -> AnalysisResult:
        self.calls.append(command)
        text = command.text or "enterprise readiness body with enough words for style"
        return AnalysisResult(
            document=ExtractedDocument(input_type=InputType.DIRECT_TEXT, text=text),
            style=StyleAnalysis.from_prediction(
                signal=StyleRiskSignal.LOW,
                confidence=0.9,
                text=text,
                model_name="enterprise-test",
            ),
            evidence=None,
            search_context=None,
            final=VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason="Enterprise fake workflow decision.",
            ),
        )


class EnterpriseSlice9Tests(unittest.TestCase):
    def test_in_memory_repository_is_tenant_scoped(self) -> None:
        repository = InMemoryTenantJsonRepository()
        tenant_a = TenantContext("tenant-a")
        tenant_b = TenantContext("tenant-b")

        repository.save(tenant_a, "analysis-1", {"value": "a"})

        self.assertEqual(repository.get(tenant_a, "analysis-1"), {"value": "a"})
        self.assertIsNone(repository.get(tenant_b, "analysis-1"))

    def test_postgres_json_repository_enforces_tenant_query_and_table_safety(
        self,
    ) -> None:
        connection = FakeSqlConnection()
        repository = PostgresJsonRepository(connection, "analysis_records")
        tenant = TenantContext("tenant-a")

        repository.save(tenant, "analysis-1", {"verdict": "UNVERIFIED"})
        self.assertIn("tenant_id, resource_id", connection.executed[0][0])
        self.assertEqual(connection.executed[0][1][0:2], ("tenant-a", "analysis-1"))

        connection.fetchone_row = {"payload": '{"verdict":"UNVERIFIED"}'}
        self.assertEqual(
            repository.get(tenant, "analysis-1"), {"verdict": "UNVERIFIED"}
        )
        self.assertIn("where tenant_id = %s", connection.executed[-1][0].lower())

        with self.assertRaises(ValueError):
            PostgresJsonRepository(connection, "analysis;drop table users")

    def test_postgres_event_idempotency_and_audit_repositories_are_tenant_scoped(
        self,
    ) -> None:
        connection = FakeSqlConnection()
        tenant = TenantContext("tenant-a")

        PostgresEventRepository(connection).append(tenant, "stream-1", {"step": 1})
        self.assertEqual(connection.executed[-1][1][0], "tenant-a")

        connection.fetchall_rows = [{"payload": '{"step":1}'}]
        self.assertEqual(
            PostgresEventRepository(connection).list(tenant, "stream-1"), [{"step": 1}]
        )
        self.assertEqual(connection.executed[-1][1], ("tenant-a", "stream-1"))

        PostgresIdempotencyRepository(connection).save(tenant, "key-1", "resource-1")
        self.assertEqual(
            connection.executed[-1][1], ("tenant-a", "key-1", "resource-1")
        )
        connection.fetchone_row = {"resource_id": "resource-1"}
        self.assertEqual(
            PostgresIdempotencyRepository(connection).get(tenant, "key-1"),
            "resource-1",
        )

        audit = AuditEvent(
            event_id="event-1",
            tenant_id="tenant-a",
            actor_user_id="user-1",
            action=AuditAction.SECURITY_FAILURE,
            resource_type="session",
            resource_id="session-1",
            metadata={"reason": "token_replay"},
        )
        PostgresAuditRepository(connection).append(audit)
        self.assertEqual(connection.executed[-1][1][1], "tenant-a")

    def test_auth_device_session_replay_and_rbac(self) -> None:
        audit = InMemoryAuditRepository()
        devices = InMemoryDeviceRepository()
        sessions = InMemorySessionRepository()
        auth = AuthService(sessions=sessions, devices=devices, audit=audit)
        principal = Principal(
            user_id="user-1",
            tenant_id="tenant-a",
            roles=(Role.REVIEWER,),
        )

        device = auth.register_device(principal=principal, client_type="web")
        session = auth.create_session(
            principal,
            device.device_id,
            lifetime=timedelta(minutes=5),
        )

        self.assertTrue(session.active)
        self.assertIsNotNone(sessions.get(session.session_id))
        self.assertEqual(
            [
                event.action
                for event in audit.list_for_tenant(TenantContext("tenant-a"))
            ],
            [AuditAction.DEVICE_REGISTERED, AuditAction.LOGIN],
        )

        auth.authorize(principal, "tenant-a", Role.REVIEWER)
        with self.assertRaises(PermissionError):
            auth.authorize(principal, "tenant-b", Role.REVIEWER)

        system_admin = Principal(
            user_id="root",
            tenant_id="platform",
            roles=(Role.SYSTEM_ADMIN,),
        )
        auth.authorize(system_admin, "tenant-b", Role.ORGANIZATION_ADMIN)

        auth.accept_token_id_once("token-id-1")
        with self.assertRaises(PermissionError):
            auth.accept_token_id_once("token-id-1")

    def test_oidc_pkce_request_is_authorization_code_flow(self) -> None:
        config = OidcConfiguration(
            issuer="https://issuer.example.test",
            client_id="client-1",
            authorization_endpoint="https://issuer.example.test/authorize",
            token_endpoint="https://issuer.example.test/token",
            jwks_uri="https://issuer.example.test/jwks",
        )
        auth = AuthService(
            sessions=InMemorySessionRepository(),
            devices=InMemoryDeviceRepository(),
            audit=InMemoryAuditRepository(),
        )

        request = auth.build_authorization_request(config)

        self.assertIn("response_type=code", request.authorization_url)
        self.assertIn("code_challenge_method=S256", request.authorization_url)
        self.assertNotEqual(request.code_verifier, request.code_challenge)
        self.assertEqual(pkce_challenge(request.code_verifier), request.code_challenge)

    def test_retention_policy_repository_is_tenant_scoped(self) -> None:
        repository = InMemoryRetentionPolicyRepository()
        repository.save(
            RetentionPolicy(
                tenant_id="tenant-a",
                analysis_retention_days=30,
                artifact_retention_days=3,
                audit_retention_days=400,
            )
        )

        policy = repository.get(TenantContext("tenant-a"))
        self.assertIsNotNone(policy)
        assert policy is not None
        self.assertEqual(policy.analysis_retention_days, 30)
        self.assertIsNone(repository.get(TenantContext("tenant-b")))

    def test_redis_queue_retry_dead_letter_cancel_progress_and_depth(self) -> None:
        client = FakeRedisClient()
        queue = RedisQueueAdapter(
            client,
            retry_policy=RedisRetryPolicy(max_attempts=2),
        )
        tenant = TenantContext("tenant-a")

        job_id = queue.enqueue(tenant, "analysis", {"analysis_id": "a1"})
        message = json.loads(client.lists["analysis"][0])
        self.assertEqual(message["tenant_id"], "tenant-a")
        self.assertEqual(message["job_id"], job_id)
        self.assertEqual(queue.queue_depth("analysis"), 1)

        queue.record_progress(job_id, 125, "running")
        self.assertEqual(
            json.loads(client.hashes["job-progress"][job_id]),
            {"progress": 100, "status": "running"},
        )

        self.assertTrue(queue.cancel(job_id))
        self.assertIn(job_id, client.sets["cancelled-jobs"])

        self.assertTrue(queue.retry_or_dead_letter("analysis", {"job_id": "retry"}))
        self.assertFalse(
            queue.retry_or_dead_letter("analysis", {"job_id": "dead", "attempt": 1})
        )
        self.assertIn("analysis:dead", client.lists)

    def test_s3_adapter_scopes_keys_encrypts_and_presigns_without_paths(self) -> None:
        client = FakeS3Client()
        store = S3ObjectStoreAdapter(
            client,
            bucket="fnd-test",
            kms_key_id="kms-1",
            retention=S3RetentionConfig(retention_days=10, legal_hold=True),
        )
        tenant = TenantContext("tenant-a")

        key = store.put(tenant, "../secret/image.png", b"png", "image/png")

        self.assertEqual(key, "tenants/tenant-a/_/secret/image.png")
        self.assertEqual(client.puts[0]["ServerSideEncryption"], "aws:kms")
        self.assertEqual(client.puts[0]["SSEKMSKeyId"], "kms-1")
        self.assertEqual(client.puts[0]["Metadata"], {"retention-days": "10"})
        self.assertNotIn("C:\\", key)

        presigned = store.presign_put(tenant, "uploads/image.png", 60)
        self.assertIn("tenants/tenant-a/uploads/image.png", presigned)
        self.assertEqual(client.presigns[0]["ExpiresIn"], 60)

        store.delete(tenant, "uploads/image.png")
        self.assertEqual(
            client.deletes[0],
            {"Bucket": "fnd-test", "Key": "tenants/tenant-a/uploads/image.png"},
        )

    def test_telemetry_redacts_sensitive_fields_and_records_metrics(self) -> None:
        traces = InMemoryTraceRecorder()
        traces.record(
            "analysis",
            {
                "analysis_id": "a1",
                "text": "full article",
                "token": "secret",
                "provider_secret": "secret",
                "screenshot": b"bytes",
            },
        )

        self.assertEqual(traces.events[0]["attributes"], {"analysis_id": "a1"})

        timer = SpanTimer(traces, "model", model="modernbert")
        timer.end(status="ok")
        self.assertIn("duration_ms", traces.events[-1]["attributes"])

        metrics = InMemoryMetricsRecorder()
        metrics.gauge("fnd.queue.depth", 3, queue="analysis")
        metrics.increment("fnd.errors.count", code="VALIDATION_ERROR")
        metrics.observe("fnd.model.latency_ms", 4.2, model="modernbert")

        self.assertEqual(metrics.gauges["fnd.queue.depth{queue=analysis}"], 3)
        self.assertEqual(metrics.counters["fnd.errors.count{code=VALIDATION_ERROR}"], 1)
        self.assertEqual(
            metrics.histograms["fnd.model.latency_ms{model=modernbert}"], [4.2]
        )

    def test_readiness_reports_enterprise_components_without_requiring_them(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            model_path = root / "model"
            model_path.mkdir()
            settings = Settings(
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
            )
            workflow = FakeWorkflow()
            container = ApiContainer(
                settings=settings,
                workflow=cast(AnalyzeContentWorkflow, workflow),
                analyses=InMemoryAnalysisRepository(),
                model_registry=ModelRegistry(
                    model_path=model_path,
                    max_length=settings.max_length,
                    style_model=workflow.style_model,
                ),
            )
            client = TestClient(
                create_app(
                    container=container,
                    allowed_origins=["http://127.0.0.1:5173"],
                )
            )

            response = client.get("/v1/health/ready")

        self.assertEqual(response.status_code, 200)
        statuses = {
            item["name"]: item["status"] for item in response.json()["components"]
        }
        self.assertEqual(statuses["postgresql"], "disabled")
        self.assertEqual(statuses["redis_queue"], "disabled")
        self.assertEqual(statuses["s3_object_storage"], "disabled")
        self.assertEqual(statuses["oidc"], "disabled")
        self.assertEqual(statuses["opentelemetry"], "disabled")

    def test_migration_and_deployment_manifests_cover_enterprise_requirements(
        self,
    ) -> None:
        root = Path(__file__).resolve().parents[1]
        migration = (
            root / "infra" / "alembic" / "versions" / "0001_enterprise_schema.py"
        ).read_text(encoding="utf-8")
        self.assertIn("tenant_id text not null", migration)
        self.assertIn("audit_events", migration)
        self.assertIn("enterprise_idempotency", migration)
        self.assertIn("retention_policies", migration)
        self.assertIn("devices", migration)
        self.assertIn("user_sessions", migration)

        compose = (root / "infra" / "docker" / "compose.yaml").read_text(
            encoding="utf-8"
        )
        self.assertIn("127.0.0.1:8000:8000", compose)
        self.assertIn("redis:7-alpine", compose)
        self.assertIn("postgres:16-alpine", compose)

        required = [
            root / "infra" / "k8s" / "api-deployment.yaml",
            root / "infra" / "k8s" / "worker-deployment.yaml",
            root / "infra" / "k8s" / "web-deployment.yaml",
            root / "infra" / "k8s" / "migration-job.yaml",
            root / "infra" / "k8s" / "secret-template.yaml",
            root / "infra" / "otel" / "collector.yaml",
            root / "infra" / "otel" / "dashboard.fnd.json",
            root / "infra" / "desktop" / "signing.example.json",
            root / "infra" / "mobile" / "release.example.json",
        ]
        self.assertTrue(all(path.exists() for path in required))

    def test_native_messaging_manifest_has_no_wildcard_origin(self) -> None:
        root = Path(__file__).resolve().parents[1]
        manifest = json.loads(
            (
                root / "infra" / "native-messaging" / "fnd-host-manifest.example.json"
            ).read_text(encoding="utf-8")
        )

        self.assertNotIn("*", manifest["allowed_origins"])
        self.assertTrue(
            all(
                origin.startswith("chrome-extension://")
                for origin in manifest["allowed_origins"]
            )
        )

    def test_infra_does_not_embed_provider_secrets(self) -> None:
        root = Path(__file__).resolve().parents[1] / "infra"
        haystack = "\n".join(
            path.read_text(encoding="utf-8", errors="ignore")
            for path in root.rglob("*")
            if path.is_file()
        )

        self.assertNotIn("GEMINI_API_KEY:", haystack)
        self.assertNotIn("GOOGLE_API_KEY:", haystack)
        self.assertNotIn("sk-", haystack)


if __name__ == "__main__":
    unittest.main()
