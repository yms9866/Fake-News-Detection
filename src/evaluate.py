"""Evaluation metrics for local fake-news style/risk classification."""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)


LABEL_NAMES = ["fake-like", "real-like"]


def _to_numpy(values: Any) -> np.ndarray:
    """
    Convert lists, NumPy arrays, or PyTorch tensors to NumPy arrays.
    """
    if hasattr(values, "detach"):
        values = values.detach()

    if hasattr(values, "cpu"):
        values = values.cpu()

    if hasattr(values, "numpy"):
        values = values.numpy()

    return np.asarray(values)


def evaluate_predictions(y_true: Any, y_pred: Any) -> dict:
    """
    Calculate local classifier metrics.

    Labels:
    - 0 = fake-like / suspicious style
    - 1 = real-like / credible style

    Important:
    These metrics evaluate the local ML classifier only.
    They do not measure full factual truth verification.
    """
    y_true = _to_numpy(y_true).astype(int)
    y_pred = _to_numpy(y_pred).astype(int)

    return {
        "accuracy": accuracy_score(y_true, y_pred),
        "precision_real_like": precision_score(
            y_true,
            y_pred,
            pos_label=1,
            zero_division=0,
        ),
        "recall_real_like": recall_score(
            y_true,
            y_pred,
            pos_label=1,
            zero_division=0,
        ),
        "f1_real_like": f1_score(
            y_true,
            y_pred,
            pos_label=1,
            zero_division=0,
        ),
        "precision_fake_like": precision_score(
            y_true,
            y_pred,
            pos_label=0,
            zero_division=0,
        ),
        "recall_fake_like": recall_score(
            y_true,
            y_pred,
            pos_label=0,
            zero_division=0,
        ),
        "f1_fake_like": f1_score(
            y_true,
            y_pred,
            pos_label=0,
            zero_division=0,
        ),
        "macro_f1": f1_score(
            y_true,
            y_pred,
            average="macro",
            zero_division=0,
        ),
        "weighted_f1": f1_score(
            y_true,
            y_pred,
            average="weighted",
            zero_division=0,
        ),
        "confusion_matrix": confusion_matrix(
            y_true,
            y_pred,
            labels=[0, 1],
        ).tolist(),
        "report": classification_report(
            y_true,
            y_pred,
            labels=[0, 1],
            target_names=LABEL_NAMES,
            digits=4,
            zero_division=0,
        ),
    }


def print_metrics(metrics: dict) -> None:
    """
    Print metric summaries for the local ML style/risk classifier.
    """
    print("\n================ LOCAL MODEL EVALUATION ================")
    print("Task: Fake-news style/risk classification")
    print("Labels:")
    print("  0 = fake-like / suspicious style")
    print("  1 = real-like / credible style")
    print("Note: These metrics do not prove factual truth.")
    print("========================================================\n")

    print(f"Accuracy:             {metrics['accuracy']:.4f}")
    print(f"Macro F1:             {metrics['macro_f1']:.4f}")
    print(f"Weighted F1:          {metrics['weighted_f1']:.4f}")

    print("\nReal-like Class:")
    print(f"  Precision:          {metrics['precision_real_like']:.4f}")
    print(f"  Recall:             {metrics['recall_real_like']:.4f}")
    print(f"  F1:                 {metrics['f1_real_like']:.4f}")

    print("\nFake-like Class:")
    print(f"  Precision:          {metrics['precision_fake_like']:.4f}")
    print(f"  Recall:             {metrics['recall_fake_like']:.4f}")
    print(f"  F1:                 {metrics['f1_fake_like']:.4f}")

    cm = np.array(metrics["confusion_matrix"])

    print("\nConfusion Matrix")
    print("Rows = True label, Columns = Predicted label")
    print()
    print("                  Pred Fake-like   Pred Real-like")
    print(f"True Fake-like:    {cm[0][0]:<16} {cm[0][1]}")
    print(f"True Real-like:    {cm[1][0]:<16} {cm[1][1]}")

    print("\nClassification Report:")
    print(metrics["report"])

