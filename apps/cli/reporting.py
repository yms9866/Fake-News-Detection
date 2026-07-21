"""CLI reporting for analysis results."""

from __future__ import annotations

from packages.backend.fnd.domain.entities import (
    AnalysisResult,
    input_type_label,
    truncate_for_display,
)
from packages.backend.fnd.domain.enums import StyleRiskSignal


def _format_confidence(confidence: float | None) -> str:
    if confidence is None:
        return "N/A"
    return f"{confidence:.2%}"


def _input_type_label(result: AnalysisResult) -> str:
    label = input_type_label(result.document.input_type)
    suffix = result.document.metadata.get("suffix")
    if suffix:
        return f"{label} ({suffix})"
    return label


def _style_signal_label(result: AnalysisResult) -> str:
    return result.style.signal.value.replace("_", " ")


def print_analysis_report(result: AnalysisResult, deep_check: bool) -> None:
    text = result.document.text

    print(f'\nExtracted Text Preview:\n"{truncate_for_display(text, 170)}"\n')

    print("--- LAYER 1: Local Style/Risk Analysis ---")
    if result.style.signal == StyleRiskSignal.ERROR:
        print("ML Signal:        ERROR")
        print("Style Confidence: N/A")
        if result.style.error:
            print(f"Error:            {result.style.error}")
    else:
        print(f"ML Signal:        {_style_signal_label(result)}")
        print(f"Style Confidence: {_format_confidence(result.style.confidence)}")
        print("Note: This is not factual verification.")
        if result.style.warning:
            print(f"Scope Warning: {result.style.warning}")
    print()

    if deep_check:
        print("--- LAYER 2: Live Web Search & Gemini Verification ---")
        if result.search_context is None:
            print(
                "[Gemini] API key is missing; skipping live web search and Gemini verification."
            )

        evidence = result.evidence
        if evidence is None:
            print("Gemini Verdict:   UNKNOWN")
            print("Evidence Quality: LOW")
            print("Gemini Summary:   Evidence verification did not run.\n")
        else:
            verdict = evidence.verdict.value if evidence.verdict else "UNKNOWN"
            print(f"Gemini Verdict:   {verdict}")
            print(f"Evidence Quality: {evidence.evidence_quality.value}")
            print(f"Gemini Summary:   {evidence.explanation}\n")
    else:
        print("Hint: Add --deep-check to activate web + Gemini factual verification.\n")

    print("\n================ FAKE NEWS DETECTION REPORT ================\n")
    print(f"Input Type: {_input_type_label(result)}")
    print(f'Extracted Text/Claim: "{truncate_for_display(text, 320)}"\n')

    print("Layer 1: Local Style/Risk Analysis")
    print("Method: Fine-tuned ModernBERT/Transformer classifier")
    if result.style.signal == StyleRiskSignal.ERROR:
        print("ML Signal: ERROR")
        print("Style Confidence: N/A")
    else:
        print(f"ML Signal: {_style_signal_label(result)}")
        print(f"Style Confidence: {_format_confidence(result.style.confidence)}")
        print(
            "Interpretation: This layer checks writing/style patterns only. "
            "It does not prove whether the claim is factually true."
        )
        if result.style.warning:
            print(f"Scope Warning: {result.style.warning}")

    if result.evidence is not None:
        evidence = result.evidence
        print("\nLayer 2: Evidence-Based Verification")
        print("Method: Live web search + Gemini")
        print(
            f"Verification Verdict: {evidence.verdict.value if evidence.verdict else 'UNKNOWN'}"
        )
        print(f"Evidence Quality: {evidence.evidence_quality.value}")

        if evidence.evidence_summary:
            print("\nEvidence Summary:")
            for item in evidence.evidence_summary:
                print(f"- {item}")

        print(f"\nAI Reasoning: {evidence.explanation or 'No explanation available.'}")
        print(f"Recommendation: {evidence.recommendation}")

        web_context = (
            result.search_context.raw_context
            if result.search_context is not None
            else evidence.raw_context
        )
        if web_context:
            print("\nWeb Context Used:")
            print(truncate_for_display(web_context, 1400))

    else:
        print("\nLayer 2: Evidence-Based Verification")
        print("Status: Not run. Add --deep-check to verify against web evidence.")

    print("\nFinal Decision")
    print(f"Verdict: {result.final.verdict.value}")
    print(f"Confidence Level: {result.final.confidence.value}")
    print(f"Reason: {result.final.reason}")

    print("\n============================================================\n")
