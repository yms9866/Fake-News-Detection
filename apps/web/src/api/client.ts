import { normalizeBackendOrigin, validateTextPayload, validateUrlPayload, WebClientError } from "./validation.js";

export { WebClientError } from "./validation.js";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(id) };
}

export class WebApiClient {
  constructor(settings = {}) {
    this.backendOrigin = normalizeBackendOrigin(settings.backendOrigin);
    this.timeoutMs = settings.requestTimeoutMs || 15000;
    this.csrfToken = settings.csrfToken || null;
  }

  live() {
    return this.getJson("/v1/health/live");
  }

  ready() {
    return this.getJson("/v1/health/ready");
  }

  models() {
    return this.getJson("/v1/models");
  }

  analyzeText(payload) {
    return this.requestJson("/v1/analyses/text", {
      method: "POST",
      body: JSON.stringify(validateTextPayload(payload)),
      headers: { "Content-Type": "application/json" }
    });
  }

  analyzeUrl(payload) {
    return this.requestJson("/v1/analyses/url", {
      method: "POST",
      body: JSON.stringify(validateUrlPayload(payload)),
      headers: { "Content-Type": "application/json" }
    });
  }

  uploadMedia(mediaType, file, options = {}) {
    if (!["image", "audio", "video"].includes(mediaType)) {
      throw new WebClientError("WEB_UNSUPPORTED_MEDIA", "Unsupported media type.");
    }
    const form = new FormData();
    form.append("file", file, file.name || `web-${mediaType}`);
    form.append("deep_check", String(Boolean(options.deepCheck)));
    form.append("max_length", String(options.maxLength || 512));
    return this.requestJson(`/v1/analyses/${mediaType}`, {
      method: "POST",
      body: form,
      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}
    });
  }

  uploadImage(file, options) {
    return this.uploadMedia("image", file, options);
  }

  uploadAudio(file, options) {
    return this.uploadMedia("audio", file, options);
  }

  uploadVideo(file, options) {
    return this.uploadMedia("video", file, options);
  }

  getAnalysis(analysisId) {
    return this.getJson(`/v1/analyses/${encodeURIComponent(analysisId)}`);
  }

  getJob(jobId) {
    return this.getJson(`/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  cancelJob(jobId) {
    return this.requestJson(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  }

  createLiveSession(payload) {
    return this.requestJson("/v1/live-sessions", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  submitLiveFrame(sessionId, payload) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/frames`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  verifyLiveSession(sessionId, payload) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/verify`, {
      method: "POST",
      body: JSON.stringify(payload || {}),
      headers: { "Content-Type": "application/json" }
    });
  }

  getJson(path) {
    return this.requestJson(path, { method: "GET" });
  }

  async requestJson(path, init = {}) {
    const response = await this.request(path, init);
    const payload = await parseJsonSafe(response);
    if (payload && typeof payload === "object") {
      payload.request_id = payload.request_id || response.headers.get("X-Request-ID");
      payload.trace_id = payload.trace_id || response.headers.get("X-Trace-ID");
    }
    return payload;
  }

  async request(path, init = {}) {
    const timeout = withTimeout(this.timeoutMs);
    const headers = new Headers(init.headers || {});
    if (this.csrfToken && init.method && init.method !== "GET") {
      headers.set("X-CSRF-Token", this.csrfToken);
    }
    try {
      const response = await fetch(`${this.backendOrigin}${path}`, {
        ...init,
        headers,
        signal: timeout.controller.signal
      });
      if (!response.ok) {
        const payload = await parseJsonSafe(response);
        throw new WebClientError(
          payload && payload.error_code ? payload.error_code : "WEB_BACKEND_ERROR",
          payload && payload.message ? payload.message : "Backend request failed.",
          response.status
        );
      }
      return response;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new WebClientError("WEB_REQUEST_TIMEOUT", "The backend request timed out.");
      }
      if (error instanceof WebClientError) {
        throw error;
      }
      throw new WebClientError("WEB_BACKEND_UNAVAILABLE", "Could not connect to the backend.");
    } finally {
      timeout.done();
    }
  }
}

export function createWebApiClient(settings) {
  return new WebApiClient(settings);
}
