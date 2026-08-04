"""Shared text cleaning used by training and inference."""

from __future__ import annotations

import re


def clean_news_text(text: object) -> str:
    """
    Clean source and formatting artifacts that could cause leakage.

    This cleaning is intentionally light for Transformer models. It mainly removes
    URLs, HTML, Reuters source markers, obvious website boilerplate, and repeated
    whitespace while preserving the article's natural wording.
    """
    if text is None:
        return ""

    cleaned = str(text)

    cleaned = cleaned.replace("&nbsp;", " ")
    cleaned = cleaned.replace("&amp;", "&")
    cleaned = cleaned.replace("&quot;", '"')
    cleaned = cleaned.replace("&#39;", "'")

    cleaned = re.sub(r"<[^>]+>", " ", cleaned)
    cleaned = re.sub(
        r"https?://[^\s]+|www\.[^\s]+",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^\s*[A-Za-z][A-Za-z\s,.'\-]{1,100}" r"\s+\(Reuters\)\s*[-â€“â€”:]\s*",
        "",
        cleaned,
    )
    cleaned = re.sub(
        r"\(\s*Reuters\s*\)",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\bReuters\b",
        " ",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"^\s*"
        r"(VIDEO|WATCH|BREAKING|READ MORE|UPDATE|EXCLUSIVE)"
        r"\s*[:\-â€“â€”]\s*",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )

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
        cleaned = re.sub(
            pattern,
            " ",
            cleaned,
            flags=re.IGNORECASE,
        )

    cleaned = cleaned.replace("\r", " ")
    cleaned = cleaned.replace("\n", " ")
    cleaned = cleaned.replace("\t", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned
