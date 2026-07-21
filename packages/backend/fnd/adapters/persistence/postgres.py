"""PostgreSQL adapter boundaries with tenant-aware SQL."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any, Protocol, cast

from packages.backend.fnd.domain.enterprise import (
    AuditEvent,
    DeviceRegistration,
    RetentionPolicy,
    TenantContext,
    UserSession,
)


class SqlConnection(Protocol):
    def execute(self, sql: str, params: tuple[object, ...]) -> None: ...

    def fetchone(
        self, sql: str, params: tuple[object, ...]
    ) -> dict[str, Any] | None: ...

    def fetchall(
        self, sql: str, params: tuple[object, ...]
    ) -> list[dict[str, Any]]: ...


@dataclass(frozen=True)
class PostgresConfig:
    dsn: str
    schema: str = "public"
    connect_timeout_seconds: int = 5


class PostgresJsonRepository:
    def __init__(self, connection: SqlConnection, table: str) -> None:
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table) is None:
            raise ValueError("PostgreSQL table name must be a simple identifier.")
        self._connection = connection
        self._table = table

    def save(
        self, tenant: TenantContext, resource_id: str, payload: dict[str, Any]
    ) -> None:
        self._connection.execute(
            f"""
            insert into {self._table} (tenant_id, resource_id, payload)
            values (%s, %s, %s)
            on conflict (tenant_id, resource_id)
            do update set payload = excluded.payload, updated_at = now()
            """,
            (tenant.tenant_id, resource_id, json.dumps(payload, separators=(",", ":"))),
        )

    def get(self, tenant: TenantContext, resource_id: str) -> dict[str, Any] | None:
        row = self._connection.fetchone(
            f"select payload from {self._table} where tenant_id = %s and resource_id = %s",
            (tenant.tenant_id, resource_id),
        )
        if row is None:
            return None
        payload = row.get("payload")
        if isinstance(payload, str):
            return dict(json.loads(payload))
        if isinstance(payload, dict):
            return dict(payload)
        if payload is None:
            return {}
        return dict(cast(dict[str, Any], payload))


class PostgresEventRepository:
    def __init__(self, connection: SqlConnection) -> None:
        self._connection = connection

    def append(
        self, tenant: TenantContext, stream_id: str, payload: dict[str, Any]
    ) -> None:
        self._connection.execute(
            "insert into enterprise_events (tenant_id, stream_id, payload) values (%s, %s, %s)",
            (tenant.tenant_id, stream_id, json.dumps(payload, separators=(",", ":"))),
        )

    def list(self, tenant: TenantContext, stream_id: str) -> list[dict[str, Any]]:
        rows = self._connection.fetchall(
            "select payload from enterprise_events where tenant_id = %s and stream_id = %s order by created_at",
            (tenant.tenant_id, stream_id),
        )
        return [
            dict(
                json.loads(row["payload"])
                if isinstance(row["payload"], str)
                else row["payload"]
            )
            for row in rows
        ]


class PostgresIdempotencyRepository:
    def __init__(self, connection: SqlConnection) -> None:
        self._connection = connection

    def get(self, tenant: TenantContext, key: str) -> str | None:
        row = self._connection.fetchone(
            "select resource_id from enterprise_idempotency where tenant_id = %s and key = %s",
            (tenant.tenant_id, key),
        )
        return str(row["resource_id"]) if row else None

    def save(self, tenant: TenantContext, key: str, resource_id: str) -> None:
        self._connection.execute(
            """
            insert into enterprise_idempotency (tenant_id, key, resource_id)
            values (%s, %s, %s)
            on conflict (tenant_id, key) do nothing
            """,
            (tenant.tenant_id, key, resource_id),
        )


class PostgresAuditRepository:
    def __init__(self, connection: SqlConnection) -> None:
        self._connection = connection

    def append(self, event: AuditEvent) -> None:
        self._connection.execute(
            """
            insert into audit_events (
                event_id, tenant_id, actor_user_id, action, resource_type,
                resource_id, metadata, timestamp
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                event.event_id,
                event.tenant_id,
                event.actor_user_id,
                event.action.value,
                event.resource_type,
                event.resource_id,
                json.dumps(event.metadata, separators=(",", ":")),
                event.timestamp,
            ),
        )

    def list_for_tenant(self, tenant: TenantContext) -> list[AuditEvent]:
        rows = self._connection.fetchall(
            """
            select event_id, tenant_id, actor_user_id, action, resource_type,
                   resource_id, metadata, timestamp
            from audit_events
            where tenant_id = %s
            order by timestamp
            """,
            (tenant.tenant_id,),
        )
        from packages.backend.fnd.domain.enterprise import AuditAction

        events: list[AuditEvent] = []
        for row in rows:
            metadata = row["metadata"]
            events.append(
                AuditEvent(
                    event_id=str(row["event_id"]),
                    tenant_id=str(row["tenant_id"]),
                    actor_user_id=str(row["actor_user_id"]),
                    action=AuditAction(str(row["action"])),
                    resource_type=str(row["resource_type"]),
                    resource_id=str(row["resource_id"]),
                    metadata=dict(
                        json.loads(metadata) if isinstance(metadata, str) else metadata
                    ),
                    timestamp=row["timestamp"],
                )
            )
        return events


class PostgresDeviceRepository:
    def __init__(self, connection: SqlConnection) -> None:
        self._connection = connection

    def save(self, device: DeviceRegistration) -> None:
        self._connection.execute(
            """
            insert into devices (
                tenant_id, device_id, user_id, client_type, registered_at, revoked_at
            )
            values (%s, %s, %s, %s, %s, %s)
            on conflict (tenant_id, device_id)
            do update set revoked_at = excluded.revoked_at
            """,
            (
                device.tenant_id,
                device.device_id,
                device.user_id,
                device.client_type,
                device.registered_at,
                device.revoked_at,
            ),
        )

    def get(self, tenant: TenantContext, device_id: str) -> DeviceRegistration | None:
        row = self._connection.fetchone(
            """
            select tenant_id, device_id, user_id, client_type, registered_at, revoked_at
            from devices
            where tenant_id = %s and device_id = %s
            """,
            (tenant.tenant_id, device_id),
        )
        if row is None:
            return None
        return DeviceRegistration(
            device_id=str(row["device_id"]),
            user_id=str(row["user_id"]),
            tenant_id=str(row["tenant_id"]),
            client_type=str(row["client_type"]),
            registered_at=row["registered_at"],
            revoked_at=row["revoked_at"],
        )


class PostgresSessionRepository:
    def __init__(self, connection: SqlConnection) -> None:
        self._connection = connection

    def save(self, session: UserSession) -> None:
        self._connection.execute(
            """
            insert into user_sessions (
                session_id, tenant_id, user_id, device_id, roles, expires_at, revoked_at
            )
            values (%s, %s, %s, %s, %s, %s, %s)
            on conflict (session_id)
            do update set revoked_at = excluded.revoked_at
            """,
            (
                session.session_id,
                session.principal.tenant_id,
                session.principal.user_id,
                session.device_id,
                json.dumps(
                    [role.value for role in session.principal.roles],
                    separators=(",", ":"),
                ),
                session.expires_at,
                session.revoked_at,
            ),
        )

    def get(self, session_id: str) -> UserSession | None:
        row = self._connection.fetchone(
            """
            select session_id, tenant_id, user_id, device_id, roles, expires_at, revoked_at
            from user_sessions
            where session_id = %s
            """,
            (session_id,),
        )
        if row is None:
            return None
        from packages.backend.fnd.domain.enterprise import Principal, Role

        raw_roles = row["roles"]
        roles = json.loads(raw_roles) if isinstance(raw_roles, str) else raw_roles
        return UserSession(
            session_id=str(row["session_id"]),
            principal=Principal(
                user_id=str(row["user_id"]),
                tenant_id=str(row["tenant_id"]),
                roles=tuple(Role(str(role)) for role in roles),
            ),
            device_id=str(row["device_id"]),
            expires_at=row["expires_at"],
            revoked_at=row["revoked_at"],
        )


class PostgresRetentionPolicyRepository:
    def __init__(self, connection: SqlConnection) -> None:
        self._connection = connection

    def save(self, policy: RetentionPolicy) -> None:
        self._connection.execute(
            """
            insert into retention_policies (
                tenant_id, analysis_retention_days, artifact_retention_days,
                audit_retention_days
            )
            values (%s, %s, %s, %s)
            on conflict (tenant_id)
            do update set
                analysis_retention_days = excluded.analysis_retention_days,
                artifact_retention_days = excluded.artifact_retention_days,
                audit_retention_days = excluded.audit_retention_days
            """,
            (
                policy.tenant_id,
                policy.analysis_retention_days,
                policy.artifact_retention_days,
                policy.audit_retention_days,
            ),
        )

    def get(self, tenant: TenantContext) -> RetentionPolicy | None:
        row = self._connection.fetchone(
            """
            select tenant_id, analysis_retention_days, artifact_retention_days,
                   audit_retention_days
            from retention_policies
            where tenant_id = %s
            """,
            (tenant.tenant_id,),
        )
        if row is None:
            return None
        return RetentionPolicy(
            tenant_id=str(row["tenant_id"]),
            analysis_retention_days=int(row["analysis_retention_days"]),
            artifact_retention_days=int(row["artifact_retention_days"]),
            audit_retention_days=int(row["audit_retention_days"]),
        )
