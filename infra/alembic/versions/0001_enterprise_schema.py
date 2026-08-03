"""Enterprise schema baseline.

Revision ID: 0001_enterprise_schema
Revises:
Create Date: 2026-07-22
"""

revision = "0001_enterprise_schema"
down_revision = None

UPGRADE_SQL = """
create table if not exists enterprise_json (
    tenant_id text not null,
    resource_id text not null,
    payload jsonb not null,
    updated_at timestamptz not null default now(),
    primary key (tenant_id, resource_id)
);

create table if not exists enterprise_events (
    tenant_id text not null,
    stream_id text not null,
    payload jsonb not null,
    created_at timestamptz not null default now()
);

create table if not exists enterprise_idempotency (
    tenant_id text not null,
    key text not null,
    resource_id text not null,
    created_at timestamptz not null default now(),
    primary key (tenant_id, key)
);

create table if not exists audit_events (
    event_id text primary key,
    tenant_id text not null,
    actor_user_id text not null,
    action text not null,
    resource_type text not null,
    resource_id text not null,
    metadata jsonb not null default '{}',
    timestamp timestamptz not null default now()
);

create table if not exists devices (
    tenant_id text not null,
    device_id text not null,
    user_id text not null,
    client_type text not null,
    registered_at timestamptz not null default now(),
    revoked_at timestamptz null,
    primary key (tenant_id, device_id)
);

create table if not exists user_sessions (
    session_id text primary key,
    tenant_id text not null,
    user_id text not null,
    device_id text not null,
    roles jsonb not null default '["user"]',
    expires_at timestamptz not null,
    revoked_at timestamptz null
);

create table if not exists retention_policies (
    tenant_id text primary key,
    analysis_retention_days integer not null default 90,
    artifact_retention_days integer not null default 7,
    audit_retention_days integer not null default 365
);

create index if not exists enterprise_events_tenant_stream_idx
    on enterprise_events (tenant_id, stream_id, created_at);

create index if not exists audit_events_tenant_timestamp_idx
    on audit_events (tenant_id, timestamp);
"""

MYSQL_UPGRADE_SQL = """
create table if not exists enterprise_json (
    tenant_id varchar(128) not null,
    resource_id varchar(128) not null,
    payload json not null,
    updated_at datetime(6) not null default current_timestamp(6),
    primary key (tenant_id, resource_id)
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists enterprise_events (
    tenant_id varchar(128) not null,
    stream_id varchar(128) not null,
    payload json not null,
    created_at datetime(6) not null default current_timestamp(6)
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists enterprise_idempotency (
    tenant_id varchar(128) not null,
    `key` varchar(192) not null,
    resource_id varchar(128) not null,
    created_at datetime(6) not null default current_timestamp(6),
    primary key (tenant_id, `key`)
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists audit_events (
    event_id varchar(128) primary key,
    tenant_id varchar(128) not null,
    actor_user_id varchar(128) not null,
    action varchar(128) not null,
    resource_type varchar(128) not null,
    resource_id varchar(128) not null,
    metadata json not null,
    timestamp datetime(6) not null default current_timestamp(6)
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists devices (
    tenant_id varchar(128) not null,
    device_id varchar(128) not null,
    user_id varchar(128) not null,
    client_type varchar(64) not null,
    registered_at datetime(6) not null default current_timestamp(6),
    revoked_at datetime(6) null,
    primary key (tenant_id, device_id)
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists user_sessions (
    session_id varchar(128) primary key,
    tenant_id varchar(128) not null,
    user_id varchar(128) not null,
    device_id varchar(128) not null,
    roles json not null,
    expires_at datetime(6) not null,
    revoked_at datetime(6) null
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists retention_policies (
    tenant_id varchar(128) primary key,
    analysis_retention_days integer not null default 90,
    artifact_retention_days integer not null default 7,
    audit_retention_days integer not null default 365
) character set utf8mb4 collate utf8mb4_unicode_ci;

create index enterprise_events_tenant_stream_idx
    on enterprise_events (tenant_id, stream_id, created_at);

create index audit_events_tenant_timestamp_idx
    on audit_events (tenant_id, timestamp);
"""

DOWNGRADE_SQL = """
drop table if exists retention_policies;
drop table if exists user_sessions;
drop table if exists devices;
drop table if exists audit_events;
drop table if exists enterprise_idempotency;
drop table if exists enterprise_events;
drop table if exists enterprise_json;
"""


def upgrade(dialect: str = "postgresql") -> str:
    if dialect.lower() in {"mysql", "mariadb"}:
        return MYSQL_UPGRADE_SQL
    return UPGRADE_SQL


def downgrade() -> str:
    return DOWNGRADE_SQL
