#!/usr/bin/env python3
"""Train a ModernBERT fake-news style/risk classifier using Hugging Face Trainer."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import numpy as np
import torch
from transformers import Trainer, TrainingArguments, DataCollatorWithPadding

from packages.ml import (
    TransformerPreprocessor,
    build_pipeline,
    evaluate_predictions,
    load_fake_news_dataset,
    print_metrics,
    save_model,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train ModernBERT fake-news style/risk classification model"
    )

    parser.add_argument(
        "--dataset",
        choices=["local_master"],
        default="local_master",
        help="Dataset routing name. Default: local_master",
    )

    parser.add_argument(
        "--model-name",
        type=str,
        default="answerdotai/ModernBERT-large",
        help="Hugging Face model name. Default: answerdotai/ModernBERT-large",
    )

    parser.add_argument(
        "--max-samples",
        type=int,
        default=None,
        help="Limit samples per split for quick experiments.",
    )

    parser.add_argument(
        "--max-length",
        type=int,
        default=1024,
        help="Maximum token length. Start with 1024. Try 2048 later if GPU memory allows.",
    )

    parser.add_argument(
        "--epochs",
        type=int,
        default=3,
        help="Number of training epochs. Default: 3",
    )

    parser.add_argument(
        "--batch-size",
        type=int,
        default=1,
        help="Batch size per GPU. For ModernBERT-large, start with 1 or 2.",
    )

    parser.add_argument(
        "--grad-accum",
        type=int,
        default=8,
        help="Gradient accumulation steps. Helps simulate a larger batch size.",
    )

    parser.add_argument(
        "--learning-rate",
        type=float,
        default=2e-5,
        help="Learning rate. Default: 2e-5",
    )

    # SECURE DEFAULT: Points directly to your persistent Google Drive storage
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/content/drive/MyDrive/modernbert_fake_news_512"),
        help="Directory to save trained model.",
    )

    return parser.parse_args()


def compute_metrics(eval_pred) -> dict:
    """
    Metrics function used during Trainer evaluation.

    Hugging Face passes:
    - logits
    - labels
    """
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=1)

    metrics = evaluate_predictions(labels, preds)

    return {
        "accuracy": metrics["accuracy"],
        "macro_f1": metrics["macro_f1"],
        "weighted_f1": metrics["weighted_f1"],
        "f1_real_like": metrics["f1_real_like"],
        "f1_fake_like": metrics["f1_fake_like"],
    }


def main() -> None:
    

    args = parse_args()

    print("====================================================")
    print("Training Local Fake-News Style/Risk Classifier")
    print("====================================================")
    print(f"Model:       {args.model_name}")
    print(f"Max length:  {args.max_length}")
    print(f"Batch size:  {args.batch_size}")
    print(f"Grad accum:  {args.grad_accum}")
    print(f"Epochs:      {args.epochs}")
    print(f"Output:      {args.output}")
    print("====================================================\n")

    if not torch.cuda.is_available():
        print("?? CUDA GPU not detected. Training ModernBERT-large on CPU will be very slow.")
    else:
        print(f"? CUDA GPU detected: {torch.cuda.get_device_name(0)}")

    print(f"\nLoading dataset: {args.dataset}")

    dataset_dict = load_fake_news_dataset(
        name=args.dataset,
        max_samples=args.max_samples,
    )

    print(
        f"Train: {len(dataset_dict['train']):,} | "
        f"Val: {len(dataset_dict['validation']):,} | "
        f"Test: {len(dataset_dict['test']):,}"
    )

    print(f"\nInitializing tokenizer/preprocessor for {args.model_name}...")

    preprocessor = TransformerPreprocessor(
        model_name=args.model_name,
        max_length=args.max_length,
    )

    print("\nTokenizing dataset...")

    tokenized_ds = dataset_dict.map(
        preprocessor,
        batched=True,
        remove_columns=["text"],
    )

    print("\nBuilding ModernBERT sequence classification model...")

    model = build_pipeline(
        model_name=args.model_name,
        num_labels=2,
    )

    data_collator = DataCollatorWithPadding(
        tokenizer=preprocessor.tokenizer,
        padding="longest",
    )

    training_args = TrainingArguments(
    output_dir=str(args.output),

    learning_rate=args.learning_rate,
    weight_decay=0.01,
    num_train_epochs=args.epochs,

    per_device_train_batch_size=args.batch_size,
    per_device_eval_batch_size=args.batch_size,
    gradient_accumulation_steps=args.grad_accum,

    # MODIFIED FOR STEP-BASED SAVING:
    eval_strategy="steps",       # Evaluate model every X steps
    eval_steps=500,              # How often to run evaluation
    save_strategy="steps",       # Save checkpoints every X steps
    save_steps=500,              # How often to save a checkpoint to Drive

    load_best_model_at_end=True,
    metric_for_best_model="macro_f1",
    greater_is_better=True,

    fp16=torch.cuda.is_available(),
    bf16=False,

    save_total_limit=2,
    report_to="none",

    remove_unused_columns=True,
)


    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_ds["train"],
        eval_dataset=tokenized_ds["validation"],
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )

    # AUTOMATION: Smart checkpoint discovery scan
    checkpoint_exists = False
    if os.path.exists(args.output):
        try:
            checkpoints = [d for d in os.listdir(args.output) if d.startswith("checkpoint-")]
            if len(checkpoints) > 0:
                checkpoint_exists = True
        except Exception:
            pass

    print("\n🚀 Training ModernBERT style/risk classifier...")
    
    if checkpoint_exists:
        print("🔄 Found existing checkpoints in Google Drive! Resuming training...")
        trainer.train(resume_from_checkpoint=True)
    else:
        print("🌱 No checkpoints found. Starting a fresh training run...")
        trainer.train()

    print("\n--- Validation Evaluation ---")
    val_predictions = trainer.predict(tokenized_ds["validation"])
    y_val_pred = np.argmax(val_predictions.predictions, axis=1)
    y_val_true = np.array(tokenized_ds["validation"]["label"])

    val_metrics = evaluate_predictions(y_val_true, y_val_pred)
    print_metrics(val_metrics)

    print("\n--- Test Evaluation ---")
    test_predictions = trainer.predict(tokenized_ds["test"])
    y_test_pred = np.argmax(test_predictions.predictions, axis=1)
    y_test_true = np.array(tokenized_ds["test"]["label"])

    test_metrics = evaluate_predictions(y_test_true, y_test_pred)
    print_metrics(test_metrics)

    save_model(
        model=trainer.model,
        tokenizer=preprocessor.tokenizer,
        path=args.output,
    )

    print(f"\n? Model and tokenizer saved to: {args.output}")
    print("\nImportant:")
    print("This trained model is a local style/risk classifier.")
    print("Use Gemini + web verification for the final factual verdict.")


if __name__ == "__main__":
    main()
