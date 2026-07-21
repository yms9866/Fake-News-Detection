"""Load and prepare local fake-news datasets for Transformer training."""

from __future__ import annotations

import math
import os
import re
from numbers import Integral, Real
from pathlib import Path
from typing import Literal

from datasets import Dataset, DatasetDict, load_dataset


DatasetName = Literal["local_master"]

# Final label mapping:
# 0 = fake
# 1 = real
FAKE_LABEL = 0
REAL_LABEL = 1

DEFAULT_RANDOM_SEED = 42


def clean_news_text(text: object) -> str:
    """
    Clean source and formatting artifacts that could cause leakage.

    This cleaning is intentionally light for Transformer models.
    It does not remove:
    - stop words
    - punctuation
    - word endings
    - capitalization from the whole article

    It mainly removes:
    - URLs
    - HTML
    - Reuters source markers
    - obvious website boilerplate
    - repeated whitespace
    """
    if text is None:
        return ""

    text = str(text)

    # Replace common HTML entities before removing HTML tags.
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")

    # Remove HTML tags.
    text = re.sub(r"<[^>]+>", " ", text)

    # Remove URLs.
    text = re.sub(
        r"https?://[^\s]+|www\.[^\s]+",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    # Remove Reuters-style prefixes at the beginning.
    #
    # Examples:
    # WASHINGTON (Reuters) -
    # LONDON (Reuters) —
    # New York (Reuters) -
    text = re.sub(
        r"^\s*[A-Za-z][A-Za-z\s,.'\-]{1,100}"
        r"\s+\(Reuters\)\s*[-–—:]\s*",
        "",
        text,
    )

    # Remove standalone Reuters markers.
    text = re.sub(
        r"\(\s*Reuters\s*\)",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\bReuters\b",
        " ",
        text,
        flags=re.IGNORECASE,
    )

    # Remove common labels from the beginning of an article or title.
    text = re.sub(
        r"^\s*"
        r"(VIDEO|WATCH|BREAKING|READ MORE|UPDATE|EXCLUSIVE)"
        r"\s*[:\-–—]\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    # Remove common website boilerplate.
    boilerplate_patterns = [
        r"\bread more\b",
        r"\bclick here\b",
        r"\bsubscribe now\b",
        r"\bsubscribe to our newsletter\b",
        r"\bfollow us on facebook\b",
        r"\bfollow us on twitter\b",
        r"\bfollow us on x\b",
        r"\bshare this article\b",
        r"\badvertisement\b",
    ]

    for pattern in boilerplate_patterns:
        text = re.sub(
            pattern,
            " ",
            text,
            flags=re.IGNORECASE,
        )

    # Normalize whitespace.
    text = text.replace("\r", " ")
    text = text.replace("\n", " ")
    text = text.replace("\t", " ")
    text = re.sub(r"\s+", " ", text).strip()

    return text


def normalize_label(label: object) -> int | None:
    """
    Normalize labels to:

    0 = fake
    1 = real

    Supported fake values:
    0, 0.0, "0", "fake", "false"

    Supported real values:
    1, 1.0, "1", "real", "true"
    """
    if label is None:
        return None

    # Handle integer-like values.
    if isinstance(label, Integral):
        numeric_label = int(label)

        if numeric_label in {FAKE_LABEL, REAL_LABEL}:
            return numeric_label

        return None

    # Handle float-like values.
    if isinstance(label, Real):
        numeric_label = float(label)

        if math.isnan(numeric_label):
            return None

        if numeric_label == 0.0:
            return FAKE_LABEL

        if numeric_label == 1.0:
            return REAL_LABEL

        return None

    label_string = str(label).strip().lower()

    fake_values = {
        "0",
        "0.0",
        "fake",
        "false",
        "f",
    }

    real_values = {
        "1",
        "1.0",
        "real",
        "true",
        "r",
    }

    if label_string in fake_values:
        return FAKE_LABEL

    if label_string in real_values:
        return REAL_LABEL

    return None


def normalize_column_names(dataset: Dataset) -> Dataset:
    """
    Strip whitespace and make column names lowercase.

    Examples:
    " Text " -> "text"
    "LABEL"   -> "label"
    "Title"   -> "title"
    """
    original_columns = dataset.column_names

    normalized_columns = {
        column: column.strip().lower()
        for column in original_columns
    }

    # Detect names that would become duplicates after normalization.
    final_names = list(normalized_columns.values())

    if len(final_names) != len(set(final_names)):
        raise ValueError(
            "The CSV contains column names that become duplicates "
            "after converting them to lowercase and removing spaces. "
            f"Original columns: {original_columns}"
        )

    for original_name, normalized_name in normalized_columns.items():
        if original_name != normalized_name:
            dataset = dataset.rename_column(
                original_name,
                normalized_name,
            )

    return dataset


def prepare_example(
    example: dict,
    apply_cleaning: bool,
) -> dict:
    """
    Prepare one row for Transformer training.

    Required source values:
    - text
    - label

    Optional source value:
    - title

    Final output:
    - text
    - label
    """
    raw_body = example.get("text", "")
    raw_title = example.get("title", "")

    if apply_cleaning:
        body = clean_news_text(raw_body)
        title = clean_news_text(raw_title)
    else:
        body = "" if raw_body is None else str(raw_body).strip()
        title = "" if raw_title is None else str(raw_title).strip()

    # Concatenate title only when it exists and is not empty.
    if title and body:
        combined_text = f"{title}\n\n{body}"
    elif title:
        combined_text = title
    else:
        combined_text = body

    return {
        "text": combined_text.strip(),
        "label": normalize_label(example.get("label")),
    }


def keep_valid_example(example: dict) -> bool:
    """
    Keep only rows containing:

    - non-empty text
    - label 0 or 1
    """
    text = example.get("text", "")
    label = example.get("label")

    has_text = bool(str(text).strip())
    has_valid_label = label in {FAKE_LABEL, REAL_LABEL}

    return has_text and has_valid_label


def normalize_for_duplicate_check(text: object) -> str:
    """
    Normalize prepared text for exact duplicate detection.

    This normalization is only used for comparison.
    It does not modify the text given to the model.
    """
    if text is None:
        return ""

    normalized = str(text).strip().lower()
    normalized = re.sub(r"\s+", " ", normalized)

    return normalized


def deduplicate_across_splits(
    dataset: DatasetDict,
) -> DatasetDict:
    """
    Detect conflicting labels and remove duplicate texts across splits.

    Conflict example:
    The same cleaned article has label 0 in one location and label 1
    in another location.

    Duplicate priority:
    1. train
    2. validation
    3. test

    A duplicate found in validation or test is removed when it already
    exists in an earlier split.
    """
    expected_splits = ["train", "validation", "test"]

    for split in expected_splits:
        if split not in dataset:
            raise ValueError(
                f"Dataset is missing the required '{split}' split."
            )

    # ---------------------------------------------------------
    # First pass: detect contradictory labels.
    # ---------------------------------------------------------
    text_to_label: dict[str, int] = {}
    conflict_examples: list[dict] = []

    for split in expected_splits:
        texts = dataset[split]["text"]
        labels = dataset[split]["label"]

        for row_index, (text, label) in enumerate(
            zip(texts, labels)
        ):
            duplicate_key = normalize_for_duplicate_check(text)

            if not duplicate_key:
                continue

            current_label = int(label)
            previous_label = text_to_label.get(duplicate_key)

            if previous_label is None:
                text_to_label[duplicate_key] = current_label
                continue

            if previous_label != current_label:
                conflict_examples.append(
                    {
                        "split": split,
                        "row_index": row_index,
                        "previous_label": previous_label,
                        "current_label": current_label,
                        "text_preview": duplicate_key[:150],
                    }
                )

    if conflict_examples:
        first_conflict = conflict_examples[0]

        raise ValueError(
            f"Found {len(conflict_examples):,} duplicate occurrences "
            "with conflicting labels.\n"
            f"First conflict split: {first_conflict['split']}\n"
            f"Previous label: {first_conflict['previous_label']}\n"
            f"Current label: {first_conflict['current_label']}\n"
            f"Text preview: {first_conflict['text_preview']!r}\n\n"
            "The dataset was not returned because contradictory labels "
            "must be reviewed before training."
        )

    # ---------------------------------------------------------
    # Second pass: remove valid duplicate rows.
    # ---------------------------------------------------------
    seen_texts: set[str] = set()
    deduplicated_dataset = DatasetDict()

    for split in expected_splits:
        keep_indices: list[int] = []

        for row_index, text in enumerate(
            dataset[split]["text"]
        ):
            duplicate_key = normalize_for_duplicate_check(text)

            if not duplicate_key:
                continue

            if duplicate_key in seen_texts:
                continue

            seen_texts.add(duplicate_key)
            keep_indices.append(row_index)

        original_size = len(dataset[split])
        final_size = len(keep_indices)
        removed_count = original_size - final_size

        deduplicated_dataset[split] = dataset[split].select(
            keep_indices
        )

        print(
            f"  {split}: removed {removed_count:,} duplicate rows "
            f"({original_size:,} -> {final_size:,})"
        )

    return deduplicated_dataset


def limit_split_size(
    dataset: DatasetDict,
    max_samples: int,
    random_seed: int,
) -> DatasetDict:
    """
    Randomly limit each split to at most max_samples.

    Shuffling before selection prevents taking only the first rows when
    the source CSV is ordered by label, date, source, or subject.
    """
    if max_samples <= 0:
        raise ValueError("max_samples must be greater than zero.")

    limited_dataset = DatasetDict()

    for split in dataset.keys():
        split_dataset = dataset[split]

        if len(split_dataset) > max_samples:
            split_dataset = split_dataset.shuffle(
                seed=random_seed
            )

            split_dataset = split_dataset.select(
                range(max_samples)
            )

        limited_dataset[split] = split_dataset

    return limited_dataset


def print_dataset_summary(dataset: DatasetDict) -> None:
    """Print size and label distribution for each split."""
    print("\nDataset ready:")

    for split in ["train", "validation", "test"]:
        labels = dataset[split]["label"]

        fake_count = sum(
            1 for label in labels
            if label == FAKE_LABEL
        )

        real_count = sum(
            1 for label in labels
            if label == REAL_LABEL
        )

        total = len(dataset[split])

        fake_percentage = (
            fake_count / total * 100
            if total > 0
            else 0
        )

        real_percentage = (
            real_count / total * 100
            if total > 0
            else 0
        )

        print(
            f"  {split}: {total:,} rows\n"
            f"    fake (0): {fake_count:,} "
            f"({fake_percentage:.2f}%)\n"
            f"    real (1): {real_count:,} "
            f"({real_percentage:.2f}%)"
        )


def load_fake_news_dataset(
    name: DatasetName = "local_master",
    max_samples: int | None = None,
    clean_text: bool = True,
    remove_duplicates: bool = True,
    datasets_dir: str | os.PathLike | None = None,
    random_seed: int = DEFAULT_RANDOM_SEED,
) -> DatasetDict:
    """
    Load local train, validation, and test CSV files.

    Expected files:
    - train.csv
    - valid.csv
    - test.csv

    Required columns:
    - text
    - label

    Optional columns:
    - title

    Other columns such as subject, date, source, author, and index are
    ignored and removed.

    Final output columns:
    - text
    - label

    Label mapping:
    - 0 = fake
    - 1 = real

    Parameters
    ----------
    name:
        Dataset configuration name. Currently only "local_master"
        is supported.

    max_samples:
        Optional maximum number of examples retained in each split.
        When None, all available examples are used.

    clean_text:
        When True, remove URLs, HTML, Reuters markers, boilerplate,
        and repeated whitespace.

    remove_duplicates:
        When True, detect contradictory duplicate labels and remove
        exact duplicate prepared texts across splits.

    datasets_dir:
        Directory containing train.csv, valid.csv, and test.csv.
        When None, the default is project_root/datasets, assuming this
        Python file is inside project_root/src.

    random_seed:
        Seed used when max_samples causes a split to be shuffled.
    """
    if name != "local_master":
        raise ValueError(
            f"Unknown dataset configuration: {name!r}. "
            "Use 'local_master'."
        )

    # ---------------------------------------------------------
    # Resolve dataset directory.
    # ---------------------------------------------------------
    if datasets_dir is None:
        datasets_path = (
            Path(__file__).resolve().parent.parent
            / "datasets"
        )
    else:
        datasets_path = Path(datasets_dir).expanduser().resolve()

    data_files = {
        "train": str(datasets_path / "train.csv"),
        "validation": str(datasets_path / "valid.csv"),
        "test": str(datasets_path / "test.csv"),
    }

    # ---------------------------------------------------------
    # Confirm all files exist.
    # ---------------------------------------------------------
    for split, file_path in data_files.items():
        if not Path(file_path).is_file():
            raise FileNotFoundError(
                f"Missing dataset file for '{split}': "
                f"{file_path}"
            )

    print("Loading local fake-news dataset:")
    print(f"  Directory: {datasets_path}")

    dataset = load_dataset(
        "csv",
        data_files=data_files,
    )

    prepared_dataset = DatasetDict()

    # ---------------------------------------------------------
    # Validate and prepare every split separately.
    # ---------------------------------------------------------
    for split in ["train", "validation", "test"]:
        split_dataset = normalize_column_names(
            dataset[split]
        )

        available_columns = set(
            split_dataset.column_names
        )

        required_columns = {"text", "label"}
        missing_columns = (
            required_columns - available_columns
        )

        if missing_columns:
            raise ValueError(
                f"{split}.csv is missing required columns: "
                f"{sorted(missing_columns)}.\n"
                f"Available columns: "
                f"{split_dataset.column_names}\n\n"
                "The 'text' and 'label' columns are required. "
                "The 'title' column is optional."
            )

        has_title = "title" in available_columns

        if has_title:
            print(
                f"  {split}: title found; concatenating "
                "title with text."
            )
        else:
            print(
                f"  {split}: no title column; using text only."
            )

        original_columns = split_dataset.column_names

        # map() creates the final text and normalized label.
        # remove_columns removes title, subject, date, and any other
        # unused source columns in the same operation.
        split_dataset = split_dataset.map(
            prepare_example,
            fn_kwargs={
                "apply_cleaning": clean_text,
            },
            remove_columns=original_columns,
            desc=f"Preparing {split}",
        )

        split_dataset = split_dataset.filter(
            keep_valid_example,
            desc=f"Removing invalid {split} rows",
        )

        # Ensure the model sees only these two columns.
        split_dataset = split_dataset.select_columns(
            ["text", "label"]
        )

        prepared_dataset[split] = split_dataset

    dataset = prepared_dataset

    # ---------------------------------------------------------
    # Remove duplicate leakage.
    # ---------------------------------------------------------
    if remove_duplicates:
        print(
            "\nChecking duplicate texts across "
            "train, validation, and test..."
        )

        dataset = deduplicate_across_splits(
            dataset
        )

    # ---------------------------------------------------------
    # Optionally reduce dataset size.
    # ---------------------------------------------------------
    if max_samples is not None:
        print(
            f"\nLimiting each split to at most "
            f"{max_samples:,} examples..."
        )

        dataset = limit_split_size(
            dataset=dataset,
            max_samples=max_samples,
            random_seed=random_seed,
        )

    print_dataset_summary(dataset)

    return dataset


if __name__ == "__main__":
    # Default:
    # project_root/
    # ├── datasets/
    # │   ├── train.csv
    # │   ├── valid.csv
    # │   └── test.csv
    # └── src/
    #     └── dataset_loader.py

    dataset = load_fake_news_dataset(
        name="local_master",
        datasets_dir=None,
        clean_text=True,
        remove_duplicates=True,
        max_samples=None,
        random_seed=42,
    )

    print("\nFinal columns:")
    print(dataset["train"].column_names)

    print("\nExample prepared row:")
    print(dataset["train"][0])