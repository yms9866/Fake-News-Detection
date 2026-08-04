import { isSafeHttpUrl } from "../metadata-extractor.js";

export function summaryFromAnalysis(result, job = null) {
  const verificationStatus = result.verification
    ? result.verification.error
      ? "failed"
      : "completed"
    : job && !["completed", "failed", "cancelled"].includes(job.status)
      ? "checking"
      : "not_run";
  return {
    analysisId: result.analysis_id,
    jobId: job ? job.job_id : undefined,
    clientState: result.status === "completed" ? "completed" : "processing",
    backendJobStatus: job ? job.status : undefined,
    styleSignal: result.style_signal,
    styleText: result.style_assessment ? result.style_assessment.display_text : "",
    styleConfidence: result.style_assessment ? result.style_assessment.display_confidence : "",
    claimCount: Array.isArray(result.claims) ? result.claims.length : 0,
    qualifyingSourceCount: result.search_summary
      ? result.search_summary.qualifying_source_count
      : result.verification
        ? result.verification.qualifying_source_count
        : 0,
    styleScopeReliable: result.style_scope_reliable,
    finalVerdict: result.final_verdict,
    confidence: result.confidence,
    verificationStatus,
    sourceCount: Array.isArray(result.sources)
      ? result.sources.length
      : result.verification
        ? result.verification.evidence.length
        : 0,
    warnings: result.warnings || [],
    reason: result.reason
  };
}

export function renderResultOverlay(shadowRoot, summary) {
  while (shadowRoot.firstChild) {
    shadowRoot.removeChild(shadowRoot.firstChild);
  }
  const wrapper = document.createElement("section");
  wrapper.className = "fnd-overlay";
  wrapper.setAttribute("role", "dialog");
  wrapper.setAttribute("aria-label", "Fake news analysis result");
  wrapper.tabIndex = -1;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "fnd-close";
  close.setAttribute("aria-label", "Dismiss analysis result");
  close.textContent = "Close";
  close.addEventListener("click", () => wrapper.dispatchEvent(new CustomEvent("fnd-dismiss", { bubbles: true })));

  const title = document.createElement("h2");
  title.textContent = "Analysis result";
  wrapper.append(title, close);
  wrapper.append(
    metric("Style signal strength", summary.styleConfidence || "N/A"),
    metric("Style assessment", summary.styleText || fallbackStyleText(summary.styleSignal)),
    metric("Claims checked", String(summary.claimCount || 0)),
    metric("Gemini evidence analysis", humanVerification(summary.verificationStatus)),
    metric("Final decision", `${summary.finalVerdict || "UNVERIFIED"} (${summary.confidence || "LOW"})`),
    metric("Reviewed sources", String(summary.sourceCount || 0)),
    metric("Qualifying sources", String(summary.qualifyingSourceCount || 0))
  );
  if (summary.warnings && summary.warnings.length) {
    const warning = document.createElement("p");
    warning.className = "fnd-warning";
    warning.textContent = summary.warnings.join(" ");
    wrapper.append(warning);
  }
  if (summary.reason) {
    const reason = document.createElement("p");
    reason.className = "fnd-reason";
    reason.textContent = summary.reason;
    wrapper.append(reason);
  }
  const openDetails = document.createElement("button");
  openDetails.type = "button";
  openDetails.className = "fnd-details";
  openDetails.textContent = "Open details";
  openDetails.addEventListener("click", () => {
    wrapper.dispatchEvent(new CustomEvent("fnd-open-details", { bubbles: true, detail: summary }));
  });
  wrapper.append(openDetails);
  shadowRoot.append(wrapper);
  wrapper.focus();
  return wrapper;
}

export function safeSourceUrl(url) {
  return isSafeHttpUrl(url) ? url : "";
}

function metric(label, value) {
  const row = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  const text = document.createElement("span");
  text.textContent = value;
  row.append(strong, text);
  return row;
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

function humanVerification(value) {
  if (value === "completed") {
    return "Completed";
  }
  if (value === "checking") {
    return "Checking";
  }
  if (value === "failed") {
    return "Failed";
  }
  return "Not run";
}
