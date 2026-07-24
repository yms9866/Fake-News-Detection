import { safeExternalUrl } from "../api/validation.js";

export function textOnly(value, fallback = "") {
  return String(value === undefined || value === null ? fallback : value);
}

export function evidenceLinkDescriptor(item) {
  const url = safeExternalUrl(item && item.url);
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

export function compactHistoryItem(result) {
  return {
    analysisId: result.analysis_id,
    inputType: result.input_type,
    finalVerdict: result.final_verdict,
    confidence: result.confidence,
    createdAt: result.created_at
  };
}
