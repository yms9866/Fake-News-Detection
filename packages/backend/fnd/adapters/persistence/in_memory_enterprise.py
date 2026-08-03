"""Deterministic enterprise repositories for tests and local mode."""

from __future__ import annotations

from dataclasses import dataclass, field

from packages.backend.fnd.domain.enterprise import (
    AuditEvent,
    DeviceRegistration,
    RetentionPolicy,
    SessionToken,
    TenantContext,
    UserSession,
)


@dataclass
class InMemoryTenantJsonRepository:
    _items: dict[tuple[str, str], dict[str, object]] = field(default_factory=dict)

    def save(
        self, tenant: TenantContext, resource_id: str, payload: dict[str, object]
    ) -> None:
        self._items[(tenant.tenant_id, resource_id)] = dict(payload)

    def get(self, tenant: TenantContext, resource_id: str) -> dict[str, object] | None:
        value = self._items.get((tenant.tenant_id, resource_id))
        return dict(value) if value is not None else None


@dataclass
class InMemoryAuditRepository:
    _items: list[AuditEvent] = field(default_factory=list)

    def append(self, event: AuditEvent) -> None:
        self._items.append(event)

    def list_for_tenant(self, tenant: TenantContext) -> list[AuditEvent]:
        return [event for event in self._items if event.tenant_id == tenant.tenant_id]


@dataclass
class InMemoryDeviceRepository:
    _items: dict[tuple[str, str], DeviceRegistration] = field(default_factory=dict)

    def save(self, device: DeviceRegistration) -> None:
        self._items[(device.tenant_id, device.device_id)] = device

    def get(self, tenant: TenantContext, device_id: str) -> DeviceRegistration | None:
        return self._items.get((tenant.tenant_id, device_id))


@dataclass
class InMemorySessionRepository:
    _items: dict[str, UserSession] = field(default_factory=dict)

    def save(self, session: UserSession) -> None:
        self._items[session.session_id] = session

    def get(self, session_id: str) -> UserSession | None:
        return self._items.get(session_id)


@dataclass
class InMemorySessionTokenRepository:
    _items: dict[str, SessionToken] = field(default_factory=dict)

    def save(self, token: SessionToken) -> None:
        self._items[token.token_hash] = token

    def get(self, token_hash: str) -> SessionToken | None:
        return self._items.get(token_hash)


@dataclass
class InMemoryRetentionPolicyRepository:
    _items: dict[str, RetentionPolicy] = field(default_factory=dict)

    def save(self, policy: RetentionPolicy) -> None:
        self._items[policy.tenant_id] = policy

    def get(self, tenant: TenantContext) -> RetentionPolicy | None:
        return self._items.get(tenant.tenant_id)
