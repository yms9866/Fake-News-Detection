import { CLIENT_STATES, JOB_POLL_ATTEMPTS } from "../shared/constants.js";
import { EXTENSION_ERROR_CODES, ExtensionError } from "../shared/errors.js";
import {
  compactClaims,
  compactGeminiEvidence,
  compactSearchSummary,
  compactSources
} from "../ui/evidence.js";
import {
  clearActiveAnalysis,
  getActiveAnalysis,
  getSettings,
  saveActiveAnalysis,
  saveLatestSummary
} from "../shared/storage.js";
import { createApiClient } from "../shared/api-client.js";
import { logEvent } from "../shared/telemetry.js";
import { clientStateFromJob, showSummaryOverlay } from "./tab-helpers.js";

const activePollers = new Map();
const TERMINAL = new Set(["completed", "failed", "cancelled"]);

export async function persistAcceptedJob(accepted) {
  const reference = {
    analysisId: accepted.analysis_id,
    jobId: accepted.job_id,
    clientState: CLIENT_STATES.queued,
    backendJobStatus: accepted.status,
    mediaType: accepted.media_type,
    requestId: accepted.request_id,
    traceId: accepted.trace_id
  };
  await saveActiveAnalysis(reference);
  return reference;
}

export async function resumeActiveJobMonitoring() {
  const reference = await getActiveAnalysis();
  if (reference && reference.jobId) {
    await monitorJob(reference.jobId);
  }
}

export async function monitorJob(jobId) {
  if (activePollers.has(jobId)) {
    return activePollers.get(jobId);
  }
  const promise = pollUntilTerminal(jobId).finally(() => activePollers.delete(jobId));
  activePollers.set(jobId, promise);
  return promise;
}

async function pollUntilTerminal(jobId) {
  const settings = await getSettings();
  const client = createApiClient(settings);
  try {
    for (let attempt = 0; attempt < JOB_POLL_ATTEMPTS; attempt += 1) {
      const job = await client.getJob(jobId);
      await saveActiveAnalysis({
        analysisId: job.analysis_id,
        jobId: job.job_id,
        clientState: TERMINAL.has(job.status) ? clientStateFromJob(job.status) : CLIENT_STATES.processing,
        backendJobStatus: job.status,
        requestId: job.request_id,
        traceId: job.trace_id
      });
      logEvent("job_poll", {
        clientState: job.status,
        analysisId: job.analysis_id,
        jobId: job.job_id,
        requestId: job.request_id,
        traceId: job.trace_id
      });
      if (job.status === "completed") {
        const result = await client.getAnalysis(job.analysis_id);
        const summary = summarizeAnalysis(result, job);
        await saveLatestSummary(summary);
        await clearActiveAnalysis();
        if (settings.showOverlayAutomatically) {
          try {
            await showSummaryOverlay(summary);
          } catch {
            /* overlay is best-effort after a background job */
          }
        }
        return { job, result, summary };
      }
      if (job.status === "failed") {
        throw new ExtensionError(
          job.error && job.error.code ? job.error.code : EXTENSION_ERROR_CODES.jobFailed,
          job.error && job.error.message ? job.error.message : "Analysis job failed.",
          { requestId: job.request_id, traceId: job.trace_id }
        );
      }
      if (job.status === "cancelled") {
        throw new ExtensionError(
          EXTENSION_ERROR_CODES.jobCancelled,
          "Analysis job was cancelled.",
          { requestId: job.request_id, traceId: job.trace_id }
        );
      }
      await sleep(1000);
    }
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.requestTimeout,
      "Timed out while waiting for the analysis job to complete."
    );
  } catch (error) {
    await saveActiveAnalysis({
      jobId,
      clientState: CLIENT_STATES.failed,
      backendJobStatus: "failed"
    });
    throw error;
  }
}

export function summarizeAnalysis(result, job = null) {
  const sources = compactSources(result);
  const searchSummary = compactSearchSummary(result.search_summary);
  const claims = compactClaims(result.claims);
  return {
    analysisId: result.analysis_id,
    jobId: job ? job.job_id : undefined,
    clientState: result.status === "completed" ? CLIENT_STATES.completed : CLIENT_STATES.processing,
    backendJobStatus: job ? job.status : undefined,
    styleSignal: result.style_signal,
    styleText: result.style_assessment ? result.style_assessment.display_text : "",
    styleConfidence: result.style_assessment ? result.style_assessment.display_confidence : "",
    claimCount: claims.length,
    claims,
    qualifyingSourceCount: searchSummary
      ? searchSummary.qualifyingSourceCount
      : result.verification
        ? result.verification.qualifying_source_count
        : sources.filter((item) => item.qualification === "qualifies").length,
    styleScopeReliable: Boolean(result.style_scope_reliable),
    finalVerdict: result.final_verdict,
    confidence: result.confidence,
    verificationStatus: result.verification
      ? result.verification.error
        ? "failed"
        : "completed"
      : "not_run",
    sourceCount: sources.length,
    sources,
    searchSummary,
    geminiEvidence: compactGeminiEvidence(result),
    warnings: result.warnings || [],
    reason: result.reason
  };
}

export function hasActivePoller(jobId) {
  return activePollers.has(jobId);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
