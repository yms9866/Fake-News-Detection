"""API composition root."""

from __future__ import annotations

from pathlib import Path

from packages.backend.fnd.application.bootstrap import build_analyze_content_workflow
from packages.backend.fnd.config.settings import Settings

from .state import ApiContainer

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def build_container(settings: Settings | None = None) -> ApiContainer:
    resolved_settings = settings or Settings.from_environment(project_root=PROJECT_ROOT)
    workflow = build_analyze_content_workflow(resolved_settings)
    return ApiContainer.from_workflow(settings=resolved_settings, workflow=workflow)
