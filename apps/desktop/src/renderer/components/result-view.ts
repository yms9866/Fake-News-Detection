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

  wrapper.append(renderVerification(result.verification));
  wrapper.append(renderEvidence(result.verification, actions));
  wrapper.append(renderStyleSignal(result));
  wrapper.append(renderWarnings(result.warnings));
  wrapper.append(renderTechnicalDetails(result));
  return wrapper;
}

function renderEmptyResult() {
  const empty = div("empty-state");
  empty.append(el("h2", "No analysis selected"));
  empty.append(el("p", "Submit text, a URL, media, or a capture to review the final verdict and sources.", "muted"));
  return empty;
}

function renderVerification(verification) {
  const section = div("panel verification-panel");
  section.append(el("h3", "Evidence verification"));
  if (!verification) {
    section.append(el("p", "Evidence verification was not performed for this analysis.", "muted"));
    return section;
  }
  section.append(el("p", `${textOnly(verification.verdict, "UNVERIFIED")} - ${textOnly(verification.evidence_quality, "LOW")} evidence`));
  section.append(el("p", textOnly(verification.explanation, "No explanation returned."), "muted"));
  section.append(el("p", `Qualified sources: ${Number(verification.qualifying_source_count || 0)}`, "muted"));
  if (verification.raw_assessment && verification.raw_assessment.verdict && verification.raw_assessment.verdict !== verification.verdict) {
    section.append(el("p", `Raw provider assessment: ${verification.raw_assessment.verdict}. The deterministic policy remains authoritative.`, "technical-note"));
  }
  return section;
}

export function renderEvidence(verification, actions) {
  const section = div("panel sources-panel");
  section.append(el("h3", "Relevant sources"));
  if (!verification || !Array.isArray(verification.evidence) || verification.evidence.length === 0) {
    section.append(el("p", "No structured source records were returned.", "muted"));
    return section;
  }

  const list = div("source-grid");
  for (const item of verification.evidence) {
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
  section.append(el("h3", "Writing-style signal"));
  section.append(el("p", `${textOnly(result.style_signal, "UNKNOWN")} - ${result.style_confidence === null || result.style_confidence === undefined ? "n/a" : Math.round(result.style_confidence * 100) + "%"} confidence`));
  section.append(el("p", "Writing-style risk does not prove that the claim is false.", "technical-note"));
  if (result.style_warning) {
    section.append(el("p", textOnly(result.style_warning), "muted"));
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

function renderTechnicalDetails(result) {
  const details = document.createElement("details");
  details.className = "panel technical-details";
  details.append(el("summary", "Technical details"));
  details.append(el("pre", JSON.stringify({
    analysis_id: result.analysis_id,
    request_id: result.request_id,
    trace_id: result.trace_id,
    input_type: result.input_type,
    source_url: result.source_url,
    forensic_results: result.forensic_results || []
  }, null, 2)));
  return details;
}

function badgeList(values) {
  const group = div("badge-list");
  for (const value of values) {
    group.append(el("span", value, "badge"));
  }
  return group;
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
