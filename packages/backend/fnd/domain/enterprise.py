"""Enterprise hardening domain entities and policies."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any
from uuid import uuid4

from packages.backend.fnd.domain.entities import utc_now


class Role(str, Enum):
    USER = "user"
    REVIEWER = "reviewer"
    TEAM_ADMIN = "team_admin"
    ORGANIZATION_ADMIN = "organization_admin"
    SYSTEM_ADMIN = "system_admin"


class AuditAction(str, Enum):
    LOGIN = "login"
    LOGOUT = "logout"
    DEVICE_REGISTERED = "device_registered"
    ANALYSIS_CREATED = "analysis_created"
    REPORT_ACCESSED = "report_accessed"
    DELETION = "deletion"
    RETENTION_CHANGED = "retention_changed"
    ADMIN_CHANGED = "admin_changed"
    EXPORT_SHARED = "export_shared"
    SECURITY_FAILURE = "security_failure"


@dataclass(frozen=True)
class TenantContext:
    tenant_id: str

    def require_same_tenant(self, other_tenant_id: str) -> None:
        if self.tenant_id != other_tenant_id:
            raise PermissionError("Tenant isolation violation.")


@dataclass(frozen=True)
class Principal:
    user_id: str
    tenant_id: str
    roles: tuple[Role, ...] = (Role.USER,)

    def has_role(self, role: Role) -> bool:
        if Role.SYSTEM_ADMIN in self.roles:
            return True
        return role in self.roles


@dataclass(frozen=True)
class DeviceRegistration:
    device_id: str
    user_id: str
    tenant_id: str
    client_type: str
    registered_at: datetime = field(default_factory=utc_now)
    revoked_at: datetime | None = None

    @property
    def revoked(self) -> bool:
        return self.revoked_at is not None


@dataclass(frozen=True)
class UserSession:
    session_id: str
    principal: Principal
    device_id: str
    expires_at: datetime
    revoked_at: datetime | None = None

    @property
    def active(self) -> bool:
        return self.revoked_at is None and self.expires_at > utc_now()


@dataclass(frozen=True)
class AuditEvent:
    event_id: str
    tenant_id: str
    actor_user_id: str
    action: AuditAction
    resource_type: str
    resource_id: str
    timestamp: datetime = field(default_factory=utc_now)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RetentionPolicy:
    tenant_id: str
    analysis_retention_days: int = 90
    artifact_retention_days: int = 7
    audit_retention_days: int = 365


@dataclass(frozen=True)
class RateLimitDecision:
    allowed: bool
    limit: int
    remaining: int
    reset_at: datetime


def require_role(principal: Principal, role: Role) -> None:
    if not principal.has_role(role):
        raise PermissionError(f"Role {role.value} is required.")


def new_session(
    *,
    principal: Principal,
    device_id: str,
    lifetime: timedelta = timedelta(hours=8),
) -> UserSession:
    return UserSession(
        session_id=str(uuid4()),
        principal=principal,
        device_id=device_id,
        expires_at=utc_now() + lifetime,
    )
