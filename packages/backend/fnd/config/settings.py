"""Typed runtime settings for the local fake-news analysis agent."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import re


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
    enable_external_ai: bool
    max_url_bytes: int
    request_timeout_seconds: float

    @classmethod
    def from_environment(cls, project_root: Path | None = None) -> "Settings":
        root = (project_root or PROJECT_ROOT).resolve()
        load_env_file(root / ".env")

        model_path = Path(
            os.environ.get("MODERNBERT_MODEL_PATH", "models/modernbert_fake_news_512")
        )
        if not model_path.is_absolute():
            model_path = root / model_path

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
            enable_external_ai=os.environ.get("ENABLE_EXTERNAL_AI", "true").lower()
            not in {"0", "false", "no"},
            max_url_bytes=int(os.environ.get("MAX_URL_BYTES", str(2_000_000))),
            request_timeout_seconds=float(os.environ.get("REQUEST_TIMEOUT_SECONDS", "20")),
        )
