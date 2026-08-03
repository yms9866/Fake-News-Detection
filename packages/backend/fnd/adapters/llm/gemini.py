"""Gemini adapter for structuring evidence from retrieved web context."""

from __future__ import annotations

import json
import re
from typing import Any

from packages.backend.fnd.domain.entities import (
    ClaimAssessment,
    EvidenceAnalysis,
    EvidenceItem,
    SearchContext,
)
from packages.backend.fnd.domain.enums import (
    ClaimStatus,
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
    if quality == EvidenceQuality.UNKNOWN.value:
        return EvidenceQuality.UNKNOWN
    return EvidenceQuality.LOW


def normalize_claim_status(value: Any) -> ClaimStatus:
    status = str(value or "").strip().upper()
    aliases = {
        "SUPPORTED": ClaimStatus.SUPPORTED,
        "TRUE": ClaimStatus.SUPPORTED,
        "LIKELY_SUPPORTED": ClaimStatus.LIKELY_SUPPORTED,
        "PARTIALLY_SUPPORTED": ClaimStatus.LIKELY_SUPPORTED,
        "CONTRADICTED": ClaimStatus.CONTRADICTED,
        "FALSE": ClaimStatus.CONTRADICTED,
        "LIKELY_CONTRADICTED": ClaimStatus.LIKELY_CONTRADICTED,
        "MIXED": ClaimStatus.MIXED,
        "INSUFFICIENT_EVIDENCE": ClaimStatus.INSUFFICIENT_EVIDENCE,
        "UNKNOWN": ClaimStatus.INSUFFICIENT_EVIDENCE,
        "NOT_VERIFIABLE": ClaimStatus.NOT_VERIFIABLE,
    }
    return aliases.get(status, ClaimStatus.INSUFFICIENT_EVIDENCE)


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


def context_evidence_items(search_context: SearchContext) -> tuple[EvidenceItem, ...]:
    if search_context.reviewed_sources:
        return search_context.reviewed_sources
    return snippet_leads_to_evidence_items(search_context)


def parse_claim_assessments(value: Any) -> tuple[ClaimAssessment, ...]:
    if not isinstance(value, list):
        return ()

    assessments: list[ClaimAssessment] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        claim_id = str(item.get("claim_id") or "").strip()
        if not claim_id:
            continue
        supporting = item.get("supporting_source_ids", [])
        contradicting = item.get("contradicting_source_ids", [])
        assessments.append(
            ClaimAssessment(
                claim_id=claim_id,
                verdict=normalize_claim_status(item.get("verdict")),
                confidence=normalize_quality(item.get("confidence")),
                explanation=str(item.get("explanation") or "").strip(),
                supporting_source_ids=(
                    tuple(str(source_id) for source_id in supporting)
                    if isinstance(supporting, list)
                    else ()
                ),
                contradicting_source_ids=(
                    tuple(str(source_id) for source_id in contradicting)
                    if isinstance(contradicting, list)
                    else ()
                ),
                unresolved_reason=str(item.get("unresolved_reason") or "").strip()
                or None,
            )
        )
    return tuple(assessments)


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
                confidence=EvidenceQuality.LOW,
                explanation="Gemini API key is missing.",
                recommendation=(
                    "Fill GEMINI_API_KEY in .env (or set GOOGLE_API_KEY) and run "
                    "with --deep-check again."
                ),
                items=context_evidence_items(search_context),
                raw_context=search_context.raw_context,
                error="GEMINI_API_KEY_MISSING",
            )

        system_prompt = """
You are an evidence-first fact-checking assistant.

You receive:
1. Atomic factual claims extracted from a text.
2. Public-web searches performed for those claims.
3. Reviewed source records with URLs, reliability labels, fetch status, stance, and passages.

Rules:
- Analyze only the provided reviewed source records and passages.
- Search snippets and unfetched pages are discovery leads only, not confirmed evidence.
- If the reviewed evidence is irrelevant, weak, missing, or search failed, return UNKNOWN.
- Do not treat professional writing style as evidence of truth.
- Do not invent facts, sources, URLs, names, or dates.
- If the claim mentions a government/person/company announcement, prefer official or reputable news evidence.
- If no reliable source confirms the claim, do not mark it REAL.
- Evidence quality means quality/relevance of reviewed evidence, not confidence that the claim is true.
- Keep your evidence assessment separate from the final system verdict.

Return JSON only using exactly this schema:
{
  "verdict": "REAL | FAKE | UNKNOWN",
  "confidence": "HIGH | MEDIUM | LOW",
  "evidence_quality": "HIGH | MEDIUM | LOW",
  "explanation": "short evidence-based explanation",
  "evidence_summary": [
    "short evidence point 1",
    "short evidence point 2"
  ],
  "claims": [
    {
      "claim_id": "claim-1",
      "verdict": "SUPPORTED | LIKELY_SUPPORTED | CONTRADICTED | LIKELY_CONTRADICTED | MIXED | INSUFFICIENT_EVIDENCE | NOT_VERIFIABLE",
      "confidence": "HIGH | MEDIUM | LOW",
      "supporting_source_ids": ["source-1"],
      "contradicting_source_ids": [],
      "explanation": "claim-level explanation",
      "unresolved_reason": null
    }
  ],
  "limitations": ["short limitation"],
  "recommendation": "what the user/system should do"
}
""".strip()

        user_prompt = f'''
Claim/article:
"""{claim_text}"""

Reviewed public-web evidence context:
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
            confidence = normalize_quality(parsed.get("confidence"))

            evidence_summary = parsed.get("evidence_summary", [])
            if not isinstance(evidence_summary, list):
                evidence_summary = [str(evidence_summary)]

            if verdict == FinalVerdict.UNVERIFIED and quality == EvidenceQuality.HIGH:
                quality = EvidenceQuality.LOW
            if (
                verdict == FinalVerdict.UNVERIFIED
                and confidence == EvidenceQuality.HIGH
            ):
                confidence = EvidenceQuality.LOW

            limitations = parsed.get("limitations", [])
            if not isinstance(limitations, list):
                limitations = [str(limitations)]

            return EvidenceAnalysis(
                provider_name="gemini",
                verdict=verdict,
                evidence_quality=quality,
                confidence=confidence,
                explanation=str(parsed.get("explanation", "")).strip()
                or "No explanation returned.",
                evidence_summary=tuple(
                    str(item).strip() for item in evidence_summary if str(item).strip()
                ),
                recommendation=str(parsed.get("recommendation", "")).strip()
                or "Manual review recommended.",
                items=context_evidence_items(search_context),
                claim_assessments=parse_claim_assessments(parsed.get("claims")),
                grounding_used=bool(search_context.reviewed_sources),
                limitations=tuple(
                    str(item).strip() for item in limitations if str(item).strip()
                ),
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
                confidence=EvidenceQuality.LOW,
                explanation="The evidence service could not complete the review.",
                recommendation=(
                    "Check GEMINI_API_KEY, model name, API quota, and internet access."
                ),
                items=context_evidence_items(search_context),
                raw_context=search_context.raw_context,
                error=f"GEMINI_VERIFICATION_FAILED: {error_message}",
            )
