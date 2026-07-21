"""Media metadata probing adapters."""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
from typing import Any

from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.enums import MediaType
from packages.backend.fnd.domain.errors import MediaValidationError
from packages.backend.fnd.domain.media import MediaMetadata, StoredArtifact


class LocalMediaProbe:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def capabilities(self) -> dict[str, object]:
        return {
            "ffmpeg": {
                "available": shutil.which(self._settings.ffmpeg_executable) is not None,
                "path": shutil.which(self._settings.ffmpeg_executable)
                or self._settings.ffmpeg_executable,
            },
            "ffprobe": {
                "available": shutil.which(self._settings.ffprobe_executable)
                is not None,
                "path": shutil.which(self._settings.ffprobe_executable)
                or self._settings.ffprobe_executable,
            },
            "image": {
                "available": importlib.util.find_spec("PIL") is not None,
                "provider": "pillow",
            },
        }

    def probe(self, artifact: StoredArtifact) -> MediaMetadata:
        if artifact.media_type == MediaType.IMAGE:
            return self._probe_image(artifact)
        return self._probe_with_ffprobe(artifact)

    def _probe_image(self, artifact: StoredArtifact) -> MediaMetadata:
        try:
            from PIL import Image, ImageOps

            with Image.open(artifact.path) as image:
                oriented = ImageOps.exif_transpose(image)
                width, height = oriented.size
                image_format = oriented.format or artifact.mime_type.split("/")[-1]
        except Exception as exc:
            raise MediaValidationError(
                "Image could not be decoded.",
                code="IMAGE_DECODE_FAILED",
            ) from exc

        return MediaMetadata(
            media_type=artifact.media_type,
            mime_type=artifact.mime_type,
            size_bytes=artifact.size_bytes,
            sha256=artifact.sha256,
            details={
                "width": width,
                "height": height,
                "format": image_format,
            },
        )

    def _probe_with_ffprobe(self, artifact: StoredArtifact) -> MediaMetadata:
        executable = shutil.which(self._settings.ffprobe_executable)
        if executable is None:
            raise MediaValidationError(
                "FFprobe is unavailable for media metadata probing.",
                code="FFPROBE_UNAVAILABLE",
            )

        try:
            completed = subprocess.run(
                [
                    executable,
                    "-v",
                    "error",
                    "-show_format",
                    "-show_streams",
                    "-print_format",
                    "json",
                    str(artifact.path),
                ],
                capture_output=True,
                check=False,
                text=True,
                timeout=self._settings.request_timeout_seconds,
            )
        except FileNotFoundError as exc:
            raise MediaValidationError(
                "FFprobe is unavailable for media metadata probing.",
                code="FFPROBE_UNAVAILABLE",
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise MediaValidationError(
                "Media metadata probing timed out.",
                code="MEDIA_CORRUPTED",
            ) from exc

        if completed.returncode != 0:
            raise MediaValidationError(
                "Media metadata probing failed.",
                code="MEDIA_CORRUPTED",
            )

        try:
            payload = json.loads(completed.stdout or "{}")
        except json.JSONDecodeError as exc:
            raise MediaValidationError(
                "Media metadata response was invalid.",
                code="MEDIA_CORRUPTED",
            ) from exc

        details = self._metadata_details(artifact.media_type, payload)
        return MediaMetadata(
            media_type=artifact.media_type,
            mime_type=artifact.mime_type,
            size_bytes=artifact.size_bytes,
            sha256=artifact.sha256,
            details=details,
        )

    def _metadata_details(
        self,
        media_type: MediaType,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        details: dict[str, Any] = {}
        format_info = payload.get("format", {})
        duration = format_info.get("duration")
        if duration is not None:
            try:
                details["duration_seconds"] = round(float(duration), 3)
            except ValueError:
                pass

        streams = payload.get("streams", [])
        if media_type == MediaType.VIDEO:
            video_stream: dict[str, Any] = next(
                (stream for stream in streams if stream.get("codec_type") == "video"),
                {},
            )
            if video_stream:
                details["width"] = int(video_stream.get("width", 0) or 0)
                details["height"] = int(video_stream.get("height", 0) or 0)
                details["frame_rate"] = self._parse_frame_rate(
                    str(video_stream.get("avg_frame_rate") or "")
                )
        return details

    def _parse_frame_rate(self, value: str) -> float | None:
        if "/" in value:
            numerator, denominator = value.split("/", 1)
            try:
                denominator_value = float(denominator)
                if denominator_value == 0:
                    return None
                return round(float(numerator) / denominator_value, 3)
            except ValueError:
                return None
        try:
            return round(float(value), 3)
        except ValueError:
            return None
