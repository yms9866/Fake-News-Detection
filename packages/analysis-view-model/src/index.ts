export type AnalysisDisplayModel = {
  analysisId: string;
  finalVerdict: string;
  confidence: string;
  reason: string;
  createdAt: string | null;
  styleSignal: string;
  styleConfidence: string;
  styleLimitation: string;
  claims: unknown[];
  sources: unknown[];
  searchSummary: unknown;
  geminiEvidence: unknown;
  warnings: string[];
};

export function textOnly(value: unknown, fallback = "") {
  return String(value === undefined || value === null ? fallback : value);
}

function deriveTitle(result: Record<string, unknown>): string {
  const text = textOnly(result.extracted_text || result.cleaned_text || result.text);
  if (text) {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed.length > 60) return trimmed.slice(0, 57) + "…";
    if (trimmed.length > 0) return trimmed;
  }
  const url = textOnly(result.source_url);
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch { /* ignore */ }
  }
  const verdict = textOnly(result.final_verdict, "UNVERIFIED");
  return `Analysis — ${verdict}`;
}

function toSlug(title: string, dateStr: string | null): string {
  const base = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = dateStr
    ? new Date(dateStr).toISOString().slice(0, 10).replace(/-/g, "")
    : Date.now().toString(36);
  return `${base}-${suffix}`;
}

export function compactHistoryItem(result: Record<string, unknown>) {
  const createdAt = result.created_at ? String(result.created_at) : null;
  const title = deriveTitle(result);
  return {
    analysisId: textOnly(result.analysis_id),
    inputType: textOnly(result.input_type),
    finalVerdict: textOnly(result.final_verdict, "UNVERIFIED"),
    confidence: textOnly(result.confidence, "LOW"),
    createdAt,
    title,
    slug: toSlug(title, createdAt)
  };
}

export function toAnalysisDisplayModel(result: Record<string, unknown> | null | undefined): AnalysisDisplayModel | null {
  if (!result) {
    return null;
  }
  const style = (result.style_assessment || {}) as Record<string, unknown>;
  return {
    analysisId: textOnly(result.analysis_id),
    finalVerdict: textOnly(result.final_verdict, "UNVERIFIED"),
    confidence: textOnly(result.confidence, "LOW"),
    reason: textOnly(result.reason, "No reason returned."),
    createdAt: result.created_at ? String(result.created_at) : null,
    styleSignal: textOnly(style.signal || result.style_signal, "UNKNOWN"),
    styleConfidence: style.confidence == null ? "N/A" : String(style.confidence),
    styleLimitation: "Writing style alone cannot establish whether the claims are true or false.",
    claims: Array.isArray(result.claims) ? result.claims : [],
    sources: Array.isArray(result.sources) ? result.sources : [],
    searchSummary: result.search_summary || null,
    geminiEvidence: result.gemini_evidence || result.verification || null,
    warnings: Array.isArray(result.warnings) ? result.warnings.map((item) => textOnly(item)) : []
  };
}

const CONNECTION_CODES = new Set([
  "FND_CONNECTION_REFUSED",
  "FND_CORS_OR_NETWORK_FAILURE",
  "WEB_CONNECTION_REFUSED",
  "WEB_CORS_OR_NETWORK_FAILURE",
  "MOBILE_NETWORK_UNREACHABLE",
  "DESKTOP_BACKEND_UNAVAILABLE"
]);

const TIMEOUT_CODES = new Set([
  "FND_REQUEST_TIMEOUT",
  "WEB_REQUEST_TIMEOUT",
  "MOBILE_REQUEST_TIMEOUT",
  "DESKTOP_BACKEND_TIMEOUT"
]);

export function userMessageForError(error: { code?: string; message?: string; backendOrigin?: string | null } | null) {
  if (!error) {
    return "Something went wrong.";
  }
  if (error.code && CONNECTION_CODES.has(error.code)) {
    return `The local API could not be reached${error.backendOrigin ? ` at ${error.backendOrigin}` : ""}. Start the backend, then try again.`;
  }
  if (error.code && TIMEOUT_CODES.has(error.code)) {
    return "The request timed out. Try again with a shorter input or wait for the backend to finish.";
  }
  return error.message || "The operation failed.";
}

export function evidenceLinkDescriptor(item: Record<string, unknown>) {
  return {
    sourceId: textOnly(item.source_id),
    sourceNumber: Number(item.source_number || 0),
    citationLabel: textOnly(item.citation_label, item.source_number ? `Source ${item.source_number}` : "Source"),
    title: textOnly(item.title, "Untitled source"),
    publisher: textOnly(item.publisher),
    domain: textOnly(item.domain),
    url: textOnly(item.url) || null,
    stance: textOnly(item.stance, "UNKNOWN"),
    sourceType: textOnly(item.source_type, "UNKNOWN"),
    reliability: textOnly(item.reliability, "LOW"),
    fetched: Boolean(item.fetched),
    usedInExplanation: Boolean(item.used_in_explanation)
  };
}
