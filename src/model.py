"""ModernBERT / Transformer classification architecture and checkpoint handling."""

from __future__ import annotations

from pathlib import Path

from transformers import AutoModelForSequenceClassification, AutoTokenizer

from src.preprocess import TransformerPreprocessor


DEFAULT_MODEL_NAME = "answerdotai/ModernBERT-large"


def build_pipeline(
    model_name: str = DEFAULT_MODEL_NAME,
    num_labels: int = 2,
) -> AutoModelForSequenceClassification:
    """
    Initialize a pre-trained Transformer encoder model with a sequence classification head.

    Default:
    - answerdotai/ModernBERT-large

    Labels:
    - 0 = fake-like / suspicious style
    - 1 = real-like / credible style

    Important:
    This local model is a style/risk classifier. It should not be treated as
    final factual truth. Final truth should come from evidence verification.
    """
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=num_labels,
    )

    return model


def save_model(
    model: AutoModelForSequenceClassification,
    tokenizer: AutoTokenizer,
    path: str | Path,
) -> None:
    """
    Save the fine-tuned model and tokenizer to local disk.

    The saved folder can later be loaded by predict.py using load_model().
    """
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)

    model.save_pretrained(str(path))
    tokenizer.save_pretrained(str(path))


def load_model(
    path: str | Path,
) -> tuple[AutoModelForSequenceClassification, AutoTokenizer]:
    """
    Load a saved fine-tuned Transformer model and tokenizer from local disk.

    Example path:
    - models/modernbert_fake_news
    """
    path = str(path)

    model = AutoModelForSequenceClassification.from_pretrained(path)
    tokenizer = AutoTokenizer.from_pretrained(path, use_fast=True)

    return model, tokenizer


def preprocess_for_training(
    examples: dict,
    preprocessor: TransformerPreprocessor,
) -> dict:
    """
    Tokenize raw text dictionaries for Transformer input streams.

    The preprocessor controls:
    - tokenizer model name
    - max_length
    - padding/truncation
    """
    return preprocessor(examples)