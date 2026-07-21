"""S3-compatible object storage adapter boundary."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from packages.backend.fnd.domain.enterprise import TenantContext


class S3Client(Protocol):
    def put_object(self, **kwargs: Any) -> object: ...

    def delete_object(self, **kwargs: Any) -> object: ...

    def generate_presigned_url(
        self,
        client_method: str,
        *,
        Params: dict[str, object],
        ExpiresIn: int,
    ) -> str: ...


@dataclass(frozen=True)
class S3RetentionConfig:
    retention_days: int = 7
    legal_hold: bool = False


class S3ObjectStoreAdapter:
    def __init__(
        self,
        client: S3Client,
        *,
        bucket: str,
        kms_key_id: str | None = None,
        retention: S3RetentionConfig | None = None,
    ) -> None:
        self._client = client
        self._bucket = bucket
        self._kms_key_id = kms_key_id
        self._retention = retention or S3RetentionConfig()

    def _tenant_key(self, tenant: TenantContext, key: str) -> str:
        safe_key = key.strip("/").replace("\\", "/").replace("..", "_")
        safe_key = "/".join(
            part for part in safe_key.split("/") if part and part != "."
        )
        if not safe_key:
            raise ValueError("Object key must not be blank.")
        return f"tenants/{tenant.tenant_id}/{safe_key}"

    def put(
        self, tenant: TenantContext, key: str, content: bytes, content_type: str
    ) -> str:
        object_key = self._tenant_key(tenant, key)
        args = {
            "Bucket": self._bucket,
            "Key": object_key,
            "Body": content,
            "ContentType": content_type,
            "Metadata": {"retention-days": str(self._retention.retention_days)},
        }
        if self._kms_key_id:
            args["ServerSideEncryption"] = "aws:kms"
            args["SSEKMSKeyId"] = self._kms_key_id
        if self._retention.legal_hold:
            args["ObjectLockLegalHoldStatus"] = "ON"
        self._client.put_object(**args)
        return object_key

    def delete(self, tenant: TenantContext, key: str) -> None:
        self._client.delete_object(
            Bucket=self._bucket, Key=self._tenant_key(tenant, key)
        )

    def presign_put(self, tenant: TenantContext, key: str, expires_seconds: int) -> str:
        return str(
            self._client.generate_presigned_url(
                "put_object",
                Params={"Bucket": self._bucket, "Key": self._tenant_key(tenant, key)},
                ExpiresIn=expires_seconds,
            )
        )
