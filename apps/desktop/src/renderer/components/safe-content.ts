import { evidenceLinkDescriptor as mapEvidence, compactHistoryItem, textOnly } from "@fnd/analysis-view-model";
import { safeExternalUrl } from "@fnd/client-sdk";

export { textOnly, compactHistoryItem };

export function sanitizeEvidenceUrl(value) {
  return safeExternalUrl(value);
}

export function evidenceLinkDescriptor(item) {
  return {
    ...mapEvidence(item || {}),
    url: safeExternalUrl(item && item.url)
  };
}

export function summarizeHistoryItem(result) {
  const payload = result || {};
  return {
    analysisId: textOnly(payload.analysis_id),
    jobId: payload.job_id || null,
    inputType: textOnly(payload.input_type, "unknown"),
    finalVerdict: payload.final_verdict || null,
    createdAt: payload.created_at || new Date().toISOString()
  };
}
