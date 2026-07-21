import { captureVisibleTabOnce } from "../capture/visible-tab-capture.js";
import { MESSAGE_TYPES, makeIdempotencyKey } from "../shared/messages.js";
import { CLIENT_STATES } from "../shared/constants.js";
import {
  EXTENSION_ERROR_CODES,
  ExtensionError,
  safeErrorPayload
} from "../shared/errors.js";
import {
  getActiveAnalysis,
  getLatestSummary,
  getSettings,
  saveActiveAnalysis,
  saveLatestSummary
} from "../shared/storage.js";
import { createApiClient } from "../shared/api-client.js";
import { logEvent } from "../shared/telemetry.js";
import { monitorJob, persistAcceptedJob, summarizeAnalysis } from "./job-monitor.js";

export async function analyzeSelection(payload = {}) {
  const extraction = payload.text
    ? { ok: true, text: normalizeWhitespace(payload.text), currentUrl: payload.url || "" }
    : await extractFromActiveTab(MESSAGE_TYPES.extractSelection);
  if (!extraction.ok || !extraction.text) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.noSelectedText,
      extraction.message || "Select text before analysis."
    );
  }
  return await submitText(extraction.text, "selection");
}

export async function analyzeArticle() {
  const extraction = await extractFromActiveTab(MESSAGE_TYPES.extractArticle);
  if (!extraction.ok || !extraction.text) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.articleExtractionFailed,
      extraction.message || "No coherent article was detected."
    );
  }
  return await submitText(extraction.text, "article", extraction.warnings || []);
}

export async function analyzePage() {
  const extraction = await extractFromActiveTab(MESSAGE_TYPES.extractPage);
  if (!extraction.ok || !extraction.text) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.invalidPage,
      extraction.message || "No readable page text was detected."
    );
  }
  return await submitText(extraction.text, "page", extraction.warnings || []);
}

export async function analyzeUrl(payload = {}) {
  if (!payload.url || isUnsupportedBackendUrl(payload.url)) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.unsupportedPageUrl,
      "This URL cannot be sent to the backend URL endpoint."
    );
  }
  const { settings, client } = await configuredClient();
  const result = await client.analyzeUrl({
    url: payload.url,
    deep_check: settings.defaultDeepCheck,
    max_length: settings.defaultMaxLength
  });
  const summary = summarizeAnalysis(result);
  await saveLatestSummary(summary);
  return { ok: true, result, summary };
}

export async function analyzeVisibleTab() {
  const { settings, client } = await configuredClient();
  await saveActiveAnalysis({ clientState: CLIENT_STATES.submitting });
  const blob = await captureVisibleTabOnce();
  try {
    const accepted = await client.uploadImage(blob, {
      deepCheck: settings.defaultDeepCheck,
      maxLength: settings.defaultMaxLength,
      idempotencyKey: makeIdempotencyKey("visible-tab")
    });
    const reference = await persistAcceptedJob(accepted);
    void monitorJob(accepted.job_id);
    return { ok: true, accepted, reference };
  } finally {
    revokeBlob(blob);
  }
}

export async function cancelActiveJob(payload = {}) {
  const active = payload.jobId ? { jobId: payload.jobId } : await getActiveAnalysis();
  if (!active || !active.jobId) {
    throw new ExtensionError(EXTENSION_ERROR_CODES.jobNotFound, "No active job to cancel.");
  }
  const { client } = await configuredClient();
  const job = await client.cancelJob(active.jobId);
  await saveActiveAnalysis({
    analysisId: job.analysis_id,
    jobId: job.job_id,
    clientState: CLIENT_STATES.cancelled,
    backendJobStatus: job.status,
    requestId: job.request_id,
    traceId: job.trace_id
  });
  return { ok: true, job };
}

export async function getAnalysisState() {
  return {
    ok: true,
    active: await getActiveAnalysis(),
    latest: await getLatestSummary(),
    settings: await getSettings()
  };
}

export async function showLatestOverlay() {
  const latest = await getLatestSummary();
  if (!latest) {
    return { ok: false, error: { code: "NO_RESULT", message: "No latest result is available." } };
  }
  const tab = await getActiveTab();
  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.showOverlay, payload: latest });
  return { ok: true };
}

export async function openLatestReport() {
  const latest = await getLatestSummary();
  if (!latest) {
    return { ok: false, error: { code: "NO_RESULT", message: "No latest report is available." } };
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("report/report.html") });
  return { ok: true, latest };
}

export async function runControllerAction(action, payload = {}) {
  const start = performance.now();
  try {
    const result = await action(payload);
    logEvent("action_completed", {
      action: action.name,
      durationMs: Math.round(performance.now() - start),
      analysisId: result.summary ? result.summary.analysisId : undefined,
      jobId: result.accepted ? result.accepted.job_id : undefined
    });
    return result;
  } catch (error) {
    const safe = safeErrorPayload(error);
    logEvent("action_failed", {
      action: action.name,
      durationMs: Math.round(performance.now() - start),
      errorCode: safe.code,
      requestId: safe.requestId,
      traceId: safe.traceId
    });
    return { ok: false, error: safe };
  }
}

async function submitText(text, source, warnings = []) {
  const { settings, client } = await configuredClient();
  await saveActiveAnalysis({ clientState: CLIENT_STATES.submitting, source });
  const result = await client.analyzeText({
    text,
    deep_check: settings.defaultDeepCheck,
    max_length: settings.defaultMaxLength
  });
  const summary = summarizeAnalysis(result);
  summary.warnings = [...(summary.warnings || []), ...warnings];
  if (settings.storeLatestAnalysisReference) {
    await saveLatestSummary(summary);
  }
  await saveActiveAnalysis({
    analysisId: result.analysis_id,
    clientState: CLIENT_STATES.completed,
    requestId: result.request_id,
    traceId: result.trace_id
  });
  if (settings.showOverlayAutomatically) {
    await showSummaryOverlay(summary);
  }
  return { ok: true, result, summary };
}

async function showSummaryOverlay(summary) {
  const tab = await getActiveTab();
  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, { type: MESSAGE_TYPES.showOverlay, payload: summary });
}

async function extractFromActiveTab(type) {
  const tab = await getActiveTab();
  if (!tab.url || isUnsupportedBackendUrl(tab.url)) {
    return {
      ok: false,
      errorCode: EXTENSION_ERROR_CODES.unsupportedPageUrl,
      message: "This page URL cannot be analyzed with DOM extraction."
    };
  }
  await ensureContentScript(tab.id);
  return await chrome.tabs.sendMessage(tab.id, { type });
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) {
    throw new ExtensionError(EXTENSION_ERROR_CODES.invalidPage, "No active tab is available.");
  }
  return tab;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/content-script.js"]
  });
}

async function configuredClient() {
  const settings = await getSettings();
  return { settings, client: createApiClient(settings) };
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/gu, " ").trim();
}

function isUnsupportedBackendUrl(url) {
  try {
    return ["chrome:", "chrome-extension:", "about:", "file:", "view-source:", "devtools:"].includes(new URL(url).protocol);
  } catch {
    return true;
  }
}

function revokeBlob(blob) {
  if (blob && blob.objectUrl) {
    URL.revokeObjectURL(blob.objectUrl);
  }
}
