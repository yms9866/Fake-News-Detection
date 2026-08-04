import { button, div, el } from "./dom.js";
import { evidenceLinkDescriptor, textOnly } from "./safe-content.js";

export function renderResultView(result, actions) {
  const wrapper = div("result-view");
  if (!result) {
    wrapper.append(renderEmptyResult());
    return wrapper;
  }

  const summary = div("result-summary");
  summary.append(el("p", "Final verdict", "eyebrow"));
  summary.append(el("h2", textOnly(result.final_verdict, "UNVERIFIED")));
  summary.append(el("p", `Confidence: ${textOnly(result.confidence, "LOW")}`, "confidence-line"));
  summary.append(el("p", textOnly(result.reason, "No reason returned."), "reason"));
  wrapper.append(summary);

  wrapper.append(renderStyleSignal(result));
  wrapper.append(renderClaims(result.claims));
  wrapper.append(renderSearchSummary(result.search_summary));
  wrapper.append(renderEvidence(result, actions));
  wrapper.append(renderGeminiEvidence(result.gemini_evidence || result.verification));
  wrapper.append(renderWarnings(result.warnings));
  return wrapper;
}

function renderEmptyResult() {
  const empty = div("empty-state");
  empty.append(el("h2", "No analysis selected"));
  empty.append(el("p", "Submit text, a URL, media, or a capture to review the final verdict and sources.", "muted"));
  return empty;
}

function renderGeminiEvidence(verification) {
  const section = div("panel verification-panel");
  section.append(el("h3", "Gemini evidence analysis"));
  if (!verification) {
    section.append(el("p", "Evidence verification was not performed for this analysis.", "muted"));
    return section;
  }
  const assessment = verification.assessment || verification.verdict || "UNVERIFIED";
  const confidence = verification.confidence || "LOW";
  const quality = verification.evidence_quality || "LOW";
  section.append(el("p", `${textOnly(assessment, "UNVERIFIED")} - ${textOnly(confidence, "LOW")} confidence`));
  section.append(el("p", `Evidence quality: ${textOnly(quality, "LOW")}`, "muted"));
  section.append(el("p", textOnly(verification.explanation, "No explanation returned."), "muted"));
  if (verification.grounding_used !== undefined) {
    section.append(el("p", verification.grounding_used ? "Grounded in reviewed source passages." : "No reviewed source grounding was available.", "muted"));
  }
  section.append(el("p", "The final system verdict is decided separately by deterministic evidence policy.", "muted"));
  if (verification.error_message) {
    section.append(el("p", textOnly(verification.error_message), "muted"));
  }
  return section;
}

function renderClaims(claims = []) {
  const section = div("panel claims-panel");
  section.append(el("h3", "Claims checked"));
  if (!Array.isArray(claims) || claims.length === 0) {
    section.append(el("p", "No atomic factual claims were checked for this analysis.", "muted"));
    return section;
  }
  const list = div("claim-list");
  for (const claim of claims) {
    const card = div("claim-card");
    card.append(el("p", `Claim ${Number(claim.sequence || 0) || ""}`, "eyebrow"));
    card.append(el("h4", textOnly(claim.claim_text, "Untitled claim")));
    card.append(badgeList([
      textOnly(claim.verification_status, "INSUFFICIENT_EVIDENCE"),
      `${textOnly(claim.confidence, "LOW")} confidence`,
      textOnly(claim.importance, "MEDIUM")
    ]));
    card.append(el("p", textOnly(claim.explanation || claim.unresolved_reason, "No claim explanation returned."), "muted"));
    list.append(card);
  }
  section.append(list);
  return section;
}

function renderSearchSummary(searchSummary) {
  const section = div("panel search-panel");
  section.append(el("h3", "Gemini Google Search"));
  if (!searchSummary) {
    section.append(el("p", "Gemini Google Search grounding was not run.", "muted"));
    return section;
  }
  section.append(el("p", textOnly(searchSummary.scope, "Gemini searches the live public web with Google Search grounding.")));
  section.append(el("p", `${Number(searchSummary.total_queries || 0)} searches, ${Number(searchSummary.total_results || 0)} grounded results, ${Number(searchSummary.reviewed_source_count || 0)} cited sources`, "muted"));
  const queries = Array.isArray(searchSummary.queries) ? searchSummary.queries.slice(0, 6) : [];
  if (queries.length > 0) {
    const list = el("ul", null, "warnings");
    for (const query of queries) {
      list.append(el("li", textOnly(query.query)));
    }
    section.append(list);
  }
  if (Array.isArray(searchSummary.limitations) && searchSummary.limitations.length > 0) {
    section.append(el("p", textOnly(searchSummary.limitations.join(" ")), "muted"));
  }
  return section;
}

export function renderEvidence(result, actions) {
  const section = div("panel sources-panel");
  section.append(el("h3", "Reviewed sources"));
  const sources = Array.isArray(result.sources) && result.sources.length > 0
    ? result.sources
    : result.verification && Array.isArray(result.verification.evidence)
      ? result.verification.evidence
      : [];
  if (sources.length === 0) {
    section.append(el("p", "No structured source records were returned.", "muted"));
    return section;
  }

  const list = div("source-grid");
  for (const item of sources) {
    list.append(renderSourceCard(item, actions));
  }
  section.append(list);
  return section;
}

function renderSourceCard(item, actions) {
  const descriptor = evidenceLinkDescriptor(item);
  const card = div("source-card");
  card.append(el("p", descriptor.citationLabel, "eyebrow"));
  card.append(el("h4", descriptor.title));
  card.append(el("p", descriptor.publisher || descriptor.domain || "Unknown publisher", "muted"));
  card.append(badgeList([
    stanceLabel(descriptor.stance),
    sourceTypeLabel(descriptor.sourceType),
    `${descriptor.reliability} reliability`,
    descriptor.fetched ? "Fetched" : "Source not fetched",
    descriptor.usedInExplanation ? "Used in explanation" : "Not used in explanation"
  ]));
  if (item.fetch_message) {
    card.append(el("p", textOnly(item.fetch_message), "muted"));
  }
  if (item.qualification_explanation) {
    card.append(el("p", textOnly(item.qualification_explanation), "muted"));
  }
  if (descriptor.url && actions && typeof actions.openSource === "function") {
    const openButton = button("Open source", () => actions.openSource(descriptor.url), "button link-button");
    openButton.setAttribute("aria-label", `Open ${descriptor.citationLabel}: ${descriptor.title}`);
    card.append(openButton);
  } else {
    card.append(el("p", "No safe source link available.", "muted"));
  }
  return card;
}

function renderStyleSignal(result) {
  const section = div("panel style-panel");
  const assessment = result.style_assessment || {};
  const displayText = assessment.display_text || fallbackStyleText(result.style_signal);
  const displayConfidence = assessment.display_confidence || fallbackStyleConfidence(result.style_confidence);
  const limitation = assessment.limitation || "This assessment evaluates writing patterns only. Writing style alone cannot establish whether the claims are true or false.";
  section.append(el("h3", "Writing-style assessment"));
  section.append(el("p", textOnly(displayText, "The writing-style assessment is unavailable.")));
  section.append(el("p", `Style signal strength: ${textOnly(displayConfidence, "N/A")}`, "confidence-line"));
  section.append(el("p", textOnly(limitation), "muted"));
  if (assessment.warning || result.style_warning) {
    section.append(el("p", textOnly(assessment.warning || result.style_warning), "muted"));
  }
  return section;
}

function renderWarnings(warnings = []) {
  const section = div("panel warnings-panel");
  section.append(el("h3", "Warnings and limitations"));
  if (!Array.isArray(warnings) || warnings.length === 0) {
    section.append(el("p", "No warnings were returned.", "muted"));
    return section;
  }
  const list = el("ul", null, "warnings");
  for (const warning of warnings) {
    list.append(el("li", textOnly(warning)));
  }
  section.append(list);
  return section;
}

function badgeList(values) {
  const group = div("badge-list");
  for (const value of values) {
    group.append(el("span", value, "badge"));
  }
  return group;
}

function fallbackStyleText(signal) {
  if (signal === "LOW_STYLE_RISK") {
    return "The writing style seems similar to real or legitimate news reporting.";
  }
  if (signal === "HIGH_STYLE_RISK") {
    return "The writing style seems similar to fake, misleading, or fabricated content.";
  }
  return "The writing-style assessment is unavailable.";
}

function fallbackStyleConfidence(confidence) {
  if (confidence === null || confidence === undefined) {
    return "N/A";
  }
  if (confidence >= 0.9995) {
    return ">99.9%";
  }
  const bounded = Math.max(0, Math.min(Number(confidence), 0.999));
  return `${(bounded * 100).toFixed(1)}%`;
}

function stanceLabel(stance) {
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

function sourceTypeLabel(sourceType) {
  if (sourceType === "OFFICIAL") {
    return "Official or primary source";
  }
  if (sourceType === "REPUTABLE_NEWS" || sourceType === "FACT_CHECK") {
    return "Secondary reporting";
  }
  return `${sourceType || "UNKNOWN"} source`;
}
