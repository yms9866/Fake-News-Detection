import { compactHistoryItem } from "@fnd/analysis-view-model";

export function resultSummary(result) {
  const display = compactHistoryItem(result || {});
  return {
    analysisId: display.analysisId,
    finalVerdict: display.finalVerdict,
    confidence: display.confidence,
    evidenceCount: result && result.verification && Array.isArray(result.verification.evidence)
      ? result.verification.evidence.length
      : 0
  };
}
