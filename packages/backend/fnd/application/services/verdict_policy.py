"""Deterministic final verdict policy.

The policy is intentionally stricter than provider outputs. Search snippets,
mentions-only pages, copied reports, original-claim pages, outdated evidence,
and low-quality sources cannot become definitive REAL or FAKE verdicts.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from packages.backend.fnd.domain.entities import (
    EvidenceAnalysis,
    EvidenceItem,
    HIGH_STYLE_RISK_THRESHOLD,
    StyleAnalysis,
    VerdictDecision,
)
from packages.backend.fnd.domain.enums import (
    EvidenceQuality,
    EvidenceStance,
    FinalVerdict,
    SourceType,
    StyleRiskSignal,
)

POLICY_VERSION = "verdict-policy-v1"


def _style_signal_text(style: StyleAnalysis | None) -> str:
    if style is None:
        return StyleRiskSignal.UNKNOWN.value
    return style.signal.value


def _is_eligible_evidence(item: EvidenceItem) -> bool:
    if not item.fetched:
        return False
    if item.reliability == EvidenceQuality.LOW:
        return False
    if item.is_original_claim:
        return False
    if item.mentions_only:
        return False
    if not item.matches_claim:
        return False
    if item.outdated:
        return False
    if item.stance not in {EvidenceStance.SUPPORTS, EvidenceStance.CONTRADICTS}:
        return False
    return True


def _group_evidence(items: list[EvidenceItem]) -> dict[str, list[EvidenceItem]]:
    grouped: dict[str, list[EvidenceItem]] = defaultdict(list)
    for item in items:
        grouped[item.independence_group].append(item)
    return grouped


def _best_quality(items: list[EvidenceItem]) -> EvidenceQuality:
    if any(item.reliability == EvidenceQuality.HIGH for item in items):
        return EvidenceQuality.HIGH
    if any(item.reliability == EvidenceQuality.MEDIUM for item in items):
        return EvidenceQuality.MEDIUM
    return EvidenceQuality.LOW


@dataclass(frozen=True)
class VerdictPolicy:
    version: str = POLICY_VERSION
    high_style_risk_threshold: float = HIGH_STYLE_RISK_THRESHOLD

    def decide(
        self,
        style: StyleAnalysis | None,
        evidence: EvidenceAnalysis | None,
    ) -> VerdictDecision:
        style_signal = _style_signal_text(style)

        if evidence is None:
            return self._verification_not_performed_decision(style, style_signal)

        if evidence.error or evidence.verdict == FinalVerdict.ERROR:
            return VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason=self._verification_failed_reason(style),
                policy_version=self.version,
            )

        eligible = [item for item in evidence.items if _is_eligible_evidence(item)]
        support_items = [
            item for item in eligible if item.stance == EvidenceStance.SUPPORTS
        ]
        contradiction_items = [
            item for item in eligible if item.stance == EvidenceStance.CONTRADICTS
        ]

        support_groups = _group_evidence(support_items)
        contradiction_groups = _group_evidence(contradiction_items)

        if support_groups and contradiction_groups:
            return VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason=(
                    "Credible evidence conflicts. The deterministic policy will not choose "
                    "a definitive verdict without clear authoritative resolution."
                ),
                policy_version=self.version,
            )

        official_contradictions = [
            item
            for item in contradiction_items
            if item.source_type == SourceType.OFFICIAL
            and item.reliability == EvidenceQuality.HIGH
            and item.direct
        ]
        if official_contradictions:
            return VerdictDecision(
                verdict=FinalVerdict.FAKE,
                confidence=EvidenceQuality.HIGH,
                reason=(
                    "A high-quality official source directly contradicts the claim. "
                    "The final verdict is based on deterministic evidence policy."
                ),
                policy_version=self.version,
            )

        if len(support_groups) >= 2:
            confidence = _best_quality(support_items)
            return VerdictDecision(
                verdict=FinalVerdict.REAL,
                confidence=confidence,
                reason=(
                    "At least two independent credible fetched sources directly support "
                    "the claim."
                ),
                policy_version=self.version,
            )

        if len(contradiction_groups) >= 2:
            confidence = _best_quality(contradiction_items)
            return VerdictDecision(
                verdict=FinalVerdict.FAKE,
                confidence=confidence,
                reason=(
                    "At least two independent credible fetched sources directly contradict "
                    "the claim."
                ),
                policy_version=self.version,
            )

        return self._insufficient_evidence_decision(style, style_signal)

    def _is_reliable_high_style_risk(self, style: StyleAnalysis | None) -> bool:
        return (
            style is not None
            and style.signal == StyleRiskSignal.HIGH
            and style.scope_reliable
            and (style.confidence or 0.0) >= self.high_style_risk_threshold
        )

    def _verification_not_performed_decision(
        self,
        style: StyleAnalysis | None,
        style_signal: str,
    ) -> VerdictDecision:
        if style is not None and not style.scope_reliable:
            reason = (
                "The input is too short for reliable article-style analysis, and factual "
                "verification was not performed."
            )
        elif self._is_reliable_high_style_risk(style):
            reason = (
                "Factual verification was not performed. The local style model found a "
                "reliable high-risk writing signal, but style alone cannot establish "
                "whether the claim is false."
            )
        else:
            reason = (
                f"Factual verification was not performed. The local model gave a "
                f"{style_signal} signal, but style is not proof of truth."
            )

        return VerdictDecision(
            verdict=FinalVerdict.UNVERIFIED,
            confidence=EvidenceQuality.LOW,
            reason=reason,
            policy_version=self.version,
        )

    def _insufficient_evidence_decision(
        self,
        style: StyleAnalysis | None,
        style_signal: str,
    ) -> VerdictDecision:
        if style is not None and not style.scope_reliable:
            return VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason=(
                    "The retrieved evidence was insufficient to verify or contradict the "
                    "claim, and the short-input style result is unreliable."
                ),
                policy_version=self.version,
            )

        if self._is_reliable_high_style_risk(style):
            return VerdictDecision(
                verdict=FinalVerdict.SUSPICIOUS_UNVERIFIED,
                confidence=EvidenceQuality.MEDIUM,
                reason=(
                    "The retrieved evidence was insufficient to verify or contradict the "
                    "claim, and the reliable local style signal was high risk."
                ),
                policy_version=self.version,
            )

        return VerdictDecision(
            verdict=FinalVerdict.UNVERIFIED,
            confidence=EvidenceQuality.LOW,
            reason=(
                "The retrieved evidence was insufficient to verify or contradict the claim. "
                f"The local model gave a {style_signal} signal, but style is not proof "
                "of truth."
            ),
            policy_version=self.version,
        )

    def _verification_failed_reason(self, style: StyleAnalysis | None) -> str:
        if style is not None and not style.scope_reliable:
            return (
                "Factual verification could not be completed, and the short-input style "
                "result is unreliable."
            )

        return (
            "Factual verification could not be completed. The local style signal is not "
            "enough to verify factual truth."
        )
