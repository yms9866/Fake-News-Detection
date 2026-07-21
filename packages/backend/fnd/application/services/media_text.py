"""Media extraction text cleanup helpers."""

from __future__ import annotations

from difflib import SequenceMatcher
import re

from packages.backend.fnd.domain.entities import normalize_text


def _fingerprint(text: str) -> str:
    normalized = normalize_text(text).lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return normalize_text(normalized)


def _near_duplicate(left: str, right: str, threshold: float) -> bool:
    left_fp = _fingerprint(left)
    right_fp = _fingerprint(right)
    if not left_fp or not right_fp:
        return False
    if left_fp == right_fp:
        return True
    if left_fp in right_fp or right_fp in left_fp:
        return True
    return SequenceMatcher(a=left_fp, b=right_fp).ratio() >= threshold


def deduplicate_segments(
    segments: list[str] | tuple[str, ...],
    *,
    similarity_threshold: float = 0.88,
) -> list[str]:
    """Collapse repeated media OCR/transcript segments while preserving order."""

    unique: list[str] = []
    for segment in segments:
        cleaned = normalize_text(segment)
        if not cleaned:
            continue
        if any(
            _near_duplicate(cleaned, existing, similarity_threshold)
            for existing in unique
        ):
            continue
        unique.append(cleaned)
    return unique


def merge_media_text_channels(
    *,
    transcript_segments: list[str] | tuple[str, ...] = (),
    ocr_segments: list[str] | tuple[str, ...] = (),
) -> str:
    """Prefer transcript text and add non-duplicative visual text."""

    merged = deduplicate_segments([*transcript_segments, *ocr_segments])
    return normalize_text(" ".join(merged))
