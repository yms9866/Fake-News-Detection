"""Portable analysis, evidence, auth-token, and live-session schema.

Revision ID: 0002_portable_analysis_schema
Revises: 0001_enterprise_schema
Create Date: 2026-07-29
"""

from __future__ import annotations

revision = "0002_portable_analysis_schema"
down_revision = "0001_enterprise_schema"


POSTGRESQL_UPGRADE_SQL = """
create table if not exists analyses (
    analysis_id text primary key,
    tenant_id text not null default 'local',
    user_id text null,
    input_type text not null,
    source_url text null,
    status text not null,
    extracted_text text not null default '',
    cleaned_text text not null default '',
    style_assessment jsonb not null default '{}',
    verification jsonb null,
    final_assessment jsonb not null default '{}',
    warnings jsonb not null default '[]',
    created_at timestamptz not null default now(),
    completed_at timestamptz null,
    deleted_at timestamptz null
);

create table if not exists atomic_claims (
    claim_id text primary key,
    analysis_id text not null references analyses(analysis_id) on delete cascade,
    sequence integer not null,
    claim_text text not null,
    normalized_claim text not null,
    importance text not null,
    claim_type text not null,
    entities jsonb not null default '[]',
    verification_status text not null,
    confidence text not null,
    explanation text not null default '',
    unresolved_reason text null
);

create table if not exists search_queries (
    query_id text primary key,
    analysis_id text not null references analyses(analysis_id) on delete cascade,
    claim_id text not null,
    provider text not null,
    query text not null,
    query_type text not null,
    result_count integer not null default 0,
    status text not null,
    searched_at timestamptz not null default now()
);

create table if not exists evidence_sources (
    source_id text primary key,
    analysis_id text not null references analyses(analysis_id) on delete cascade,
    url text not null,
    canonical_url text null,
    title text not null default '',
    publisher text not null default '',
    domain text not null default '',
    source_type text not null,
    reliability text not null,
    reliability_reason text not null default '',
    fetched boolean not null default false,
    stance text not null,
    qualification_status text not null,
    rejection_reasons jsonb not null default '[]',
    relevant_passages jsonb not null default '[]',
    source_family text null,
    text_hash text null,
    retrieved_at timestamptz not null default now()
);

create table if not exists claim_source_links (
    analysis_id text not null references analyses(analysis_id) on delete cascade,
    claim_id text not null,
    source_id text not null references evidence_sources(source_id) on delete cascade,
    stance text not null,
    qualifies boolean not null default false,
    primary key (claim_id, source_id)
);

create table if not exists gemini_assessments (
    assessment_id text primary key,
    analysis_id text not null references analyses(analysis_id) on delete cascade,
    grounding_used boolean not null default false,
    assessment text null,
    confidence text not null,
    evidence_quality text not null,
    explanation text not null default '',
    claim_assessments jsonb not null default '[]',
    limitations jsonb not null default '[]',
    created_at timestamptz not null default now()
);

create table if not exists session_tokens (
    token_hash text primary key,
    session_id text not null references user_sessions(session_id) on delete cascade,
    expires_at timestamptz not null,
    revoked_at timestamptz null
);

create table if not exists live_ocr_sessions (
    session_id text primary key,
    tenant_id text not null default 'local',
    user_id text null,
    source_type text not null,
    source_id text not null,
    source_url text null,
    status text not null,
    stable_text text not null default '',
    settings jsonb not null default '{}',
    warnings jsonb not null default '[]',
    result_analysis_id text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    completed_at timestamptz null
);

create table if not exists forensic_plugin_runs (
    run_id text primary key,
    analysis_id text not null references analyses(analysis_id) on delete cascade,
    plugin_name text not null,
    signal text not null,
    confidence numeric null,
    warnings jsonb not null default '[]',
    created_at timestamptz not null default now()
);

create index if not exists analyses_tenant_created_idx on analyses (tenant_id, created_at);
create index if not exists atomic_claims_analysis_idx on atomic_claims (analysis_id, sequence);
create index if not exists evidence_sources_analysis_idx on evidence_sources (analysis_id);
create index if not exists session_tokens_session_idx on session_tokens (session_id);
"""


MYSQL_UPGRADE_SQL = """
create table if not exists analyses (
    analysis_id varchar(64) primary key,
    tenant_id varchar(128) not null default 'local',
    user_id varchar(128) null,
    input_type varchar(32) not null,
    source_url text null,
    status varchar(32) not null,
    extracted_text longtext not null,
    cleaned_text longtext not null,
    style_assessment json not null,
    verification json null,
    final_assessment json not null,
    warnings json not null,
    created_at datetime(6) not null default current_timestamp(6),
    completed_at datetime(6) null,
    deleted_at datetime(6) null
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists atomic_claims (
    claim_id varchar(64) primary key,
    analysis_id varchar(64) not null,
    sequence int not null,
    claim_text text not null,
    normalized_claim text not null,
    importance varchar(32) not null,
    claim_type varchar(64) not null,
    entities json not null,
    verification_status varchar(64) not null,
    confidence varchar(32) not null,
    explanation text not null,
    unresolved_reason text null,
    constraint atomic_claims_analysis_fk foreign key (analysis_id)
        references analyses(analysis_id) on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists search_queries (
    query_id varchar(96) primary key,
    analysis_id varchar(64) not null,
    claim_id varchar(64) not null,
    provider varchar(64) not null,
    query text not null,
    query_type varchar(64) not null,
    result_count int not null default 0,
    status varchar(32) not null,
    searched_at datetime(6) not null default current_timestamp(6),
    constraint search_queries_analysis_fk foreign key (analysis_id)
        references analyses(analysis_id) on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists evidence_sources (
    source_id varchar(64) primary key,
    analysis_id varchar(64) not null,
    url text not null,
    canonical_url text null,
    title text not null,
    publisher varchar(256) not null default '',
    domain varchar(256) not null default '',
    source_type varchar(64) not null,
    reliability varchar(32) not null,
    reliability_reason text not null,
    fetched boolean not null default false,
    stance varchar(64) not null,
    qualification_status varchar(64) not null,
    rejection_reasons json not null,
    relevant_passages json not null,
    source_family varchar(256) null,
    text_hash varchar(128) null,
    retrieved_at datetime(6) not null default current_timestamp(6),
    constraint evidence_sources_analysis_fk foreign key (analysis_id)
        references analyses(analysis_id) on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists claim_source_links (
    analysis_id varchar(64) not null,
    claim_id varchar(64) not null,
    source_id varchar(64) not null,
    stance varchar(64) not null,
    qualifies boolean not null default false,
    primary key (claim_id, source_id),
    constraint claim_source_links_source_fk foreign key (source_id)
        references evidence_sources(source_id) on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists gemini_assessments (
    assessment_id varchar(64) primary key,
    analysis_id varchar(64) not null,
    grounding_used boolean not null default false,
    assessment varchar(64) null,
    confidence varchar(32) not null,
    evidence_quality varchar(32) not null,
    explanation text not null,
    claim_assessments json not null,
    limitations json not null,
    created_at datetime(6) not null default current_timestamp(6),
    constraint gemini_assessments_analysis_fk foreign key (analysis_id)
        references analyses(analysis_id) on delete cascade
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists session_tokens (
    token_hash varchar(128) primary key,
    session_id varchar(64) not null,
    expires_at datetime(6) not null,
    revoked_at datetime(6) null
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists live_ocr_sessions (
    session_id varchar(64) primary key,
    tenant_id varchar(128) not null default 'local',
    user_id varchar(128) null,
    source_type varchar(64) not null,
    source_id varchar(512) not null,
    source_url text null,
    status varchar(64) not null,
    stable_text longtext not null,
    settings json not null,
    warnings json not null,
    result_analysis_id varchar(64) null,
    created_at datetime(6) not null default current_timestamp(6),
    updated_at datetime(6) not null default current_timestamp(6),
    completed_at datetime(6) null
) character set utf8mb4 collate utf8mb4_unicode_ci;

create table if not exists forensic_plugin_runs (
    run_id varchar(64) primary key,
    analysis_id varchar(64) not null,
    plugin_name varchar(256) not null,
    signal varchar(64) not null,
    confidence decimal(6,5) null,
    warnings json not null,
    created_at datetime(6) not null default current_timestamp(6)
) character set utf8mb4 collate utf8mb4_unicode_ci;

create index analyses_tenant_created_idx on analyses (tenant_id, created_at);
create index atomic_claims_analysis_idx on atomic_claims (analysis_id, sequence);
create index evidence_sources_analysis_idx on evidence_sources (analysis_id);
create index session_tokens_session_idx on session_tokens (session_id);
"""


POSTGRESQL_DOWNGRADE_SQL = """
drop table if exists forensic_plugin_runs;
drop table if exists live_ocr_sessions;
drop table if exists session_tokens;
drop table if exists gemini_assessments;
drop table if exists claim_source_links;
drop table if exists evidence_sources;
drop table if exists search_queries;
drop table if exists atomic_claims;
drop table if exists analyses;
"""

MYSQL_DOWNGRADE_SQL = POSTGRESQL_DOWNGRADE_SQL


def upgrade(dialect: str = "postgresql") -> str:
    if dialect.lower() in {"mysql", "mariadb"}:
        return MYSQL_UPGRADE_SQL
    return POSTGRESQL_UPGRADE_SQL


def downgrade(dialect: str = "postgresql") -> str:
    if dialect.lower() in {"mysql", "mariadb"}:
        return MYSQL_DOWNGRADE_SQL
    return POSTGRESQL_DOWNGRADE_SQL
