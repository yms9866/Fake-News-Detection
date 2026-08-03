"""Portable DB-API persistence helpers for PostgreSQL/MySQL selected mode.

The application still uses in-memory repositories by default. These classes
provide a small typed boundary for durable deployments without leaking dialect
details into domain/application code.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Protocol

from packages.backend.fnd.domain.enterprise import SessionToken


class DbApiCursor(Protocol):
    def execute(self, sql: str, params: tuple[object, ...]) -> object: ...

    def fetchone(self) -> dict[str, Any] | tuple[Any, ...] | None: ...


class DbApiConnection(Protocol):
    def cursor(self) -> DbApiCursor: ...

    def commit(self) -> None: ...

    def rollback(self) -> None: ...


@dataclass(frozen=True)
class PortableSqlDialect:
    name: str

    @property
    def placeholder(self) -> str:
        return "%s" if self.name in {"postgresql", "mysql", "mariadb"} else "?"

    @property
    def upsert_analysis_sql(self) -> str:
        if self.name in {"mysql", "mariadb"}:
            return """
            insert into analyses (
                analysis_id, tenant_id, user_id, input_type, source_url, status,
                extracted_text, cleaned_text, style_assessment, verification,
                final_assessment, warnings, created_at, completed_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on duplicate key update
                status = values(status),
                cleaned_text = values(cleaned_text),
                style_assessment = values(style_assessment),
                verification = values(verification),
                final_assessment = values(final_assessment),
                warnings = values(warnings),
                completed_at = values(completed_at)
            """
        return """
        insert into analyses (
            analysis_id, tenant_id, user_id, input_type, source_url, status,
            extracted_text, cleaned_text, style_assessment, verification,
            final_assessment, warnings, created_at, completed_at
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (analysis_id) do update set
            status = excluded.status,
            cleaned_text = excluded.cleaned_text,
            style_assessment = excluded.style_assessment,
            verification = excluded.verification,
            final_assessment = excluded.final_assessment,
            warnings = excluded.warnings,
            completed_at = excluded.completed_at
        """


class PortableAnalysisRepository:
    def __init__(
        self, connection: DbApiConnection, dialect: PortableSqlDialect
    ) -> None:
        self._connection = connection
        self._dialect = dialect

    def save_response(
        self,
        *,
        tenant_id: str,
        user_id: str | None,
        response: Any,
    ) -> None:
        params = (
            response.analysis_id,
            tenant_id,
            user_id,
            response.input_type,
            response.source_url,
            response.status,
            response.extracted_text,
            response.cleaned_text,
            response.style_assessment.model_dump_json(),
            response.verification.model_dump_json() if response.verification else None,
            response.final_assessment.model_dump_json(),
            json.dumps(response.warnings, separators=(",", ":")),
            response.created_at,
            response.completed_at,
        )
        cursor = self._connection.cursor()
        try:
            cursor.execute(self._dialect.upsert_analysis_sql, params)
            self._connection.commit()
        except Exception:
            self._connection.rollback()
            raise


class PortableSessionTokenRepository:
    def __init__(
        self, connection: DbApiConnection, dialect: PortableSqlDialect
    ) -> None:
        self._connection = connection
        self._dialect = dialect

    def save(self, token: SessionToken) -> None:
        sql = (
            """
            insert into session_tokens (token_hash, session_id, expires_at, revoked_at)
            values (%s, %s, %s, %s)
            on duplicate key update revoked_at = values(revoked_at), expires_at = values(expires_at)
            """
            if self._dialect.name in {"mysql", "mariadb"}
            else """
            insert into session_tokens (token_hash, session_id, expires_at, revoked_at)
            values (%s, %s, %s, %s)
            on conflict (token_hash) do update set
                revoked_at = excluded.revoked_at,
                expires_at = excluded.expires_at
            """
        )
        cursor = self._connection.cursor()
        try:
            cursor.execute(
                sql,
                (
                    token.token_hash,
                    token.session_id,
                    token.expires_at,
                    token.revoked_at,
                ),
            )
            self._connection.commit()
        except Exception:
            self._connection.rollback()
            raise

    def get(self, token_hash: str) -> SessionToken | None:
        cursor = self._connection.cursor()
        cursor.execute(
            """
            select token_hash, session_id, expires_at, revoked_at
            from session_tokens
            where token_hash = %s
            """,
            (token_hash,),
        )
        row = cursor.fetchone()
        if row is None:
            return None
        if isinstance(row, dict):
            return SessionToken(
                token_hash=str(row["token_hash"]),
                session_id=str(row["session_id"]),
                expires_at=row["expires_at"],
                revoked_at=row["revoked_at"],
            )
        return SessionToken(
            token_hash=str(row[0]),
            session_id=str(row[1]),
            expires_at=row[2],
            revoked_at=row[3],
        )
