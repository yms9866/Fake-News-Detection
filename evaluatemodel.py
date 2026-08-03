"""Evaluate a binary ModernBERT fake-news style classifier.

Label mapping:
    0 = FAKE_STYLE
    1 = REAL_STYLE

Cleaning modes:
    training  = use exactly the original training cleaner
    enhanced  = use the original cleaner plus stricter media/category cleanup

Outputs:
    metrics.json
    preprocessing_summary.json
    predictions.csv
    accuracy_by_length.csv
    confusion_matrix.png
    reliability_diagram.png
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path
from typing import Literal

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import torch
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    brier_score_loss,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from tqdm.auto import tqdm
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# This is the cleaner used by the existing checkpoint during training.
from src.data_loader import clean_news_text as training_clean_news_text


os.environ["TOKENIZERS_PARALLELISM"] = "false"

LABEL_NAMES = {
    0: "FAKE_STYLE",
    1: "REAL_STYLE",
}

CleaningMode = Literal["training", "enhanced"]

# These patterns are diagnostics. They are checked after preprocessing.
REMAINING_MARKER_PATTERNS: dict[str, str] = {
    "url": r"https?://|www\.",
    "reuters": r"(?i)\breuters\b",
    "bracketed_media_marker": (
        r"(?i)[\[(]\s*(?:video|videos|watch|image|images|photo|photos|gallery|audio)"
        r"\s*[\])]"
    ),
    "leading_media_label": (
        r"(?i)^\s*(?:video|videos|watch|image|images|photo|photos|gallery|audio)\b"
    ),
    "trailing_media_label": (
        r"(?i)\b(?:video|videos|watch|image|images|photo|photos|gallery|audio)\s*$"
    ),
    "trailing_category_label": (
        r"(?i)(?:[-–—:|/]\s*)"
        r"(?:politics|worldnews|government news|left-news)\s*$"
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate a ModernBERT fake-news style classifier."
    )

    parser.add_argument(
        "--model",
        type=Path,
        required=True,
        help="Path to the trained Hugging Face model directory.",
    )
    parser.add_argument(
        "--tokenizer",
        type=Path,
        default=None,
        help="Optional tokenizer directory. Defaults to the model directory.",
    )
    parser.add_argument(
        "--test-csv",
        type=Path,
        required=True,
        help="CSV containing text and label columns.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("evaluation_results"),
        help="Directory where evaluation results will be saved.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Evaluation batch size. Start with 16 on a T4.",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=512,
        help="Maximum tokenizer sequence length.",
    )
    parser.add_argument(
        "--ece-bins",
        type=int,
        default=15,
        help="Number of bins used for Expected Calibration Error.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional number of rows for a quick test run.",
    )
    parser.add_argument(
        "--disable-fp16",
        action="store_true",
        help="Disable FP16 mixed precision on CUDA.",
    )
    parser.add_argument(
        "--cleaning-mode",
        choices=("training", "enhanced"),
        default="training",
        help=(
            "'training' exactly matches preprocessing used by the existing "
            "checkpoint. 'enhanced' additionally removes bracketed/trailing "
            "media markers and explicit trailing category tags."
        ),
    )

    return parser.parse_args()


def resolve_local_directory(path: Path, directory_name: str) -> Path:
    resolved_path = path.expanduser().resolve()

    if not resolved_path.exists():
        raise FileNotFoundError(
            f"{directory_name} does not exist:\n{resolved_path}"
        )

    if not resolved_path.is_dir():
        raise NotADirectoryError(
            f"{directory_name} is not a directory:\n{resolved_path}"
        )

    return resolved_path


def normalize_label(value: object) -> int:
    """Convert common binary labels to 0=fake and 1=real."""
    if pd.isna(value):
        raise ValueError("A label value is missing.")

    if isinstance(value, (int, np.integer)):
        label = int(value)
        if label in {0, 1}:
            return label

    if isinstance(value, (float, np.floating)) and float(value).is_integer():
        label = int(value)
        if label in {0, 1}:
            return label

    normalized = str(value).strip().lower()

    fake_labels = {
        "0",
        "0.0",
        "fake",
        "false",
        "f",
        "fake_style",
        "fake-style",
        "unreliable",
    }
    real_labels = {
        "1",
        "1.0",
        "real",
        "true",
        "r",
        "real_style",
        "real-style",
        "reliable",
    }

    if normalized in fake_labels:
        return 0
    if normalized in real_labels:
        return 1

    raise ValueError(
        f"Unsupported label value: {value!r}. "
        "Expected 0/1, fake/real, or false/true."
    )


def enhanced_clean_news_text(text: object) -> str:
    """Apply the training cleaner, then remove additional dataset artifacts.

    This deliberately targets formatting markers rather than removing normal
    occurrences of words such as 'video', 'image', or 'politics' inside an
    article sentence.
    """
    cleaned = training_clean_news_text(text)

    # Remove leading labels even when punctuation is missing.
    cleaned = re.sub(
        r"^\s*(?:VIDEO|VIDEOS|WATCH|IMAGE|IMAGES|PHOTO|PHOTOS|GALLERY|AUDIO)"
        r"\b\s*(?:[:\-–—|]\s*)?",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Remove bracketed or parenthesized markers anywhere.
    cleaned = re.sub(
        r"[\[(]\s*(?:VIDEO|VIDEOS|WATCH|IMAGE|IMAGES|PHOTO|PHOTOS|GALLERY|AUDIO)"
        r"\s*[\])]",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Remove media labels only when they appear as an ending marker.
    cleaned = re.sub(
        r"\s*(?:[\-–—:|/]\s*)?"
        r"(?:VIDEO|VIDEOS|WATCH|IMAGE|IMAGES|PHOTO|PHOTOS|GALLERY|AUDIO)\s*$",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )

    # Remove explicit category tags only when separated as a trailing tag.
    # This avoids deleting a normal sentence that simply ends with 'politics'.
    cleaned = re.sub(
        r"\s*(?:[\-–—:|/]\s*)"
        r"(?:POLITICS|WORLDNEWS|GOVERNMENT NEWS|LEFT-NEWS)\s*$",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )

    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def clean_component(text: object, cleaning_mode: CleaningMode) -> str:
    if cleaning_mode == "training":
        return training_clean_news_text(text)
    if cleaning_mode == "enhanced":
        return enhanced_clean_news_text(text)
    raise ValueError(f"Unsupported cleaning mode: {cleaning_mode!r}")


def combine_title_and_body(title: str, body: str) -> str:
    """Match the training loader's exact title/body combination format."""
    if title and body:
        return f"{title}\n\n{body}"
    if title:
        return title
    return body


def marker_counts(cleaned_text: pd.Series) -> dict[str, int]:
    counts: dict[str, int] = {}

    for name, pattern in REMAINING_MARKER_PATTERNS.items():
        counts[name] = int(
            cleaned_text.str.contains(pattern, regex=True, na=False).sum()
        )

    return counts


def load_test_data(
    csv_path: Path,
    cleaning_mode: CleaningMode,
    limit: int | None = None,
) -> tuple[pd.DataFrame, dict[str, object]]:
    resolved_csv_path = csv_path.expanduser().resolve()

    if not resolved_csv_path.exists():
        raise FileNotFoundError(
            f"Test CSV does not exist:\n{resolved_csv_path}"
        )

    dataframe = pd.read_csv(resolved_csv_path)

    if limit is not None:
        if limit <= 0:
            raise ValueError("--limit must be greater than zero.")
        dataframe = dataframe.head(limit).copy()

    normalized_columns = {
        column.strip().lower(): column for column in dataframe.columns
    }

    if "text" not in normalized_columns:
        raise ValueError("The test CSV must contain a 'text' column.")

    if "label" not in normalized_columns:
        if "lebel" in normalized_columns:
            normalized_columns["label"] = normalized_columns["lebel"]
        else:
            raise ValueError("The test CSV must contain a 'label' column.")

    text_column = normalized_columns["text"]
    label_column = normalized_columns["label"]
    title_column = normalized_columns.get("title")

    output = pd.DataFrame()

    raw_bodies = dataframe[text_column].fillna("").astype(str).str.strip()

    if title_column is not None:
        raw_titles = dataframe[title_column].fillna("").astype(str).str.strip()
    else:
        raw_titles = pd.Series("", index=dataframe.index, dtype="object")

    output["original_title"] = raw_titles
    output["original_body"] = raw_bodies
    output["original_text"] = [
        combine_title_and_body(title, body)
        for title, body in zip(raw_titles, raw_bodies)
    ]
    output["label"] = dataframe[label_column].map(normalize_label)

    output = output[output["original_text"].str.len() > 0].copy()

    print(f"Applying preprocessing mode: {cleaning_mode}")

    # IMPORTANT: clean title and body separately, exactly as training did.
    cleaned_titles = output["original_title"].map(
        lambda value: clean_component(value, cleaning_mode)
    )
    cleaned_bodies = output["original_body"].map(
        lambda value: clean_component(value, cleaning_mode)
    )

    output["cleaned_text"] = [
        combine_title_and_body(title, body)
        for title, body in zip(cleaned_titles, cleaned_bodies)
    ]

    output = output[output["cleaned_text"].str.len() > 0].reset_index(drop=True)

    if output.empty:
        raise ValueError("No valid examples remained after preprocessing.")

    output["word_count"] = output["cleaned_text"].str.split().str.len()
    output["character_count"] = output["cleaned_text"].str.len()

    remaining_markers = marker_counts(output["cleaned_text"])

    print("Remaining preprocessing markers:")
    for name, count in remaining_markers.items():
        print(f"- {name}: {count:,}")

    preprocessing_summary: dict[str, object] = {
        "cleaning_mode": cleaning_mode,
        "test_csv": str(resolved_csv_path),
        "has_title_column": title_column is not None,
        "number_of_examples": int(len(output)),
        "remaining_marker_counts": remaining_markers,
    }

    if cleaning_mode == "enhanced":
        print(
            "\nWARNING: Enhanced preprocessing does not match the preprocessing "
            "used to train the existing checkpoint. Use this mode as a shortcut-"
            "sensitivity diagnostic. For final reporting, retrain with the same "
            "enhanced cleaner.\n"
        )

    return output, preprocessing_summary


def stable_softmax(logits: np.ndarray) -> np.ndarray:
    shifted_logits = logits - np.max(logits, axis=1, keepdims=True)
    exponentials = np.exp(shifted_logits)
    return exponentials / np.sum(exponentials, axis=1, keepdims=True)


@torch.inference_mode()
def predict_probabilities(
    dataframe: pd.DataFrame,
    model_path: Path,
    tokenizer_path: Path | None,
    batch_size: int,
    max_length: int,
    use_fp16: bool,
) -> tuple[np.ndarray, np.ndarray, float]:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    if device.type == "cuda":
        gpu_name = torch.cuda.get_device_name(0)
        gpu_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
        print(f"GPU: {gpu_name}")
        print(f"GPU memory: {gpu_memory:.2f} GB")
        print(f"FP16 mixed precision: {'enabled' if use_fp16 else 'disabled'}")

    resolved_model_path = resolve_local_directory(model_path, "Model directory")
    resolved_tokenizer_path = (
        resolved_model_path
        if tokenizer_path is None
        else resolve_local_directory(tokenizer_path, "Tokenizer directory")
    )

    config_path = resolved_model_path / "config.json"
    if not config_path.exists():
        raise FileNotFoundError(
            "The model directory does not contain config.json:\n"
            f"{resolved_model_path}"
        )

    model_source = resolved_model_path.as_posix()
    tokenizer_source = resolved_tokenizer_path.as_posix()

    print(f"Loading tokenizer from: {resolved_tokenizer_path}")
    tokenizer = AutoTokenizer.from_pretrained(
        tokenizer_source,
        local_files_only=True,
        use_fast=True,
    )

    print(f"Loading model from: {resolved_model_path}")
    model_load_arguments: dict[str, object] = {
        "local_files_only": True,
        "low_cpu_mem_usage": True,
    }

    if device.type == "cuda" and use_fp16:
        model_load_arguments["torch_dtype"] = torch.float16

    model = AutoModelForSequenceClassification.from_pretrained(
        model_source,
        **model_load_arguments,
    )
    model.to(device)
    model.eval()

    if model.config.num_labels != 2:
        raise ValueError(
            "This evaluator expects a binary classifier, but the model has "
            f"{model.config.num_labels} labels."
        )

    texts = dataframe["cleaned_text"].tolist()
    all_logits: list[np.ndarray] = []
    total_batches = (len(texts) + batch_size - 1) // batch_size

    if device.type == "cuda":
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

    start_time = time.perf_counter()

    progress_bar = tqdm(
        range(0, len(texts), batch_size),
        total=total_batches,
        desc="Evaluating test set",
        unit="batch",
    )

    try:
        for start_index in progress_bar:
            batch_texts = texts[start_index : start_index + batch_size]

            encoded = tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=max_length,
                return_tensors="pt",
            )
            encoded = {
                key: tensor.to(device, non_blocking=True)
                for key, tensor in encoded.items()
            }

            with torch.autocast(
                device_type=device.type,
                dtype=torch.float16,
                enabled=device.type == "cuda" and use_fp16,
            ):
                outputs = model(**encoded)

            all_logits.append(outputs.logits.float().cpu().numpy())

            processed = min(start_index + batch_size, len(texts))
            progress_bar.set_postfix(examples=f"{processed}/{len(texts)}")

    except torch.cuda.OutOfMemoryError as error:
        torch.cuda.empty_cache()
        raise RuntimeError(
            "CUDA ran out of memory. Reduce --batch-size, for example from "
            "32 to 16 or from 16 to 8."
        ) from error

    if device.type == "cuda":
        torch.cuda.synchronize()

    elapsed_seconds = time.perf_counter() - start_time

    logits = np.concatenate(all_logits, axis=0)
    probabilities = stable_softmax(logits)
    predictions = probabilities.argmax(axis=1)

    return probabilities, predictions, elapsed_seconds


def calculate_top_label_ece(
    y_true: np.ndarray,
    probabilities: np.ndarray,
    number_of_bins: int = 15,
) -> tuple[float, list[dict[str, float | int]]]:
    predicted_labels = probabilities.argmax(axis=1)
    confidences = probabilities.max(axis=1)
    correctness = (predicted_labels == y_true).astype(float)
    bin_boundaries = np.linspace(0.0, 1.0, number_of_bins + 1)

    ece = 0.0
    total_examples = len(y_true)
    bin_results: list[dict[str, float | int]] = []

    for index in range(number_of_bins):
        lower_bound = float(bin_boundaries[index])
        upper_bound = float(bin_boundaries[index + 1])

        if index == 0:
            in_bin = (confidences >= lower_bound) & (confidences <= upper_bound)
        else:
            in_bin = (confidences > lower_bound) & (confidences <= upper_bound)

        count = int(in_bin.sum())
        if count == 0:
            continue

        average_confidence = float(confidences[in_bin].mean())
        average_accuracy = float(correctness[in_bin].mean())
        calibration_gap = abs(average_accuracy - average_confidence)
        bin_weight = count / total_examples
        ece += bin_weight * calibration_gap

        bin_results.append(
            {
                "lower_bound": lower_bound,
                "upper_bound": upper_bound,
                "count": count,
                "average_confidence": average_confidence,
                "average_accuracy": average_accuracy,
                "calibration_gap": calibration_gap,
            }
        )

    return float(ece), bin_results


def save_confusion_matrix(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    output_path: Path,
) -> None:
    matrix = confusion_matrix(y_true, y_pred, labels=[0, 1])
    display = ConfusionMatrixDisplay(
        confusion_matrix=matrix,
        display_labels=[LABEL_NAMES[0], LABEL_NAMES[1]],
    )
    display.plot(values_format="d")
    plt.title("ModernBERT confusion matrix")
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()


def save_reliability_diagram(
    y_true: np.ndarray,
    probability_real: np.ndarray,
    output_path: Path,
    number_of_bins: int,
) -> None:
    if len(np.unique(y_true)) < 2:
        print(
            "Reliability diagram was not created because the test set contains "
            "only one class."
        )
        return

    observed_fraction_real, mean_predicted_probability = calibration_curve(
        y_true,
        probability_real,
        n_bins=number_of_bins,
        strategy="quantile",
    )

    plt.figure(figsize=(7, 6))
    plt.plot([0, 1], [0, 1], linestyle="--", label="Perfect calibration")
    plt.plot(
        mean_predicted_probability,
        observed_fraction_real,
        marker="o",
        label="ModernBERT",
    )
    plt.xlabel("Mean predicted probability of REAL_STYLE")
    plt.ylabel("Observed fraction of REAL_STYLE")
    plt.title("Reliability diagram")
    plt.xlim(0, 1)
    plt.ylim(0, 1)
    plt.grid(alpha=0.3)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close()


def build_length_breakdown(predictions_output: pd.DataFrame) -> pd.DataFrame:
    bins = [0, 10, 30, 100, 300, 1000, np.inf]
    labels = ["1-10", "11-30", "31-100", "101-300", "301-1000", "1001+"]

    buckets = pd.cut(
        predictions_output["word_count"],
        bins=bins,
        labels=labels,
        include_lowest=True,
        right=True,
    )

    grouped = (
        predictions_output.assign(length_bucket=buckets)
        .groupby("length_bucket", observed=False)
        .agg(
            samples=("correct", "size"),
            correct=("correct", "sum"),
            accuracy=("correct", "mean"),
            average_confidence=("model_confidence", "mean"),
        )
        .reset_index()
    )

    return grouped


def evaluate_and_save(
    dataframe: pd.DataFrame,
    probabilities: np.ndarray,
    predictions: np.ndarray,
    output_dir: Path,
    ece_bins: int,
    inference_seconds: float,
    preprocessing_summary: dict[str, object],
) -> None:
    output_dir = output_dir.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    y_true = dataframe["label"].to_numpy()
    probability_fake = probabilities[:, 0]
    probability_real = probabilities[:, 1]

    accuracy = accuracy_score(y_true, predictions)
    precision, recall, f1, support = precision_recall_fscore_support(
        y_true,
        predictions,
        labels=[0, 1],
        zero_division=0,
    )
    macro_precision, macro_recall, macro_f1, _ = precision_recall_fscore_support(
        y_true,
        predictions,
        average="macro",
        zero_division=0,
    )
    weighted_precision, weighted_recall, weighted_f1, _ = (
        precision_recall_fscore_support(
            y_true,
            predictions,
            average="weighted",
            zero_division=0,
        )
    )

    brier_score = brier_score_loss(y_true, probability_real)
    ece, ece_bin_results = calculate_top_label_ece(
        y_true,
        probabilities,
        number_of_bins=ece_bins,
    )
    matrix = confusion_matrix(y_true, predictions, labels=[0, 1])
    report = classification_report(
        y_true,
        predictions,
        labels=[0, 1],
        target_names=[LABEL_NAMES[0], LABEL_NAMES[1]],
        output_dict=True,
        zero_division=0,
    )

    examples_per_second = (
        len(y_true) / inference_seconds if inference_seconds > 0 else 0.0
    )

    predictions_output = dataframe.copy()
    predictions_output["actual_label_name"] = predictions_output["label"].map(
        LABEL_NAMES
    )
    predictions_output["predicted_label"] = predictions
    predictions_output["predicted_label_name"] = [
        LABEL_NAMES[int(label)] for label in predictions
    ]
    predictions_output["probability_fake"] = probability_fake
    predictions_output["probability_real"] = probability_real
    predictions_output["model_confidence"] = probabilities.max(axis=1)
    predictions_output["correct"] = (
        predictions_output["label"] == predictions_output["predicted_label"]
    )

    length_breakdown = build_length_breakdown(predictions_output)

    metrics = {
        "number_of_examples": int(len(y_true)),
        "inference_seconds": float(inference_seconds),
        "examples_per_second": float(examples_per_second),
        "preprocessing": preprocessing_summary,
        "label_mapping": {"0": LABEL_NAMES[0], "1": LABEL_NAMES[1]},
        "accuracy": float(accuracy),
        "macro_precision": float(macro_precision),
        "macro_recall": float(macro_recall),
        "macro_f1": float(macro_f1),
        "weighted_precision": float(weighted_precision),
        "weighted_recall": float(weighted_recall),
        "weighted_f1": float(weighted_f1),
        "brier_score": float(brier_score),
        "expected_calibration_error": float(ece),
        "per_class": {
            LABEL_NAMES[0]: {
                "precision": float(precision[0]),
                "recall": float(recall[0]),
                "f1": float(f1[0]),
                "support": int(support[0]),
            },
            LABEL_NAMES[1]: {
                "precision": float(precision[1]),
                "recall": float(recall[1]),
                "f1": float(f1[1]),
                "support": int(support[1]),
            },
        },
        "confusion_matrix": matrix.tolist(),
        "ece_bins": ece_bin_results,
        "classification_report": report,
        "accuracy_by_length": length_breakdown.to_dict(orient="records"),
    }

    metrics_path = output_dir / "metrics.json"
    preprocessing_path = output_dir / "preprocessing_summary.json"
    predictions_path = output_dir / "predictions.csv"
    length_breakdown_path = output_dir / "accuracy_by_length.csv"
    confusion_matrix_path = output_dir / "confusion_matrix.png"
    reliability_diagram_path = output_dir / "reliability_diagram.png"

    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    preprocessing_path.write_text(
        json.dumps(preprocessing_summary, indent=2),
        encoding="utf-8",
    )
    predictions_output.to_csv(predictions_path, index=False)
    length_breakdown.to_csv(length_breakdown_path, index=False)

    save_confusion_matrix(y_true, predictions, confusion_matrix_path)
    save_reliability_diagram(
        y_true,
        probability_real,
        reliability_diagram_path,
        number_of_bins=ece_bins,
    )

    print("\n================ EVALUATION RESULTS ================\n")
    print(f"Preprocessing mode:  {preprocessing_summary['cleaning_mode']}")
    print(f"Test examples:       {len(y_true):,}")
    print(f"Inference time:      {inference_seconds:.2f} seconds")
    print(f"Examples per second: {examples_per_second:.2f}")

    print("\nOverall metrics")
    print(f"Accuracy:            {accuracy:.4f}")
    print(f"Macro precision:     {macro_precision:.4f}")
    print(f"Macro recall:        {macro_recall:.4f}")
    print(f"Macro F1:            {macro_f1:.4f}")
    print(f"Weighted precision:  {weighted_precision:.4f}")
    print(f"Weighted recall:     {weighted_recall:.4f}")
    print(f"Weighted F1:         {weighted_f1:.4f}")
    print(f"Brier score:         {brier_score:.4f}")
    print(f"ECE:                 {ece:.4f}")

    print("\nPer-class results")
    for label_index in [0, 1]:
        print(
            f"{LABEL_NAMES[label_index]:12} "
            f"Precision={precision[label_index]:.4f} "
            f"Recall={recall[label_index]:.4f} "
            f"F1={f1[label_index]:.4f} "
            f"Support={support[label_index]}"
        )

    print("\nConfusion matrix")
    print(matrix)
    print("\nMatrix layout")
    print("[[actual fake predicted fake, actual fake predicted real],")
    print(" [actual real predicted fake, actual real predicted real]]")

    print("\nAccuracy by cleaned-text length")
    print(length_breakdown.to_string(index=False))

    print("\nSaved files")
    print(f"- {metrics_path}")
    print(f"- {preprocessing_path}")
    print(f"- {predictions_path}")
    print(f"- {length_breakdown_path}")
    print(f"- {confusion_matrix_path}")
    if reliability_diagram_path.exists():
        print(f"- {reliability_diagram_path}")

    print("\n====================================================\n")


def main() -> None:
    args = parse_args()

    if args.batch_size <= 0:
        raise ValueError("--batch-size must be greater than zero.")
    if args.max_length <= 0:
        raise ValueError("--max-length must be greater than zero.")
    if args.ece_bins < 2:
        raise ValueError("--ece-bins must be at least 2.")

    dataframe, preprocessing_summary = load_test_data(
        csv_path=args.test_csv,
        cleaning_mode=args.cleaning_mode,
        limit=args.limit,
    )

    print(f"Loaded {len(dataframe):,} test examples.")
    label_counts = dataframe["label"].value_counts().sort_index()
    print("Test-set class distribution:")
    for label in [0, 1]:
        print(f"- {LABEL_NAMES[label]}: {int(label_counts.get(label, 0)):,}")

    use_fp16 = not args.disable_fp16
    probabilities, predictions, inference_seconds = predict_probabilities(
        dataframe=dataframe,
        model_path=args.model,
        tokenizer_path=args.tokenizer,
        batch_size=args.batch_size,
        max_length=args.max_length,
        use_fp16=use_fp16,
    )

    evaluate_and_save(
        dataframe=dataframe,
        probabilities=probabilities,
        predictions=predictions,
        output_dir=args.output_dir,
        ece_bins=args.ece_bins,
        inference_seconds=inference_seconds,
        preprocessing_summary=preprocessing_summary,
    )


if __name__ == "__main__":
    main()