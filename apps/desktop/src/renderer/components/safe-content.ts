export function sanitizeEvidenceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw || /[\u0000-\u001f\u007f]/u.test(raw)) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
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

export function evidenceLinkDescriptor(item) {
  const url = sanitizeEvidenceUrl(item && item.url);
  return {
    sourceId: textOnly(item && item.source_id),
    sourceNumber: Number(item && item.source_number ? item.source_number : 0),
    citationLabel: textOnly(item && item.citation_label, item && item.source_number ? `Source ${item.source_number}` : "Source"),
    title: textOnly(item && item.title, "Untitled source"),
    publisher: textOnly(item && item.publisher),
    domain: textOnly(item && item.domain),
    url,
    stance: textOnly(item && item.stance, "UNKNOWN"),
    sourceType: textOnly(item && item.source_type, "UNKNOWN"),
    reliability: textOnly(item && item.reliability, "LOW"),
    fetched: Boolean(item && item.fetched),
    usedInExplanation: Boolean(item && item.used_in_explanation)
  };
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
