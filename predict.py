#!/usr/bin/env python3
"""Fake news prediction pipeline with local ModernBERT-style signal + Gemini evidence verification."""

from __future__ import annotations

import argparse
from datetime import date
import json
import os
import platform
import re
from pathlib import Path
from typing import Any

import cv2
import requests
import torch
import torch.nn.functional as F
import whisper
from bs4 import BeautifulSoup
from openai import OpenAI
from PIL import Image
import pytesseract

from src.model import load_model

try:
    from ddgs import DDGS
except ImportError:
    from duckduckgo_search import DDGS


GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
PROJECT_ROOT = Path(__file__).resolve().parent
ENV_FILE = PROJECT_ROOT / ".env"
MIN_LOCAL_STYLE_WORDS = 20

if platform.system() == "Windows":
    pytesseract.pytesseract.tesseract_cmd = r"C:\\Program Files\\Tesseract-OCR\\tesseract.exe"


def parse_args() -> argparse.Namespace:
    load_env_file()

    parser = argparse.ArgumentParser(
        description="Predict fake-news risk using a local Transformer style/risk model and Gemini evidence verification."
    )

    parser.add_argument("--model", type=Path, default=Path("models/modernbert_fake_news_512"))
    parser.add_argument("--text", type=str, default=None)
    parser.add_argument("--url", type=str, default=None)
    parser.add_argument("--file", type=Path, default=None)
    parser.add_argument("--deep-check", action="store_true")
    parser.add_argument("--gemini-model", type=str, default=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
    parser.add_argument("--max-search-results", type=int, default=6)
    parser.add_argument("--max-length", type=int, default=1024)

    return parser.parse_args()


def normalize_text(text: str) -> str:
    text = str(text or "")
    text = text.replace("\n", " ").replace("\t", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def load_env_file(path: Path = ENV_FILE) -> None:
    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


def truncate_for_display(text: str, limit: int = 220) -> str:
    text = normalize_text(text)
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def local_label_to_signal(verdict: str | None) -> str:
    if verdict == "REAL":
        return "LOW STYLE RISK"
    if verdict == "FAKE":
        return "HIGH STYLE RISK"
    return "UNKNOWN"


def count_words(text: str) -> int:
    return len(normalize_text(text).split())


def local_style_scope_warning(text: str) -> str | None:
    word_count = count_words(text)

    if word_count >= MIN_LOCAL_STYLE_WORDS:
        return None

    word_label = "word" if word_count == 1 else "words"
    return (
        f"Short input ({word_count} {word_label}). The local model is an article-style "
        "classifier, so this score is unreliable for factual verification. Use --deep-check."
    )


def make_search_query(text: str, max_words: int = 32) -> str:
    text = normalize_text(text)
    text = re.sub(r"https?://\S+|www\.\S+", " ", text)
    words = text.split()
    base_query = " ".join(words[:max_words]).strip(" \"'")

    if not base_query:
        return "fact check official source"

    return f"{base_query} fact check official source {date.today().isoformat()}"


def get_gemini_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def missing_gemini_key_result() -> dict[str, Any]:
    return {
        "verdict": "ERROR",
        "evidence_quality": "LOW",
        "explanation": "Gemini API key is missing.",
        "evidence_summary": [],
        "recommendation": (
            "Fill GEMINI_API_KEY in .env (or set GOOGLE_API_KEY) and run with --deep-check again."
        ),
    }


def parse_ai_json(raw_output: str) -> dict[str, Any]:
    raw_output = (raw_output or "").strip()
    raw_output = re.sub(r"^```(?:json)?", "", raw_output, flags=re.IGNORECASE).strip()
    raw_output = re.sub(r"```$", "", raw_output).strip()

    try:
        return json.loads(raw_output)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", raw_output, flags=re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return {
        "verdict": "UNKNOWN",
        "evidence_quality": "LOW",
        "explanation": raw_output or "Gemini returned an empty or unparsable response.",
        "evidence_summary": [],
        "recommendation": "Manual review recommended.",
    }


def normalize_verdict(value: Any) -> str:
    verdict = str(value or "").strip().upper()

    if verdict in {"REAL", "TRUE", "SUPPORTED"}:
        return "REAL"
    if verdict in {"FAKE", "FALSE", "CONTRADICTED"}:
        return "FAKE"
    if verdict in {"UNKNOWN", "UNCERTAIN", "UNVERIFIED", "NOT ENOUGH EVIDENCE"}:
        return "UNKNOWN"
    if verdict == "ERROR":
        return "ERROR"

    return "UNKNOWN"


def normalize_quality(value: Any) -> str:
    quality = str(value or "").strip().upper()
    if quality in {"HIGH", "MEDIUM", "LOW"}:
        return quality
    return "LOW"


def extract_text_from_url(url: str) -> str:
    print(f"[URL] Fetching and parsing HTML from: {url}")

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
        )
    }

    response = requests.get(url, headers=headers, timeout=20)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
    extracted_text = normalize_text(" ".join(p for p in paragraphs if p))

    if not extracted_text:
        raise ValueError("Failed to extract readable text from the provided URL.")

    return extracted_text


def extract_text_from_image(image_path: Path) -> str:
    print(f"[OCR] Reading image text from: {image_path.name}")

    if platform.system() == "Windows":
        if not os.path.exists(pytesseract.pytesseract.tesseract_cmd):
            raise FileNotFoundError(f"Tesseract executable not found at '{pytesseract.pytesseract.tesseract_cmd}'.")

    img = Image.open(image_path)
    text = normalize_text(pytesseract.image_to_string(img))

    if not text:
        raise ValueError("OCR finished but found no readable text in the image.")

    return text


def extract_text_from_audio(audio_path: Path) -> str:
    print(f"[Audio] Transcribing with Whisper base model: {audio_path.name}")
    model = whisper.load_model("base")
    result = model.transcribe(str(audio_path))
    return normalize_text(result.get("text", ""))


def extract_text_from_video(video_path: Path) -> str:
    print(f"[Video] Processing video file: {video_path.name}")

    try:
        audio_text = extract_text_from_audio(video_path)
        if audio_text:
            return audio_text
    except Exception as audio_err:
        print(f"[Video] Audio transcription failed: {audio_err}")
        print("[Video] Falling back to frame OCR.")

    cap = cv2.VideoCapture(str(video_path))
    frame_rate = cap.get(cv2.CAP_PROP_FPS)

    if frame_rate <= 0:
        cap.release()
        raise ValueError("Invalid video file or unable to read frame rate.")

    text_samples: list[str] = []
    count = 0
    sample_every = max(int(frame_rate), 1)

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        if count % sample_every == 0:
            pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            frame_text = normalize_text(pytesseract.image_to_string(pil_img))

            if frame_text and frame_text not in text_samples:
                text_samples.append(frame_text)

        count += 1

    cap.release()

    extracted_text = normalize_text(" ".join(text_samples))

    if not extracted_text:
        raise ValueError("Video analysis failed: no usable audio or readable frame text found.")

    return extracted_text


def read_input_text(args: argparse.Namespace) -> str:
    if args.text:
        return normalize_text(args.text)

    if args.url:
        return extract_text_from_url(args.url)

    if args.file:
        if not args.file.exists():
            raise SystemExit(f"[ERROR] Input file does not exist: {args.file}")

        suffix = args.file.suffix.lower()

        if suffix in {".txt", ".csv"}:
            return normalize_text(args.file.read_text(encoding="utf-8", errors="ignore"))

        if suffix in {".png", ".jpg", ".jpeg", ".tiff", ".bmp"}:
            return extract_text_from_image(args.file)

        if suffix in {".mp3", ".wav", ".m4a", ".flac"}:
            return extract_text_from_audio(args.file)

        if suffix in {".mp4", ".avi", ".mkv", ".mov"}:
            return extract_text_from_video(args.file)

        raise SystemExit(f"[ERROR] Unsupported file extension: {suffix}")

    raise SystemExit("[ERROR] You must provide --text, --url, or --file.")


def predict_local_style_signal(text: str, model_path: Path, max_length: int = 1024) -> tuple[str, float]:
    """
    Internal labels:
    - REAL = low-risk style similar to real training articles
    - FAKE = high-risk style similar to fake training articles

    This is not final factual truth.
    """
    model, tokenizer = load_model(model_path)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model.to(device)
    model.eval()

    inputs = tokenizer(
        text,
        truncation=True,
        padding="max_length",
        max_length=max_length,
        return_tensors="pt",
    ).to(device)

    with torch.no_grad():
        outputs = model(**inputs)
        probabilities = F.softmax(outputs.logits, dim=-1).squeeze(0)

    label = int(torch.argmax(probabilities).item())
    confidence = float(probabilities[label].item())

    internal_verdict = "REAL" if label == 1 else "FAKE"
    return internal_verdict, confidence


def search_web_context(query_text: str, max_results: int = 6) -> str:
    print("[Web] Searching live web for evidence and fact-checks.")

    search_query = make_search_query(query_text)
    snippets: list[str] = []

    try:
        with DDGS() as ddgs:
            results = ddgs.text(search_query, max_results=max_results)

            for index, result in enumerate(results, start=1):
                title = result.get("title", "No title")
                body = result.get("body", "No snippet")
                href = result.get("href", "No URL")

                snippets.append(
                    f"[Source {index}]\n"
                    f"Title: {title}\n"
                    f"Snippet: {body}\n"
                    f"URL: {href}\n"
                )

    except Exception as e:
        return f"WEB_SEARCH_ERROR: {str(e)}"

    if not snippets:
        return "NO_RESULTS: No relevant live web search results found for this claim."

    return "\n---\n".join(snippets)


def evaluate_with_gemini(claim_text: str, web_context: str, model_name: str) -> dict[str, Any]:
    print("[Gemini] Verifying claim against retrieved evidence.")

    api_key = get_gemini_api_key()

    if not api_key:
        return missing_gemini_key_result()

    client = OpenAI(api_key=api_key, base_url=GEMINI_OPENAI_BASE_URL)

    system_prompt = """
You are an evidence-first fact-checking assistant.

You receive:
1. A claim or article text.
2. Web search snippets containing titles, snippets, and URLs.

Rules:
- Decide whether the claim is REAL, FAKE, or UNKNOWN.
- Use only the provided web context.
- If the web context is irrelevant, weak, missing, or search failed, return UNKNOWN.
- Do not treat professional writing style as evidence of truth.
- Do not invent facts, sources, URLs, names, or dates.
- If the claim mentions a government/person/company announcement, prefer official or reputable news evidence.
- If no reliable source confirms the claim, do not mark it REAL.
- Evidence quality means quality/relevance of the retrieved evidence, not confidence that the claim is true.

Return JSON only using exactly this schema:
{
  "verdict": "REAL | FAKE | UNKNOWN",
  "evidence_quality": "HIGH | MEDIUM | LOW",
  "explanation": "short evidence-based explanation",
  "evidence_summary": [
    "short evidence point 1",
    "short evidence point 2"
  ],
  "recommendation": "what the user/system should do"
}
""".strip()

    user_prompt = f'''
Claim/article:
"""{claim_text}"""

Web search context:
"""{web_context}"""
'''.strip()

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.0,
        )

        output = response.choices[0].message.content or ""
        parsed = parse_ai_json(output)

        verdict = normalize_verdict(parsed.get("verdict"))
        evidence_quality = normalize_quality(parsed.get("evidence_quality", parsed.get("confidence")))

        evidence_summary = parsed.get("evidence_summary", [])
        if not isinstance(evidence_summary, list):
            evidence_summary = [str(evidence_summary)]

        if verdict == "UNKNOWN":
            evidence_quality = "LOW" if evidence_quality == "HIGH" else evidence_quality

        return {
            "verdict": verdict,
            "evidence_quality": evidence_quality,
            "explanation": str(parsed.get("explanation", "")).strip() or "No explanation returned.",
            "evidence_summary": [str(item).strip() for item in evidence_summary if str(item).strip()],
            "recommendation": str(parsed.get("recommendation", "")).strip() or "Manual review recommended.",
        }

    except Exception as e:
        error_message = str(e)
        if len(error_message) > 700:
            error_message = error_message[:700] + "..."

        return {
            "verdict": "ERROR",
            "evidence_quality": "LOW",
            "explanation": f"Gemini verification failed: {error_message}",
            "evidence_summary": [],
            "recommendation": "Check GEMINI_API_KEY, model name, API quota, and internet access.",
        }


def decide_final_verdict(
    ml_verdict: str | None,
    ml_confidence: float | None,
    ai_result: dict[str, Any] | None,
) -> dict[str, str]:
    style_signal = local_label_to_signal(ml_verdict)

    if ai_result is None:
        return {
            "verdict": "UNVERIFIED",
            "confidence": "LOW",
            "reason": (
                f"Only the local style/risk model was used. It produced a {style_signal} signal, "
                "but factual verification was not performed."
            ),
        }

    ai_verdict = normalize_verdict(ai_result.get("verdict"))
    evidence_quality = normalize_quality(ai_result.get("evidence_quality"))

    if ai_verdict == "REAL":
        return {
            "verdict": "REAL",
            "confidence": evidence_quality,
            "reason": (
                "Retrieved evidence supports the claim. The final verdict is based on web/Gemini verification, "
                "not only local style."
            ),
        }

    if ai_verdict == "FAKE":
        return {
            "verdict": "FAKE",
            "confidence": evidence_quality,
            "reason": "Retrieved evidence contradicts or debunks the claim. The final verdict prioritizes evidence verification.",
        }

    if ai_verdict == "ERROR":
        return {
            "verdict": "UNVERIFIED",
            "confidence": "LOW",
            "reason": (
                f"Evidence verification failed. The local model gave a {style_signal} signal, "
                "but this is not enough to verify factual truth."
            ),
        }

    if ml_verdict == "FAKE" and (ml_confidence or 0.0) >= 0.80:
        return {
            "verdict": "SUSPICIOUS / UNVERIFIED",
            "confidence": "MEDIUM",
            "reason": (
                "The web/Gemini layer could not verify the claim, and the local model found strong fake-like writing patterns. "
                "Manual review is recommended."
            ),
        }

    return {
        "verdict": "UNVERIFIED",
        "confidence": "LOW",
        "reason": (
            f"The web/Gemini layer could not confirm the claim. The local model gave a {style_signal} signal, "
            "but style is not proof of truth."
        ),
    }


def print_final_report(
    input_type: str,
    text: str,
    ml_verdict: str | None,
    ml_confidence: float | None,
    web_context: str | None,
    ai_result: dict[str, Any] | None,
    final_result: dict[str, str],
) -> None:
    print("\n================ FAKE NEWS DETECTION REPORT ================\n")

    print(f"Input Type: {input_type}")
    print(f'Extracted Text/Claim: "{truncate_for_display(text, 320)}"\n')

    print("Layer 1: Local Style/Risk Analysis")
    print("Method: Fine-tuned ModernBERT/Transformer classifier")

    if ml_verdict is None or ml_confidence is None:
        print("ML Signal: ERROR")
        print("Style Confidence: N/A")
    else:
        print(f"ML Signal: {local_label_to_signal(ml_verdict)}")
        print(f"Style Confidence: {ml_confidence:.2%}")
        print("Interpretation: This layer checks writing/style patterns only. It does not prove whether the claim is factually true.")
        warning = local_style_scope_warning(text)
        if warning:
            print(f"Scope Warning: {warning}")

    if ai_result is not None:
        print("\nLayer 2: Evidence-Based Verification")
        print("Method: Live web search + Gemini")
        print(f"Verification Verdict: {ai_result.get('verdict', 'UNKNOWN')}")
        print(f"Evidence Quality: {ai_result.get('evidence_quality', 'LOW')}")

        evidence_summary = ai_result.get("evidence_summary", [])
        if evidence_summary:
            print("\nEvidence Summary:")
            for item in evidence_summary:
                print(f"- {item}")

        print(f"\nAI Reasoning: {ai_result.get('explanation', 'No explanation available.')}")
        print(f"Recommendation: {ai_result.get('recommendation', 'Manual review recommended.')}")

        if web_context:
            print("\nWeb Context Used:")
            print(truncate_for_display(web_context, 1400))

    else:
        print("\nLayer 2: Evidence-Based Verification")
        print("Status: Not run. Add --deep-check to verify against web evidence.")

    print("\nFinal Decision")
    print(f"Verdict: {final_result['verdict']}")
    print(f"Confidence Level: {final_result['confidence']}")
    print(f"Reason: {final_result['reason']}")

    print("\n============================================================\n")


def main() -> None:
    args = parse_args()

    text = read_input_text(args)

    if not text:
        raise SystemExit("[ERROR] Extraction error: extracted text is empty.")

    if args.text:
        input_type = "Direct Text"
    elif args.url:
        input_type = "URL"
    elif args.file:
        input_type = f"File ({args.file.suffix.lower()})"
    else:
        input_type = "Unknown"

    print(f'\nExtracted Text Preview:\n"{truncate_for_display(text, 170)}"\n')

    print("--- LAYER 1: Local Style/Risk Analysis ---")

    ml_verdict: str | None = None
    ml_confidence: float | None = None

    try:
        ml_verdict, ml_confidence = predict_local_style_signal(
            text=text,
            model_path=args.model,
            max_length=args.max_length,
        )

        print(f"ML Signal:        {local_label_to_signal(ml_verdict)}")
        print(f"Style Confidence: {ml_confidence:.2%}")
        print("Note: This is not factual verification.")
        warning = local_style_scope_warning(text)
        if warning:
            print(f"Scope Warning: {warning}")
        print()

    except Exception as e:
        print(f"[ERROR] Local model prediction failed: {e}\n")

    web_context: str | None = None
    ai_result: dict[str, Any] | None = None

    if args.deep_check:
        print("--- LAYER 2: Live Web Search & Gemini Verification ---")

        if not get_gemini_api_key():
            print("[Gemini] API key is missing; skipping live web search and Gemini verification.")
            ai_result = missing_gemini_key_result()
        else:
            web_context = search_web_context(query_text=text, max_results=args.max_search_results)

            ai_result = evaluate_with_gemini(
                claim_text=text,
                web_context=web_context,
                model_name=args.gemini_model,
            )

        print(f"Gemini Verdict:   {ai_result['verdict']}")
        print(f"Evidence Quality: {ai_result['evidence_quality']}")
        print(f"Gemini Summary:   {ai_result['explanation']}\n")

    else:
        print("Hint: Add --deep-check to activate web + Gemini factual verification.\n")

    final_result = decide_final_verdict(
        ml_verdict=ml_verdict,
        ml_confidence=ml_confidence,
        ai_result=ai_result,
    )

    print_final_report(
        input_type=input_type,
        text=text,
        ml_verdict=ml_verdict,
        ml_confidence=ml_confidence,
        web_context=web_context,
        ai_result=ai_result,
        final_result=final_result,
    )


if __name__ == "__main__":
    main()
