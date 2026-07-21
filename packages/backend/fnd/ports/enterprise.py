"""Ports for enterprise persistence, queues, storage, auth, audit, and telemetry."""

from __future__ import annotations

from typing import Any, Protocol

from packages.backend.fnd.domain.enterprise import (
    AuditEvent,
    DeviceRegistration,
    RetentionPolicy,
    TenantContext,
    UserSession,
)


class TenantScopedAnalysisRepository(Protocol):
    def save(
        self, tenant: TenantContext, analysis_id: str, payload: dict[str, Any]
    ) -> None: ...

    def get(self, tenant: TenantContext, analysis_id: str) -> dict[str, Any] | None: ...


class EnterpriseJobRepository(Protocol):
    def save(
        self, tenant: TenantContext, job_id: str, payload: dict[str, Any]
    ) -> None: ...

    def get(self, tenant: TenantContext, job_id: str) -> dict[str, Any] | None: ...


class EnterpriseEventRepository(Protocol):
    def append(
        self, tenant: TenantContext, stream_id: str, payload: dict[str, Any]
    ) -> None: ...

    def list(self, tenant: TenantContext, stream_id: str) -> list[dict[str, Any]]: ...


class EnterpriseIdempotencyRepository(Protocol):
    def get(self, tenant: TenantContext, key: str) -> str | None: ...

    def save(self, tenant: TenantContext, key: str, resource_id: str) -> None: ...


class AuditRepository(Protocol):
    def append(self, event: AuditEvent) -> None: ...

    def list_for_tenant(self, tenant: TenantContext) -> list[AuditEvent]: ...


class DeviceRepository(Protocol):
    def save(self, device: DeviceRegistration) -> None: ...

    def get(
        self, tenant: TenantContext, device_id: str
    ) -> DeviceRegistration | None: ...


class SessionRepository(Protocol):
    def save(self, session: UserSession) -> None: ...

    def get(self, session_id: str) -> UserSession | None: ...


class RetentionPolicyRepository(Protocol):
    def save(self, policy: RetentionPolicy) -> None: ...

    def get(self, tenant: TenantContext) -> RetentionPolicy | None: ...


class DurableQueue(Protocol):
    def enqueue(
        self, tenant: TenantContext, queue_name: str, payload: dict[str, Any]
    ) -> str: ...

    def cancel(self, job_id: str) -> bool: ...

    def queue_depth(self, queue_name: str) -> int: ...


class ObjectStore(Protocol):
    def put(
        self, tenant: TenantContext, key: str, content: bytes, content_type: str
    ) -> str: ...

    def delete(self, tenant: TenantContext, key: str) -> None: ...

    def presign_put(
        self, tenant: TenantContext, key: str, expires_seconds: int
    ) -> str: ...


class TraceRecorder(Protocol):
    def record(self, name: str, attributes: dict[str, Any]) -> None: ...
