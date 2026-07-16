"""Load and prepare local fake news datasets for Transformer training."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Literal

from datasets import DatasetDict, load_dataset

DatasetName = Literal["local_master"]


def clean_news_text(text: str) -> str:
    """
    Clean source/style artifacts that can cause leakage.

    This helps stop the model from learning shortcuts like:
    - "Reuters" = REAL
    - URL / VIDEO / read more = FAKE

    The goal is to keep the actual claim/article content while removing
    publisher/source boilerplate.
    """
    if text is None:
        return ""

    text = str(text)

    # Normalize weird whitespace
    text = text.replace("\n", " ").replace("\t", " ")
    text = re.sub(r"\s+", " ", text).strip()

    # Remove URLs
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)

    # Remove Reuters-style beginning prefixes:
    # Example: WASHINGTON (Reuters) - ...
    text = re.sub(
        r"^\s*[A-Z][A-Z\s,.'\-]{1,100}\s+\(Reuters\)\s*[---]\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    # Remove standalone Reuters markers
    text = re.sub(r"\(Reuters\)", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bReuters\b", " ", text, flags=re.IGNORECASE)

    # Remove common media/clickbait labels at the beginning
    text = re.sub(
        r"^\s*(VIDEO|WATCH|BREAKING|READ MORE|UPDATE|EXCLUSIVE)\s*[:\---]\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    # Remove common boilerplate phrases
    boilerplate_patterns = [
        r"\bread more\b",
        r"\bclick here\b",
        r"\bsubscribe\b",
        r"\bfollow us on facebook\b",
        r"\bfollow us on twitter\b",
        r"\bfollow us on x\b",
        r"\bshare this article\b",
        r"\badvertisement\b",
    ]

    for pattern in boilerplate_patterns:
        text = re.sub(pattern, " ", text, flags=re.IGNORECASE)

    # Remove leftover HTML entities / tags if any slipped in
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")

    # Final whitespace cleanup
    text = re.sub(r"\s+", " ", text).strip()

    return text


def normalize_label(label) -> int | None:
    """
    Normalize labels to:
    0 = fake
    1 = real
    """
    if label is None:
        return None

    if isinstance(label, int):
        if label in {0, 1}:
            return label
        return None

    label_str = str(label).strip().lower()

    if label_str in {"0", "fake", "false"}:
        return 0

    if label_str in {"1", "real", "true"}:
        return 1

    return None


def clean_example(example: dict) -> dict:
    """Clean one dataset row."""
    return {
        "text": clean_news_text(example["text"]),
        "label": normalize_label(example["label"]),
    }


def remove_empty_or_bad_rows(example: dict) -> bool:
    """Keep only rows with valid text and valid labels."""
    text = example.get("text", "")
    label = example.get("label", None)

    return bool(str(text).strip()) and label in {0, 1}


def deduplicate_across_splits(dataset: DatasetDict) -> DatasetDict:
    """
    Remove exact duplicate cleaned texts across train/validation/test.

    Priority:
    1. Keep train rows first
    2. Remove validation rows already seen in train
    3. Remove test rows already seen in train or validation

    This reduces train/test leakage.
    """
    seen_texts: set[str] = set()
    deduped = DatasetDict()

    for split in ["train", "validation", "test"]:
        keep_indices = []

        for idx, text in enumerate(dataset[split]["text"]):
            normalized_text = str(text).strip().lower()

            if normalized_text and normalized_text not in seen_texts:
                seen_texts.add(normalized_text)
                keep_indices.append(idx)

        deduped[split] = dataset[split].select(keep_indices)

    return deduped


def load_fake_news_dataset(
    name: DatasetName = "local_master",
    max_samples: int | None = None,
    clean_text: bool = True,
    remove_duplicates: bool = True,
    datasets_dir: str | os.PathLike | None = None,
) -> DatasetDict:
    """
    Load local dataset splits from the datasets directory.

    Expected CSV files:
    - train.csv
    - valid.csv
    - test.csv

    Expected columns:
    - text
    - label

    Output columns:
    - text
    - label

    Labels:
    - 0 = fake
    - 1 = real
    """
    if name != "local_master":
        raise ValueError(f"Unknown dataset config: {name}. Use 'local_master'.")

    if datasets_dir is None:
        # If this file is inside src/, this points to project_root/datasets
        datasets_path = Path(__file__).resolve().parent.parent / "datasets"
    else:
        datasets_path = Path(datasets_dir)

    data_files = {
        "train": str(datasets_path / "train.csv"),
        "validation": str(datasets_path / "valid.csv"),
        "test": str(datasets_path / "test.csv"),
    }

    for split, path in data_files.items():
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Missing dataset split for {split}: {path}"
            )

    print("?? Loading local fake news dataset splits...")
    dataset = load_dataset("csv", data_files=data_files)

    required_columns = {"text", "label"}

    for split in dataset.keys():
        available_columns = set(dataset[split].column_names)

        if not required_columns.issubset(available_columns):
            raise ValueError(
                f"{split}.csv must contain columns {required_columns}. "
                f"Found columns: {dataset[split].column_names}"
            )

    # Remove extra columns if your CSV has index/title/subject/date/etc.
    for split in dataset.keys():
        extra_columns = [
            col for col in dataset[split].column_names
            if col not in ["text", "label"]
        ]

        if extra_columns:
            dataset[split] = dataset[split].remove_columns(extra_columns)

    if clean_text:
        print("?? Cleaning text to reduce source/style leakage...")
        dataset = dataset.map(clean_example)

        print("?? Removing empty rows or invalid labels...")
        dataset = dataset.filter(remove_empty_or_bad_rows)

    if remove_duplicates:
        print("?? Removing duplicate cleaned texts across splits...")
        dataset = deduplicate_across_splits(dataset)

    if max_samples is not None:
        print(f"?? Trimming each split to max {max_samples:,} samples.")

        for split in dataset.keys():
            max_range = min(max_samples, len(dataset[split]))
            dataset[split] = dataset[split].select(range(max_range))

    print("? Dataset ready:")
    for split in dataset.keys():
        labels = dataset[split]["label"]
        fake_count = labels.count(0)
        real_count = labels.count(1)

        print(
            f"  {split}: {len(dataset[split]):,} rows "
            f"| fake: {fake_count:,} "
            f"| real: {real_count:,}"
        )

    return dataset