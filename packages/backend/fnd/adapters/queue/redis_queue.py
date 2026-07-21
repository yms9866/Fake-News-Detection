"""Redis queue adapter boundary with retry/dead-letter metadata."""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Protocol
from uuid import uuid4

from packages.backend.fnd.domain.enterprise import TenantContext


class RedisClient(Protocol):
    def lpush(self, name: str, value: str) -> object: ...

    def sadd(self, name: str, value: str) -> object: ...

    def hset(self, name: str, key: str, value: str) -> object: ...

    def llen(self, name: str) -> int: ...


@dataclass(frozen=True)
class RedisRetryPolicy:
    max_attempts: int = 3
    backoff_seconds: int = 30


class RedisQueueAdapter:
    def __init__(
        self,
        client: RedisClient,
        *,
        dead_letter_suffix: str = ":dead",
        retry_policy: RedisRetryPolicy | None = None,
    ) -> None:
        self._client = client
        self._dead_letter_suffix = dead_letter_suffix
        self._retry_policy = retry_policy or RedisRetryPolicy()

    def enqueue(
        self, tenant: TenantContext, queue_name: str, payload: dict[str, object]
    ) -> str:
        job_id = str(uuid4())
        message = {
            "job_id": job_id,
            "tenant_id": tenant.tenant_id,
            "payload": payload,
            "attempt": 0,
            "max_attempts": self._retry_policy.max_attempts,
        }
        self._client.lpush(queue_name, json.dumps(message, separators=(",", ":")))
        return job_id

    def cancel(self, job_id: str) -> bool:
        self._client.sadd("cancelled-jobs", job_id)
        return True

    def record_progress(self, job_id: str, progress: int, status: str) -> None:
        self._client.hset(
            "job-progress",
            job_id,
            json.dumps(
                {"progress": max(0, min(100, progress)), "status": status},
                separators=(",", ":"),
            ),
        )

    def retry_or_dead_letter(self, queue_name: str, message: dict[str, object]) -> bool:
        raw_attempt = message.get("attempt", 0)
        attempt = raw_attempt if isinstance(raw_attempt, int) else int(str(raw_attempt))
        attempt += 1
        message = {**message, "attempt": attempt}
        if attempt >= self._retry_policy.max_attempts:
            self.dead_letter(queue_name, message)
            return False
        self._client.lpush(queue_name, json.dumps(message, separators=(",", ":")))
        return True

    def dead_letter(self, queue_name: str, message: dict[str, object]) -> None:
        self._client.lpush(
            f"{queue_name}{self._dead_letter_suffix}",
            json.dumps(message, separators=(",", ":")),
        )

    def queue_depth(self, queue_name: str) -> int:
        return int(self._client.llen(queue_name))
