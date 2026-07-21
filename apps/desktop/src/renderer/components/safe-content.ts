export function sanitizeEvidenceUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function textOnly(value, fallback = "") {
  return String(value === undefined || value === null ? fallback : value);
}

export function summarizeHistoryItem(result) {
  return {
    analysisId: result.analysis_id,
    jobId: result.job_id || null,
    inputType: result.input_type || "unknown",
    finalVerdict: result.final_verdict || null,
    createdAt: result.created_at || new Date().toISOString()
  };
}
