export function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

export function compactSources(result) {
  const raw = Array.isArray(result.sources) && result.sources.length
    ? result.sources
    : result.verification && Array.isArray(result.verification.evidence)
      ? result.verification.evidence
      : [];
  return raw.slice(0, 24).map((item, index) => compactSource(item, index));
}

export function compactSource(item, index = 0) {
  const url = safeHttpUrl(item && item.url);
  let domain = String(item && item.domain ? item.domain : "");
  if (!domain && url) {
    try {
      domain = new URL(url).hostname.replace(/^www\./u, "");
    } catch {
      domain = "";
    }
  }
  return {
    citationLabel: String(item && item.citation_label ? item.citation_label : `Source ${index + 1}`),
    url,
    title: String(item && item.title ? item.title : domain || "Untitled source").slice(0, 180),
    publisher: String(item && item.publisher ? item.publisher : "").slice(0, 80),
    domain,
    stance: String(item && item.stance ? item.stance : "UNKNOWN"),
    reliability: String(item && item.reliability ? item.reliability : "UNKNOWN"),
    sourceType: String(item && item.source_type ? item.source_type : ""),
    fetched: Boolean(item && item.fetched),
    qualification: String(item && item.qualification ? item.qualification : ""),
    explanation: String(
      (item && (item.qualification_explanation || item.fetch_message)) || ""
    ).slice(0, 280)
  };
}

export function compactSearchSummary(searchSummary) {
  if (!searchSummary || typeof searchSummary !== "object") {
    return null;
  }
  const queries = Array.isArray(searchSummary.queries)
    ? searchSummary.queries.slice(0, 8).map((item) => ({
        query: String(typeof item === "string" ? item : item && item.query ? item.query : "").slice(0, 200)
      })).filter((item) => item.query)
    : [];
  return {
    scope: String(
      searchSummary.scope ||
        "Gemini searches the live public web with Google Search grounding."
    ),
    totalQueries: Number(searchSummary.totalQueries || searchSummary.total_queries || queries.length || 0),
    totalResults: Number(searchSummary.totalResults || searchSummary.total_results || 0),
    reviewedSourceCount: Number(
      searchSummary.reviewedSourceCount || searchSummary.reviewed_source_count || 0
    ),
    qualifyingSourceCount: Number(
      searchSummary.qualifyingSourceCount || searchSummary.qualifying_source_count || 0
    ),
    queries,
    limitations: Array.isArray(searchSummary.limitations)
      ? searchSummary.limitations.map((item) => String(item)).slice(0, 6)
      : []
  };
}

export function compactClaims(claims) {
  if (!Array.isArray(claims)) {
    return [];
  }
  return claims.slice(0, 12).map((claim, index) => ({
    sequence: Number(claim && claim.sequence ? claim.sequence : index + 1),
    claimText: String(claim && claim.claim_text ? claim.claim_text : "").slice(0, 280),
    status: String(claim && claim.verification_status ? claim.verification_status : "INSUFFICIENT_EVIDENCE"),
    confidence: String(claim && claim.confidence ? claim.confidence : "LOW"),
    explanation: String(
      (claim && (claim.explanation || claim.unresolved_reason)) || ""
    ).slice(0, 280)
  }));
}

export function compactGeminiEvidence(result) {
  const evidence = result.gemini_evidence || result.verification;
  if (!evidence) {
    return null;
  }
  return {
    assessment: String(evidence.assessment || evidence.verdict || "UNVERIFIED"),
    confidence: String(evidence.confidence || "LOW"),
    evidenceQuality: String(evidence.evidence_quality || "LOW"),
    explanation: String(evidence.explanation || "").slice(0, 400),
    groundingUsed: Boolean(evidence.grounding_used),
    error: String(evidence.error_message || evidence.error || "")
  };
}

export function stanceLabel(stance) {
  if (stance === "SUPPORTS") {
    return "Supports the claim";
  }
  if (stance === "CONTRADICTS") {
    return "Contradicts the claim";
  }
  if (stance === "MENTIONS") {
    return "Mentions the topic";
  }
  return "Stance unknown";
}

export function stanceClass(stance) {
  if (stance === "SUPPORTS") {
    return "supports";
  }
  if (stance === "CONTRADICTS") {
    return "contradicts";
  }
  if (stance === "MENTIONS") {
    return "mentions";
  }
  return "unknown";
}
