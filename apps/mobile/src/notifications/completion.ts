export function createCompletionNotification(analysis) {
  return {
    title: "Analysis complete",
    body: `${analysis.final_verdict || "UNVERIFIED"} - ${analysis.confidence || "LOW"}`,
    data: { analysisId: analysis.analysis_id }
  };
}
