export function resultSummary(result) {
  return {
    analysisId: result.analysis_id,
    finalVerdict: result.final_verdict,
    confidence: result.confidence,
    evidenceCount: result.verification && Array.isArray(result.verification.evidence)
      ? result.verification.evidence.length
      : 0
  };
}
