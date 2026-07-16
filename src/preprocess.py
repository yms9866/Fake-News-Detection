"""Text preprocessing using Hugging Face tokenizer for ModernBERT / Transformer models."""

from __future__ import annotations

from typing import Any

from transformers import AutoTokenizer


class TransformerPreprocessor:
    """
    Prepares raw text sequences for Transformer encoder models.

    Default model:
    - answerdotai/ModernBERT-large

    This tokenizer works for ModernBERT, RoBERTa, DeBERTa, BERT, etc.
    """

    def __init__(
        self,
        model_name: str = "answerdotai/ModernBERT-large",
        max_length: int = 1024,
    ):
        self.model_name = model_name
        self.max_length = max_length

        self.tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            use_fast=True,
        )

    def __call__(self, examples: dict[str, list[Any]]) -> dict[str, list[Any]]:
        """
        Tokenize raw text batches.

        Important:
        - We keep longer context than RoBERTa.
        - Start with max_length=1024.
        - Later you can test 2048 if GPU memory allows.
        """

        texts = [
            str(text).strip() if text is not None else ""
            for text in examples["text"]
        ]

        return self.tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
        )