"""Gemini adapter for structuring evidence from retrieved web context."""

from __future__ import annotations

import json
import re
from typing import Any

from packages.backend.fnd.domain.entities import (
    EvidenceAnalysis,
    EvidenceItem,
    SearchContext,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    SourceType,
)

GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


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


def normalize_verdict(value: Any) -> FinalVerdict:
    verdict = str(value or "").strip().upper()

    if verdict in {"REAL", "TRUE", "SUPPORTED"}:
        return FinalVerdict.REAL
    if verdict in {"FAKE", "FALSE", "CONTRADICTED"}:
        return FinalVerdict.FAKE
    if verdict == "ERROR":
        return FinalVerdict.ERROR

    return FinalVerdict.UNVERIFIED


def normalize_quality(value: Any) -> EvidenceQuality:
    quality = str(value or "").strip().upper()
    if quality == EvidenceQuality.HIGH.value:
        return EvidenceQuality.HIGH
    if quality == EvidenceQuality.MEDIUM.value:
        return EvidenceQuality.MEDIUM
    return EvidenceQuality.LOW


def snippet_leads_to_evidence_items(
    search_context: SearchContext,
) -> tuple[EvidenceItem, ...]:
    """Represent search snippets as leads so policy cannot treat them as proof."""

    return tuple(
        EvidenceItem(
            url=result.url,
            title=result.title,
            publisher="",
            source_type=SourceType.UNKNOWN,
            stance=EvidenceStance.MENTIONS,
            reliability=EvidenceQuality.LOW,
            fetched=False,
            direct=False,
            mentions_only=True,
            page_text=result.snippet,
        )
        for result in search_context.results
    )


class GeminiEvidenceProvider:
    def __init__(
        self,
        api_key: str | None,
        model_name: str = "gemini-2.5-flash",
    ) -> None:
        self.api_key = api_key
        self.model_name = model_name

    def verify(
        self, claim_text: str, search_context: SearchContext
    ) -> EvidenceAnalysis:
        if not self.api_key:
            return EvidenceAnalysis(
                provider_name="gemini",
                verdict=FinalVerdict.ERROR,
                evidence_quality=EvidenceQuality.LOW,
                explanation="Gemini API key is missing.",
                recommendation=(
                    "Fill GEMINI_API_KEY in .env (or set GOOGLE_API_KEY) and run "
                    "with --deep-check again."
                ),
                items=snippet_leads_to_evidence_items(search_context),
                raw_context=search_context.raw_context,
                error="GEMINI_API_KEY_MISSING",
            )

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
"""{search_context.raw_context}"""
'''.strip()

        try:
            from openai import OpenAI

            client = OpenAI(api_key=self.api_key, base_url=GEMINI_OPENAI_BASE_URL)
            response = client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
            )

            output = response.choices[0].message.content or ""
            parsed = parse_ai_json(output)

            verdict = normalize_verdict(parsed.get("verdict"))
            quality = normalize_quality(
                parsed.get("evidence_quality", parsed.get("confidence"))
            )

            evidence_summary = parsed.get("evidence_summary", [])
            if not isinstance(evidence_summary, list):
                evidence_summary = [str(evidence_summary)]

            if verdict == FinalVerdict.UNVERIFIED and quality == EvidenceQuality.HIGH:
                quality = EvidenceQuality.LOW

            return EvidenceAnalysis(
                provider_name="gemini",
                verdict=verdict,
                evidence_quality=quality,
                explanation=str(parsed.get("explanation", "")).strip()
                or "No explanation returned.",
                evidence_summary=tuple(
                    str(item).strip() for item in evidence_summary if str(item).strip()
                ),
                recommendation=str(parsed.get("recommendation", "")).strip()
                or "Manual review recommended.",
                items=snippet_leads_to_evidence_items(search_context),
                raw_context=search_context.raw_context,
            )

        except Exception as exc:
            error_message = str(exc)
            if len(error_message) > 700:
                error_message = error_message[:700] + "..."

            return EvidenceAnalysis(
                provider_name="gemini",
                verdict=FinalVerdict.ERROR,
                evidence_quality=EvidenceQuality.LOW,
                explanation=f"Gemini verification failed: {error_message}",
                recommendation=(
                    "Check GEMINI_API_KEY, model name, API quota, and internet access."
                ),
                items=snippet_leads_to_evidence_items(search_context),
                raw_context=search_context.raw_context,
                error="GEMINI_VERIFICATION_FAILED",
            )
