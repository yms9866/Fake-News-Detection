import { div, el } from "./dom.js";
import { textOnly } from "./safe-rendering.js";

export function renderVerdictBanner(result) {
  const banner = div("verdict-banner");
  
  const verdict = textOnly(result.final_verdict, "UNVERIFIED");
  const confidence = textOnly(result.confidence, "LOW");
  const reason = textOnly(result.reason, "No reason returned.");
  
  // Determine color based on verdict
  let colorClass = "verdict-uncertain";
  let verdictDisplay = verdict;
  
  if (verdict.toUpperCase().includes("REAL") || verdict.toUpperCase().includes("TRUE") || verdict.toUpperCase().includes("AUTHENTIC")) {
    colorClass = "verdict-real";
  } else if (verdict.toUpperCase().includes("FAKE") || verdict.toUpperCase().includes("FALSE") || verdict.toUpperCase().includes("MISLEADING")) {
    colorClass = "verdict-fake";
  } else if (verdict.toUpperCase().includes("UNCERTAIN") || verdict.toUpperCase().includes("MIXED") || verdict.toUpperCase().includes("UNVERIFIED")) {
    colorClass = "verdict-uncertain";
  }
  
  banner.className = `verdict-banner ${colorClass}`;
  
  // Verdict display
  const verdictText = el("h1", verdictDisplay);
  banner.append(verdictText);
  
  // Confidence indicator
  const confidenceBadge = div("confidence-badge");
  confidenceBadge.append(el("span", confidence, "confidence-label"));
  banner.append(confidenceBadge);
  
  // One-line summary
  const summary = el("p", reason, "verdict-summary");
  banner.append(summary);
  
  return banner;
}
