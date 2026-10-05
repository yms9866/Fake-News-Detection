#!/usr/bin/env python3
"""Filter a CSV to rows with more than 30 words (eval length buckets 1-10 and 11-30 removed)."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def combine_text(row: pd.Series, text_column: str, title_column: str | None) -> str:
    body = str(row[text_column] if pd.notna(row[text_column]) else "").strip()
    if title_column and title_column in row.index:
        title = str(row[title_column] if pd.notna(row[title_column]) else "").strip()
        if title and body:
            return f"{title}\n\n{body}".strip()
        return title or body
    return body


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Filter CSV rows to word_count > 30.")
    parser.add_argument("--input", type=Path, required=True, help="Source CSV path.")
    parser.add_argument("--output", type=Path, required=True, help="Filtered CSV path.")
    parser.add_argument(
        "--text-column",
        default="text",
        help="Body/text column name. Default: text",
    )
    parser.add_argument(
        "--title-column",
        default=None,
        help="Optional title column. Omit when the CSV has only text.",
    )
    parser.add_argument(
        "--min-words",
        type=int,
        default=31,
        help="Keep rows with strictly more than (min_words - 1) words. Default: 31 (>30).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    df = pd.read_csv(args.input)
    if args.text_column not in df.columns:
        raise SystemExit(f"Missing text column {args.text_column!r} in {args.input}")

    combined = df.apply(
        lambda row: combine_text(row, args.text_column, args.title_column),
        axis=1,
    )
    word_count = combined.str.split().str.len().fillna(0).astype(int)
    kept = df.loc[word_count >= args.min_words].copy()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    kept.to_csv(args.output, index=False)

    removed = len(df) - len(kept)
    print(f"input_rows={len(df)}")
    print(f"removed_le{args.min_words - 1}={removed}")
    print(f"kept_ge{args.min_words}={len(kept)}")
    print(f"output={args.output.resolve()}")


if __name__ == "__main__":
    main()
