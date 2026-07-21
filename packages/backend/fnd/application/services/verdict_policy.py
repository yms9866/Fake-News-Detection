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


def _is_strong_high_style_risk(style: StyleAnalysis | None) -> bool:
    return (
        style is not None
        and style.signal == StyleRiskSignal.HIGH
        and (style.confidence or 0.0) >= 0.80
    )


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

    def decide(
        self,
        style: StyleAnalysis | None,
        evidence: EvidenceAnalysis | None,
    ) -> VerdictDecision:
        style_signal = _style_signal_text(style)

        if evidence is None:
            return self._no_evidence_decision(style, style_signal)

        if evidence.error:
            return VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason=(
                    f"Evidence verification failed. The local model gave a {style_signal} "
                    "signal, but this is not enough to verify factual truth."
                ),
                policy_version=self.version,
            )

        if evidence.evidence_quality == EvidenceQuality.LOW:
            if _is_strong_high_style_risk(style):
                return VerdictDecision(
                    verdict=FinalVerdict.SUSPICIOUS_UNVERIFIED,
                    confidence=EvidenceQuality.MEDIUM,
                    reason=(
                        "Evidence quality is low, and the local model found strong high-risk "
                        "writing patterns. Manual review is recommended."
                    ),
                    policy_version=self.version,
                )

            return VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason=(
                    f"Evidence quality is low. The local model gave a {style_signal} "
                    "signal, but style is not proof of truth."
                ),
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

        if eligible:
            return VerdictDecision(
                verdict=FinalVerdict.UNVERIFIED,
                confidence=EvidenceQuality.LOW,
                reason=(
                    "Some relevant evidence was found, but it is not strong or independent "
                    "enough for a definitive verdict."
                ),
                policy_version=self.version,
            )

        return self._no_evidence_decision(style, style_signal)

    def _no_evidence_decision(
        self,
        style: StyleAnalysis | None,
        style_signal: str,
    ) -> VerdictDecision:
        if _is_strong_high_style_risk(style):
            return VerdictDecision(
                verdict=FinalVerdict.SUSPICIOUS_UNVERIFIED,
                confidence=EvidenceQuality.MEDIUM,
                reason=(
                    "No qualifying fetched evidence verified the claim, and the local model "
                    "found strong high-risk writing patterns. Manual review is recommended."
                ),
                policy_version=self.version,
            )

        return VerdictDecision(
            verdict=FinalVerdict.UNVERIFIED,
            confidence=EvidenceQuality.LOW,
            reason=(
                f"No qualifying fetched evidence verified the claim. The local model gave "
                f"a {style_signal} signal, but style is not proof of truth."
            ),
            policy_version=self.version,
        )
