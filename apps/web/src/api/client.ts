import { normalizeBackendOrigin, validateTextPayload, validateUrlPayload, WebClientError } from "./validation.js";

export { WebClientError } from "./validation.js";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function statusFallbackCode(status) {
  if (status === 400) {
    return "WEB_HTTP_400";
  }
  if (status === 401 || status === 403) {
    return "WEB_AUTHORIZATION_FAILED";
  }
  if (status === 404) {
    return "WEB_NOT_FOUND";
  }
  if (status === 422) {
    return "WEB_VALIDATION_ERROR";
  }
  if (status === 429) {
    return "WEB_RATE_LIMITED";
  }
  if (status >= 500) {
    return "WEB_SERVER_ERROR";
  }
  return "WEB_BACKEND_ERROR";
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(id) };
}

export class WebApiClient {
  constructor(settings = {}) {
    this.backendOrigin = normalizeBackendOrigin(settings.backendOrigin);
    this.timeoutMs = settings.requestTimeoutMs || 60000;
    this.csrfToken = settings.csrfToken || null;
    this.authToken = settings.authToken || "";
  }

  setAuthToken(token) {
    this.authToken = token || "";
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

  async signIn(payload) {
    const session = await this.requestJson("/v1/auth/sign-in", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
    this.setAuthToken(session.access_token);
    return session;
  }

  restoreSession() {
    return this.getJson("/v1/auth/session");
  }

  async refreshSession() {
    const session = await this.requestJson("/v1/auth/refresh", { method: "POST" });
    this.setAuthToken(session.access_token);
    return session;
  }

  async signOut() {
    const result = await this.requestJson("/v1/auth/sign-out", { method: "POST" });
    this.setAuthToken("");
    return result;
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
      return payload;
    }
    throw new WebClientError(
      "WEB_MALFORMED_RESPONSE",
      "The backend returned a response that was not valid JSON.",
      response.status,
      {
        requestId: response.headers.get("X-Request-ID"),
        traceId: response.headers.get("X-Trace-ID"),
        backendOrigin: this.backendOrigin
      }
    );
  }

  async request(path, init = {}) {
    const timeout = withTimeout(this.timeoutMs);
    const headers = new Headers(init.headers || {});
    if (this.csrfToken && init.method && init.method !== "GET") {
      headers.set("X-CSRF-Token", this.csrfToken);
    }
    if (this.authToken) {
      headers.set("Authorization", `Bearer ${this.authToken}`);
    }
    try {
      const response = await fetch(`${this.backendOrigin}${path}`, {
        ...init,
        headers,
        signal: timeout.controller.signal
      });
      if (!response.ok) {
        const payload = await parseJsonSafe(response);
        const requestId = payload && payload.request_id ? payload.request_id : response.headers.get("X-Request-ID");
        const traceId = payload && payload.trace_id ? payload.trace_id : response.headers.get("X-Trace-ID");
        throw new WebClientError(
          payload && payload.error_code ? payload.error_code : statusFallbackCode(response.status),
          payload && payload.message ? payload.message : "Backend request failed.",
          response.status,
          {
            requestId,
            traceId,
            validationDetails: payload && Array.isArray(payload.details) ? payload.details : [],
            backendOrigin: this.backendOrigin,
            technicalDetails: payload ? JSON.stringify(payload) : ""
          }
        );
      }
      return response;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new WebClientError(
          "WEB_REQUEST_TIMEOUT",
          `The local API did not respond before the timeout at ${this.backendOrigin}.`,
          0,
          { backendOrigin: this.backendOrigin }
        );
      }
      if (error instanceof WebClientError) {
        throw error;
      }
      const causeCode = error && error.cause && error.cause.code ? error.cause.code : "";
      const refused = causeCode === "ECONNREFUSED";
      throw new WebClientError(
        refused ? "WEB_CONNECTION_REFUSED" : "WEB_CORS_OR_NETWORK_FAILURE",
        refused
          ? `The local API could not be reached at ${this.backendOrigin}.`
          : `The browser could not complete the request to ${this.backendOrigin}. This may be a CORS or network failure.`,
        0,
        {
          backendOrigin: this.backendOrigin,
          technicalDetails: error && error.message ? error.message : String(error || "")
        }
      );
    } finally {
      timeout.done();
    }
  }
}

export function createWebApiClient(settings) {
  return new WebApiClient(settings);
}
