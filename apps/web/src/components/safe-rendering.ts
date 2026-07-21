import { safeExternalUrl } from "../api/validation.js";

export function textOnly(value, fallback = "") {
  return String(value === undefined || value === null ? fallback : value);
}

export function evidenceLinkDescriptor(item) {
  const url = safeExternalUrl(item && item.url);
  return {
    title: textOnly(item && item.title, "Untitled source"),
    url,
    stance: textOnly(item && item.stance, "UNKNOWN"),
    reliability: textOnly(item && item.reliability, "LOW")
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
