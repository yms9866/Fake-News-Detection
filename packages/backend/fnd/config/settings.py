"""Typed runtime settings for the local fake-news analysis agent."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import re
import tempfile

PROJECT_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"


def load_env_file(path: Path = DEFAULT_ENV_FILE) -> None:
    """Load a small dotenv-style file without overriding real environment variables."""

    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


@dataclass(frozen=True)
class Settings:
    """Local-first settings used by Slice 1 adapters."""

    environment: str
    project_root: Path
    modernbert_model_path: Path
    gemini_model: str
    gemini_api_key: str | None
    max_search_results: int
    max_length: int
    high_style_risk_threshold: float
    enable_external_ai: bool
    max_url_bytes: int
    request_timeout_seconds: float
    media_upload_directory: Path = Path(tempfile.gettempdir()) / "fnd-media" / "uploads"
    media_temp_directory: Path = Path(tempfile.gettempdir()) / "fnd-media" / "work"
    max_image_size_mb: int = 10
    max_audio_size_mb: int = 50
    max_video_size_mb: int = 200
    max_audio_duration_seconds: int = 600
    max_video_duration_seconds: int = 900
    max_sampled_video_frames: int = 24
    video_scene_change_threshold: float = 0.30
    ffmpeg_executable: str = "ffmpeg"
    ffprobe_executable: str = "ffprobe"
    whisper_model_size: str = "base"
    media_worker_concurrency: int = 1
    retain_uploaded_artifacts: bool = False
    retain_failed_artifacts: bool = False
    job_event_retention_limit: int = 500
    database_url: str | None = None
    redis_url: str | None = None
    s3_bucket: str | None = None
    s3_kms_key_id: str | None = None
    oidc_issuer: str | None = None
    oidc_client_id: str | None = None
    otel_endpoint: str | None = None
    enterprise_mode: bool = False
    enable_forensic_plugins: bool = True
    forensic_plugin_timeout_seconds: float = 2.0
    forensic_plugin_concurrency: int = 2

    @classmethod
    def from_environment(cls, project_root: Path | None = None) -> "Settings":
        root = (project_root or PROJECT_ROOT).resolve()
        load_env_file(root / ".env")

        model_path = Path(
            os.environ.get("MODERNBERT_MODEL_PATH", "models/modernbert_fake_news_512")
        )
        if not model_path.is_absolute():
            model_path = root / model_path

        temp_root = Path(tempfile.gettempdir()) / "fnd-media"
        upload_directory = Path(
            os.environ.get("MEDIA_UPLOAD_DIRECTORY", str(temp_root / "uploads"))
        )
        temp_directory = Path(
            os.environ.get("MEDIA_TEMP_DIRECTORY", str(temp_root / "work"))
        )

        return cls(
            environment=os.environ.get("APP_ENV", "development"),
            project_root=root,
            modernbert_model_path=model_path,
            gemini_model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
            gemini_api_key=os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
            or None,
            max_search_results=int(os.environ.get("MAX_SEARCH_RESULTS", "6")),
            max_length=int(os.environ.get("MAX_LENGTH", "1024")),
            high_style_risk_threshold=float(
                os.environ.get("HIGH_STYLE_RISK_THRESHOLD", "0.80")
            ),
            enable_external_ai=os.environ.get("ENABLE_EXTERNAL_AI", "true").lower()
            not in {"0", "false", "no"},
            max_url_bytes=int(os.environ.get("MAX_URL_BYTES", str(2_000_000))),
            request_timeout_seconds=float(
                os.environ.get("REQUEST_TIMEOUT_SECONDS", "20")
            ),
            media_upload_directory=upload_directory.resolve(),
            media_temp_directory=temp_directory.resolve(),
            max_image_size_mb=int(os.environ.get("MAX_IMAGE_SIZE_MB", "10")),
            max_audio_size_mb=int(os.environ.get("MAX_AUDIO_SIZE_MB", "50")),
            max_video_size_mb=int(os.environ.get("MAX_VIDEO_SIZE_MB", "200")),
            max_audio_duration_seconds=int(
                os.environ.get("MAX_AUDIO_DURATION_SECONDS", "600")
            ),
            max_video_duration_seconds=int(
                os.environ.get("MAX_VIDEO_DURATION_SECONDS", "900")
            ),
            max_sampled_video_frames=int(
                os.environ.get("MAX_SAMPLED_VIDEO_FRAMES", "24")
            ),
            video_scene_change_threshold=float(
                os.environ.get("VIDEO_SCENE_CHANGE_THRESHOLD", "0.30")
            ),
            ffmpeg_executable=os.environ.get("FFMPEG_EXECUTABLE", "ffmpeg"),
            ffprobe_executable=os.environ.get("FFPROBE_EXECUTABLE", "ffprobe"),
            whisper_model_size=os.environ.get("WHISPER_MODEL_SIZE", "base"),
            media_worker_concurrency=int(
                os.environ.get("MEDIA_WORKER_CONCURRENCY", "1")
            ),
            retain_uploaded_artifacts=os.environ.get(
                "RETAIN_UPLOADED_ARTIFACTS", "false"
            ).lower()
            in {"1", "true", "yes"},
            retain_failed_artifacts=os.environ.get(
                "RETAIN_FAILED_ARTIFACTS", "false"
            ).lower()
            in {"1", "true", "yes"},
            job_event_retention_limit=int(
                os.environ.get("JOB_EVENT_RETENTION_LIMIT", "500")
            ),
            database_url=os.environ.get("DATABASE_URL") or None,
            redis_url=os.environ.get("REDIS_URL") or None,
            s3_bucket=os.environ.get("S3_BUCKET") or None,
            s3_kms_key_id=os.environ.get("S3_KMS_KEY_ID") or None,
            oidc_issuer=os.environ.get("OIDC_ISSUER") or None,
            oidc_client_id=os.environ.get("OIDC_CLIENT_ID") or None,
            otel_endpoint=os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or None,
            enterprise_mode=os.environ.get("ENTERPRISE_MODE", "false").lower()
            in {"1", "true", "yes"},
            enable_forensic_plugins=os.environ.get(
                "ENABLE_FORENSIC_PLUGINS", "true"
            ).lower()
            not in {"0", "false", "no"},
            forensic_plugin_timeout_seconds=float(
                os.environ.get("FORENSIC_PLUGIN_TIMEOUT_SECONDS", "2.0")
            ),
            forensic_plugin_concurrency=int(
                os.environ.get("FORENSIC_PLUGIN_CONCURRENCY", "2")
            ),
        )
