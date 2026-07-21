import {
  PAIRING_HEADER,
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER
} from "./constants.js";
import {
  EXTENSION_ERROR_CODES,
  ExtensionError,
  mapBackendError
} from "./errors.js";
import { normalizeBackendOrigin } from "./storage.js";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(timeoutId) };
}

export class ApiClient {
  constructor(credentials) {
    this.credentials = {
      ...credentials,
      backendOrigin: normalizeBackendOrigin(credentials.backendOrigin)
    };
    this.timeoutMs = credentials.requestTimeoutMs || 15000;
  }

  async live() {
    return await this.getJson("/v1/health/live", { retry: true });
  }

  async ready() {
    return await this.getJson("/v1/health/ready", { retry: true });
  }

  async models() {
    return await this.getJson("/v1/models", { retry: true });
  }

  async analyzeText(payload) {
    return await this.requestJson("/v1/analyses/text", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  async analyzeUrl(payload) {
    return await this.requestJson("/v1/analyses/url", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  async uploadImage(blob, options = {}) {
    const form = new FormData();
    form.append("file", blob, options.filename || "visible-tab.png");
    form.append("deep_check", String(Boolean(options.deepCheck)));
    if (options.maxLength) {
      form.append("max_length", String(options.maxLength));
    }
    const headers = {};
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
    return await this.requestJson("/v1/analyses/image", {
      method: "POST",
      body: form,
      headers
    });
  }

  async getAnalysis(analysisId) {
    return await this.getJson(`/v1/analyses/${encodeURIComponent(analysisId)}`, {
      retry: true
    });
  }

  async getJob(jobId) {
    return await this.getJson(`/v1/jobs/${encodeURIComponent(jobId)}`, {
      retry: true
    });
  }

  async cancelJob(jobId) {
    return await this.requestJson(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST"
    });
  }

  async getJobEvents(jobId, afterSequence = 0) {
    const response = await this.request(
      `/v1/jobs/${encodeURIComponent(jobId)}/events?after_sequence=${afterSequence}`,
      { method: "GET" }
    );
    return await response.text();
  }

  async createLiveSession(payload) {
    return await this.requestJson("/v1/live-sessions", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  async submitLiveFrame(sessionId, payload) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/frames`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  async verifyLiveSession(sessionId, payload = {}) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  async getJson(path, options = {}) {
    return await this.requestJson(path, { method: "GET", retry: Boolean(options.retry) });
  }

  async requestJson(path, init = {}) {
    const response = await this.request(path, init);
    return await parseJsonSafe(response);
  }

  async request(path, init = {}) {
    const timeout = withTimeout(this.timeoutMs);
    const headers = new Headers(init.headers || {});
    if (this.credentials.pairingToken) {
      headers.set(PAIRING_HEADER, this.credentials.pairingToken);
    }
    try {
      const url = `${this.credentials.backendOrigin}${path}`;
      const response = await fetch(url, {
        ...init,
        headers,
        signal: timeout.controller.signal
      });
      if (!response.ok) {
        const payload = await parseJsonSafe(response);
        throw mapBackendError(payload, response.status === 404 ? EXTENSION_ERROR_CODES.jobNotFound : EXTENSION_ERROR_CODES.backendUnavailable);
      }
      response.requestId = response.headers.get(REQUEST_ID_HEADER);
      response.traceId = response.headers.get(TRACE_ID_HEADER);
      return response;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new ExtensionError(
          EXTENSION_ERROR_CODES.requestTimeout,
          "The backend request timed out."
        );
      }
      if (init.retry && (!error || error.name !== "ExtensionError")) {
        return await this.request(path, { ...init, retry: false });
      }
      if (error instanceof ExtensionError) {
        throw error;
      }
      throw new ExtensionError(
        EXTENSION_ERROR_CODES.backendUnavailable,
        "Could not connect to the configured backend."
      );
    } finally {
      timeout.done();
    }
  }
}

export function createApiClient(settings) {
  return new ApiClient(settings);
}
