import type {
  AnalysisResponse,
  JobResponse,
  JobStatusCode,
  Quality,
  StyleSignal
} from "../../shared/contracts.js";
import { isSafeHttpUrl } from "../metadata-extractor.js";
import { fallbackStyleText, humanVerification, humanVerdict, renderVerdictCard } from "../../ui/summary.js";

export type OverlayVerificationStatus = "failed" | "completed" | "checking" | "not_run";

export type ResultOverlaySummary = {
  analysisId: string;
  jobId?: string;
  clientState: string;
  backendJobStatus?: JobStatusCode;
  styleSignal: StyleSignal;
  styleText: string;
  styleConfidence: string;
  claimCount: number;
  qualifyingSourceCount: number;
  styleScopeReliable: boolean;
  finalVerdict: string;
  confidence: Quality;
  verificationStatus: OverlayVerificationStatus;
  sourceCount: number;
  warnings: string[];
  reason: string;
};

export function summaryFromAnalysis(
  result: AnalysisResponse,
  job: JobResponse | null = null
): ResultOverlaySummary {
  const verificationStatus: OverlayVerificationStatus = result.verification
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

export function renderResultOverlay(
  shadowRoot: ShadowRoot,
  summary: ResultOverlaySummary
): HTMLElement {
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
  close.addEventListener("click", () =>
    wrapper.dispatchEvent(new CustomEvent("fnd-dismiss", { bubbles: true, composed: true }))
  );

  const kicker = document.createElement("p");
  kicker.className = "fnd-kicker";
  kicker.textContent = "Fake News Analysis";

  const title = document.createElement("h2");
  title.textContent = humanVerdict(summary.finalVerdict);
  wrapper.append(kicker, title, close);

  const cardHost = document.createElement("div");
  cardHost.className = "fnd-card-host";
  const card = renderVerdictCard(
    {
      ...summary,
      styleText: summary.styleText || fallbackStyleText(summary.styleSignal)
    },
    { compact: true }
  );
  cardHost.append(card);
  wrapper.append(cardHost);

  const footer = document.createElement("div");
  footer.className = "fnd-footer";
  const evidence = document.createElement("span");
  evidence.textContent = humanVerification(summary.verificationStatus);
  const openDetails = document.createElement("button");
  openDetails.type = "button";
  openDetails.className = "fnd-details";
  openDetails.textContent = "Open details";
  openDetails.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    wrapper.dispatchEvent(
      new CustomEvent("fnd-open-details", { bubbles: true, composed: true, detail: summary })
    );
  });
  footer.append(evidence, openDetails);
  wrapper.append(footer);

  shadowRoot.append(wrapper);
  wrapper.focus();
  return wrapper;
}

export function safeSourceUrl(url: string): string {
  return isSafeHttpUrl(url) ? url : "";
}
