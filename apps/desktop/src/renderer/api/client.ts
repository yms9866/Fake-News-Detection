import {
  DESKTOP_ERROR_CODES,
  DesktopRuntimeError,
  normalizeBackendOrigin,
  validateTextRequest,
  validateTimeoutMs,
  validateUrlRequest
} from "../../shared/runtime-validation.js";

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function statusFallbackCode(status) {
  if (status === 400) {
    return "DESKTOP_HTTP_400";
  }
  if (status === 401 || status === 403) {
    return "DESKTOP_AUTHORIZATION_FAILED";
  }
  if (status === 404) {
    return "DESKTOP_NOT_FOUND";
  }
  if (status === 422) {
    return "DESKTOP_VALIDATION_ERROR";
  }
  if (status === 429) {
    return "DESKTOP_RATE_LIMITED";
  }
  if (status >= 500) {
    return "DESKTOP_SERVER_ERROR";
  }
  return "DESKTOP_BACKEND_ERROR";
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(timeoutId) };
}

export class DesktopApiError extends Error {
  constructor(code, message, status = 0, details = {}) {
    super(message);
    this.name = "DesktopApiError";
    this.code = code;
    this.status = status;
    this.requestId = details.requestId || null;
    this.traceId = details.traceId || null;
    this.validationDetails = Array.isArray(details.validationDetails) ? details.validationDetails : [];
  }
}

export class DesktopApiClient {
  constructor(settings = {}) {
    this.configure(settings);
  }

  configure(settings = {}) {
    this.backendOrigin = normalizeBackendOrigin(settings.backendOrigin || "http://127.0.0.1:8000");
    this.requestTimeoutMs = validateTimeoutMs(settings.requestTimeoutMs, 60000);
    this.pairingToken = typeof settings.pairingToken === "string" && settings.pairingToken.trim()
      ? settings.pairingToken.trim()
      : null;
    this.authToken = typeof settings.authToken === "string" && settings.authToken.trim()
      ? settings.authToken.trim()
      : null;
  }

  setAuthToken(token) {
    this.authToken = typeof token === "string" && token.trim() ? token.trim() : null;
  }

  async live() {
    return await this.getJson("/v1/health/live");
  }

  async ready() {
    return await this.getJson("/v1/health/ready");
  }

  async models() {
    return await this.getJson("/v1/models");
  }

  async signIn(payload = {}) {
    const response = await this.requestJson("/v1/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({
        username: String(payload.username || "desktop-reviewer").trim() || "desktop-reviewer",
        tenant_id: String(payload.tenant_id || "local").trim() || "local",
        client_type: "desktop"
      }),
      headers: { "Content-Type": "application/json" }
    });
    if (response && response.access_token) {
      this.setAuthToken(response.access_token);
    }
    return response;
  }

  async restoreSession() {
    return await this.getJson("/v1/auth/session");
  }

  async refreshSession() {
    const response = await this.requestJson("/v1/auth/refresh", {
      method: "POST"
    });
    if (response && response.access_token) {
      this.setAuthToken(response.access_token);
    }
    return response;
  }

  async signOut() {
    try {
      return await this.requestJson("/v1/auth/sign-out", {
        method: "POST"
      });
    } finally {
      this.setAuthToken(null);
    }
  }

  async analyzeText(payload) {
    return await this.requestJson("/v1/analyses/text", {
      method: "POST",
      body: JSON.stringify(validateTextRequest(payload)),
      headers: { "Content-Type": "application/json" }
    });
  }

  async analyzeUrl(payload) {
    return await this.requestJson("/v1/analyses/url", {
      method: "POST",
      body: JSON.stringify(validateUrlRequest(payload)),
      headers: { "Content-Type": "application/json" }
    });
  }

  async uploadImage(file, options = {}) {
    return await this.uploadMedia("image", file, options);
  }

  async uploadAudio(file, options = {}) {
    return await this.uploadMedia("audio", file, options);
  }

  async uploadVideo(file, options = {}) {
    return await this.uploadMedia("video", file, options);
  }

  async uploadMedia(mediaType, file, options = {}) {
    if (!["image", "audio", "video"].includes(mediaType)) {
      throw new DesktopRuntimeError(DESKTOP_ERROR_CODES.invalidPayload, "Unsupported media type.");
    }
    if (!file) {
      throw new DesktopRuntimeError(DESKTOP_ERROR_CODES.invalidPayload, "A media file is required.");
    }
    const form = new FormData();
    form.append("file", file, file.name || `desktop-${mediaType}`);
    form.append("deep_check", String(Boolean(options.deepCheck)));
    if (options.maxLength) {
      form.append("max_length", String(options.maxLength));
    }
    const headers = {};
    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }
    return await this.requestJson(`/v1/analyses/${mediaType}`, {
      method: "POST",
      body: form,
      headers
    });
  }

  async getAnalysis(analysisId) {
    return await this.getJson(`/v1/analyses/${encodeURIComponent(analysisId)}`);
  }

  async getJob(jobId) {
    return await this.getJson(`/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  async cancelJob(jobId) {
    return await this.requestJson(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST"
    });
  }

  async getJobEvents(jobId, afterSequence = 0) {
    const response = await this.request(
      `/v1/jobs/${encodeURIComponent(jobId)}/events?after_sequence=${Number(afterSequence) || 0}`,
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

  async getLiveSession(sessionId) {
    return await this.getJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}`);
  }

  async submitLiveFrame(sessionId, payload) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/frames`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  async pauseLiveSession(sessionId) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/pause`, {
      method: "POST"
    });
  }

  async resumeLiveSession(sessionId) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/resume`, {
      method: "POST"
    });
  }

  async stopLiveSession(sessionId) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: "POST"
    });
  }

  async cancelLiveSession(sessionId) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/cancel`, {
      method: "POST"
    });
  }

  async verifyLiveSession(sessionId, payload = {}) {
    return await this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  async getLiveSessionEvents(sessionId, afterSequence = 0) {
    const response = await this.request(
      `/v1/live-sessions/${encodeURIComponent(sessionId)}/events?after_sequence=${Number(afterSequence) || 0}`,
      { method: "GET" }
    );
    return await response.text();
  }

  async getJson(path) {
    return await this.requestJson(path, { method: "GET" });
  }

  async requestJson(path, init = {}) {
    const response = await this.request(path, init);
    const payload = await parseJsonSafe(response);
    if (payload && typeof payload === "object") {
      payload.request_id = payload.request_id || response.headers.get("X-Request-ID");
      payload.trace_id = payload.trace_id || response.headers.get("X-Trace-ID");
      return payload;
    }
    throw new DesktopApiError(
      "DESKTOP_MALFORMED_RESPONSE",
      "The backend returned a response that was not valid JSON.",
      response.status,
      {
        requestId: response.headers.get("X-Request-ID"),
        traceId: response.headers.get("X-Trace-ID")
      }
    );
  }

  async request(path, init = {}) {
    const timeout = withTimeout(this.requestTimeoutMs);
    const headers = new Headers(init.headers || {});
    if (this.pairingToken) {
      headers.set("X-Pairing-Token", this.pairingToken);
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
        const errorCode = payload && payload.error_code ? payload.error_code : statusFallbackCode(response.status);
        const message = payload && payload.message ? payload.message : "Backend request failed.";
        throw new DesktopApiError(errorCode, message, response.status, {
          requestId: payload && payload.request_id ? payload.request_id : response.headers.get("X-Request-ID"),
          traceId: payload && payload.trace_id ? payload.trace_id : response.headers.get("X-Trace-ID"),
          validationDetails: payload && Array.isArray(payload.details) ? payload.details : []
        });
      }
      return response;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new DesktopApiError(DESKTOP_ERROR_CODES.backendTimeout, "The backend request timed out.");
      }
      if (error instanceof DesktopApiError || error instanceof DesktopRuntimeError) {
        throw error;
      }
      throw new DesktopApiError(DESKTOP_ERROR_CODES.backendUnavailable, "Could not connect to the local backend.");
    } finally {
      timeout.done();
    }
  }
}

export function createDesktopApiClient(settings) {
  return new DesktopApiClient(settings);
}
