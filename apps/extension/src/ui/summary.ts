import { div, el } from "./dom.js";

export function verdictTone(verdict) {
  const value = String(verdict || "").toUpperCase();
  if (value.includes("REAL") || value.includes("TRUE") || value.includes("AUTHENTIC")) {
    return "real";
  }
  if (value.includes("FAKE") || value.includes("FALSE") || value.includes("MISLEADING")) {
    return "fake";
  }
  return "uncertain";
}

export function humanVerdict(verdict) {
  const value = String(verdict || "UNVERIFIED").replace(/_/gu, " ").trim();
  return value || "UNVERIFIED";
}

export function humanJobState(state) {
  const map = {
    idle: "Idle",
    extracting: "Reading the page…",
    submitting: "Sending to the local API…",
    queued: "Queued",
    processing: "Analyzing…",
    completed: "Completed",
    failed: "Failed",
    cancelled: "Cancelled"
  };
  return map[state] || "Working…";
}

export function humanVerification(value) {
  if (value === "completed") {
    return "Evidence search completed";
  }
  if (value === "checking") {
    return "Checking evidence…";
  }
  if (value === "failed") {
    return "Evidence search failed";
  }
  return "Style only";
}

export function fallbackStyleText(signal) {
  if (signal === "LOW_STYLE_RISK") {
    return "Writing style resembles legitimate reporting.";
  }
  if (signal === "HIGH_STYLE_RISK") {
    return "Writing style resembles misleading or fabricated content.";
  }
  return "Writing-style assessment unavailable.";
}

export function styleLabel(signal) {
  if (signal === "LOW_STYLE_RISK") {
    return "Low style risk";
  }
  if (signal === "HIGH_STYLE_RISK") {
    return "High style risk";
  }
  return "Style unknown";
}

export function renderVerdictCard(summary, options = {}) {
  const compact = Boolean(options.compact);
  const tone = verdictTone(summary.finalVerdict);
  const card = div(`verdict-card tone-${tone}`);
  const header = div("verdict-card-header");
  header.append(el("span", humanVerdict(summary.finalVerdict), "verdict-title"));
  header.append(
    el("span", `${summary.confidence || "LOW"} confidence`, "verdict-confidence")
  );
  card.append(header);

  const reason = String(summary.reason || summary.styleText || fallbackStyleText(summary.styleSignal));
  card.append(el("p", reason, "verdict-reason"));

  const chips = div("chip-row");
  chips.append(chip(styleLabel(summary.styleSignal)));
  chips.append(chip(`${summary.claimCount || 0} claims`));
  chips.append(chip(`${summary.qualifyingSourceCount || 0} qualifying sources`));
  if (!compact && summary.verificationStatus) {
    chips.append(chip(humanVerification(summary.verificationStatus)));
  }
  card.append(chips);

  if (!compact && summary.styleText) {
    card.append(el("p", summary.styleText, "muted"));
  }
  if (Array.isArray(summary.warnings) && summary.warnings.length) {
    card.append(el("p", summary.warnings.map((item) => String(item)).join(" "), "warning-line"));
  }
  return card;
}

function chip(text) {
  return el("span", text, "chip");
}
