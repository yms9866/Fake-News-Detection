"""Public training helpers. Implementation remains in `src/` for checkpoint compatibility."""

from src.text_cleaning import clean_news_text

__all__ = [
    "TransformerPreprocessor",
    "build_pipeline",
    "clean_news_text",
    "evaluate_predictions",
    "load_fake_news_dataset",
    "load_model",
    "print_metrics",
    "save_model",
]


def __getattr__(name: str):
    if name == "load_fake_news_dataset":
        from src.data_loader import load_fake_news_dataset

        return load_fake_news_dataset
    if name == "evaluate_predictions":
        from src.evaluate import evaluate_predictions

        return evaluate_predictions
    if name == "print_metrics":
        from src.evaluate import print_metrics

        return print_metrics
    if name == "build_pipeline":
        from src.model import build_pipeline

        return build_pipeline
    if name == "load_model":
        from src.model import load_model

        return load_model
    if name == "save_model":
        from src.model import save_model

        return save_model
    if name == "TransformerPreprocessor":
        from src.preprocess import TransformerPreprocessor

        return TransformerPreprocessor
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
