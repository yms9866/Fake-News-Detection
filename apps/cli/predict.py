"""Thin command-line adapter for analyze-content workflow."""

from __future__ import annotations

import argparse
from pathlib import Path

from apps.cli.reporting import print_analysis_report
from packages.backend.fnd.application.bootstrap import build_analyze_content_workflow
from packages.backend.fnd.config.settings import Settings
from packages.backend.fnd.domain.entities import AnalyzeContentCommand
from packages.backend.fnd.domain.errors import FndError


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _resolve_path(path: Path, base: Path = PROJECT_ROOT) -> Path:
    return path if path.is_absolute() else base / path


def parse_args(settings: Settings) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Predict fake-news risk using a local Transformer style/risk model "
            "and evidence verification workflow."
        )
    )

    parser.add_argument("--model", type=Path, default=settings.modernbert_model_path)
    parser.add_argument("--text", type=str, default=None)
    parser.add_argument("--url", type=str, default=None)
    parser.add_argument("--file", type=Path, default=None)
    parser.add_argument("--deep-check", action="store_true")
    parser.add_argument("--gemini-model", type=str, default=settings.gemini_model)
    parser.add_argument("--max-search-results", type=int, default=settings.max_search_results)
    parser.add_argument("--max-length", type=int, default=settings.max_length)

    return parser.parse_args()


def command_from_args(args: argparse.Namespace) -> AnalyzeContentCommand:
    file_path = _resolve_path(args.file, base=Path.cwd()) if args.file else None
    model_path = _resolve_path(args.model, base=PROJECT_ROOT)

    return AnalyzeContentCommand(
        text=args.text,
        url=args.url,
        file_path=file_path,
        deep_check=args.deep_check,
        model_path=model_path,
        gemini_model=args.gemini_model,
        max_search_results=args.max_search_results,
        max_length=args.max_length,
    )


def main() -> None:
    settings = Settings.from_environment(project_root=PROJECT_ROOT)
    args = parse_args(settings)

    model_path = _resolve_path(args.model, base=PROJECT_ROOT)
    settings = Settings(
        environment=settings.environment,
        project_root=settings.project_root,
        modernbert_model_path=model_path,
        gemini_model=args.gemini_model,
        gemini_api_key=settings.gemini_api_key,
        max_search_results=args.max_search_results,
        max_length=args.max_length,
        enable_external_ai=settings.enable_external_ai,
        max_url_bytes=settings.max_url_bytes,
        request_timeout_seconds=settings.request_timeout_seconds,
    )

    workflow = build_analyze_content_workflow(settings)

    try:
        result = workflow.analyze(command_from_args(args))
    except FndError as exc:
        raise SystemExit(f"[ERROR] {exc}") from exc

    print_analysis_report(result, deep_check=args.deep_check)


if __name__ == "__main__":
    main()
