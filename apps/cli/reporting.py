"""CLI reporting for analysis results."""

from __future__ import annotations

from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    input_type_label,
    truncate_for_display,
)
from packages.backend.fnd.domain.enums import StyleRiskSignal


def _input_type_label(result: AnalysisResult) -> str:
    label = input_type_label(result.document.input_type)
    suffix = result.document.metadata.get("suffix")
    if suffix:
        return f"{label} ({suffix})"
    return label


def _style_signal_label(result: AnalysisResult) -> str:
    return result.style.display_label.replace("_", " ")


def print_analysis_report(result: AnalysisResult, deep_check: bool) -> None:
    text = result.document.text

    print("\n================ FAKE NEWS DETECTION REPORT ================\n")

    print(f"Input Type: {_input_type_label(result)}")
    print(f'Extracted Text/Claim: "{truncate_for_display(text, 320)}"\n')

    # Layer 1
    print("--- LAYER 1: Local Style/Risk Analysis ---")
    print("Method: Fine-tuned ModernBERT/Transformer classifier")

    if result.style.signal == StyleRiskSignal.ERROR:
        print("Style Assessment: ERROR")
        print("Style Signal Strength: N/A")

        if result.style.error:
            print(f"Error: {_friendly_provider_issue(result.style.error)}")
    else:
        print(f"Style Assessment: {result.style.display_text}")
        print(f"Style Label: {_style_signal_label(result)}")
        print(f"Style Signal Strength: {result.style.display_confidence}")
        print(f"Interpretation: {result.style.limitation}")

        if result.style.warning:
            print(f"Scope Warning: {result.style.warning}")

    # Claims
    if result.claims:
        print("\n--- CLAIMS CHECKED ---")

        for claim in result.claims:
            print(
                f"{claim.sequence}. {claim.claim_text} "
                f"[{claim.verification_status.value}, "
                f"{claim.confidence.value}]"
            )

            if claim.explanation:
                print(f"   {claim.explanation}")

    # Layer 2
    print("\n--- LAYER 2: Evidence-Based Verification ---")

    if not deep_check:
        print("Status: Not run.")
        print(
            "Hint: Add --deep-check to activate Gemini Google Search "
            "factual verification."
        )

    elif result.evidence is None:
        print("Status: Gemini verification did not complete.")
        print("Gemini Evidence: UNKNOWN")
        print("Gemini Confidence: LOW")
        print("Evidence Quality: LOW")

    else:
        evidence = result.evidence

        print("Method: Gemini with native Google Search grounding")
        print(
            "Gemini Evidence Assessment: "
            f"{evidence.verdict.value if evidence.verdict else 'UNKNOWN'}"
        )
        print(f"Gemini Confidence: {evidence.confidence.value}")
        print(f"Evidence Quality: {evidence.evidence_quality.value}")

        if evidence.error:
            print(f"Provider Issue: {_friendly_provider_issue(evidence.error)}")

        # Search information
        if result.search_context is not None:
            query_count = len(result.search_context.queries)
            reviewed_count = len(result.search_context.reviewed_sources)

            print("\nGemini Google Search:")
            print(
                "Scope: Gemini searches the live public web with "
                "Google Search grounding."
            )
            print(f"Searches: {query_count}")
            print(f"Reviewed Sources: {reviewed_count}")

            for record in result.search_context.queries[:8]:
                status = "failed" if record.error else "completed"
                print(f"- [{status}] {record.query}")

        if evidence.evidence_summary:
            print("\nEvidence Summary:")

            for summary_item in evidence.evidence_summary:
                print(f"- {summary_item}")

        print(
            "\nAI Reasoning: " f"{evidence.explanation or 'No explanation available.'}"
        )

        if evidence.recommendation:
            print(f"Recommendation: {evidence.recommendation}")

        if evidence.items:
            print("\nRelevant Sources:")

            for item in evidence.items[:5]:
                title = item.title or item.url
                publisher = f" ({item.publisher})" if item.publisher else ""

                qualification = (
                    "qualified"
                    if item.qualification_status == "QUALIFIED"
                    else "not qualified"
                )

                print(
                    f"- {truncate_for_display(title, 110)}{publisher} "
                    f"[{item.stance.value}, "
                    f"{item.reliability.value}, "
                    f"{qualification}]"
                )

                if item.url:
                    print(f"  {item.url}")

                if item.relevant_passages:
                    passage = item.relevant_passages[0].text
                    print("  " + truncate_for_display(passage, 180))

    # Final decision
    print("\n--- FINAL DECISION ---")
    print(f"Verdict: {result.final.verdict.value}")
    print(f"Confidence Level: {result.final.confidence.value}")
    print(f"Reason: {result.final.reason}")

    print("\n============================================================\n")


def _friendly_provider_issue(error: str) -> str:
    code = str(error or "").split(":", 1)[0]
    if code == "GEMINI_API_KEY_MISSING":
        return "Gemini evidence analysis is unavailable because the API key is not configured."
    if code == "EXTERNAL_AI_DISABLED":
        return "External evidence analysis is disabled in this environment."
    return "The evidence service could not complete the review."
