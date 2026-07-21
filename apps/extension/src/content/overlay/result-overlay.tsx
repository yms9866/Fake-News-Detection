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
    styleScopeReliable: result.style_scope_reliable,
    finalVerdict: result.final_verdict,
    confidence: result.confidence,
    verificationStatus,
    sourceCount: result.verification ? result.verification.evidence.length : 0,
    warnings: result.warnings || [],
    reason: result.reason,
    requestId: result.request_id,
    traceId: result.trace_id
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
    metric("Writing-style risk", summary.styleSignal || "UNKNOWN"),
    metric("Style scope", summary.styleScopeReliable ? "Reliable" : "Limited"),
    metric("Evidence verification", humanVerification(summary.verificationStatus)),
    metric("Final decision", `${summary.finalVerdict || "UNVERIFIED"} (${summary.confidence || "LOW"})`),
    metric("Sources", String(summary.sourceCount || 0))
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

