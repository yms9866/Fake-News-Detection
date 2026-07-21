"""Temporary local artifact storage."""

from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
from pathlib import Path
import re
from threading import Lock
from uuid import uuid4

from packages.backend.fnd.domain.enums import MediaType
from packages.backend.fnd.domain.errors import FndError
from packages.backend.fnd.domain.media import StoredArtifact


def _sanitize_filename(filename: str) -> str:
    name = Path(filename or "upload").name
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    return sanitized or "upload"


def _extension_for_mime(mime_type: str) -> str:
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
        "image/tiff": ".tiff",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/flac": ".flac",
        "audio/ogg": ".ogg",
        "audio/webm": ".webm",
        "video/mp4": ".mp4",
        "video/quicktime": ".mov",
        "video/x-matroska": ".mkv",
        "video/webm": ".webm",
    }
    return mapping.get(mime_type.split(";", 1)[0].strip().lower(), ".bin")


@dataclass
class TemporaryLocalArtifactStore:
    upload_directory: Path
    _items: dict[str, StoredArtifact] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def __post_init__(self) -> None:
        self.upload_directory.mkdir(parents=True, exist_ok=True)

    def save(
        self,
        *,
        media_type: MediaType,
        content: bytes,
        original_filename: str,
        mime_type: str,
    ) -> StoredArtifact:
        artifact_id = str(uuid4())
        extension = _extension_for_mime(mime_type)
        path = (self.upload_directory / f"{artifact_id}{extension}").resolve()
        upload_root = self.upload_directory.resolve()
        if upload_root not in path.parents and path != upload_root:
            raise FndError(
                "Temporary storage path escaped upload directory.",
                code="TEMPORARY_STORAGE_FAILED",
            )

        try:
            path.write_bytes(content)
        except OSError as exc:
            raise FndError(
                "Could not store uploaded artifact.",
                code="TEMPORARY_STORAGE_FAILED",
            ) from exc

        artifact = StoredArtifact(
            artifact_id=artifact_id,
            media_type=media_type,
            path=path,
            original_filename=original_filename,
            sanitized_filename=_sanitize_filename(original_filename),
            mime_type=mime_type.split(";", 1)[0].strip().lower(),
            size_bytes=len(content),
            sha256=hashlib.sha256(content).hexdigest(),
        )
        with self._lock:
            self._items[artifact_id] = artifact
        return artifact

    def get(self, artifact_id: str) -> StoredArtifact | None:
        with self._lock:
            return self._items.get(artifact_id)

    def delete(self, artifact_id: str) -> None:
        with self._lock:
            artifact = self._items.pop(artifact_id, None)
        if artifact is None:
            return
        try:
            artifact.path.unlink(missing_ok=True)
        except OSError:
            return
