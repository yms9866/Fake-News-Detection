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

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(timeoutId) };
}

export class DesktopApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = "DesktopApiError";
    this.code = code;
    this.status = status;
  }
}

export class DesktopApiClient {
  constructor(settings = {}) {
    this.configure(settings);
  }

  configure(settings = {}) {
    this.backendOrigin = normalizeBackendOrigin(settings.backendOrigin || "http://127.0.0.1:8000");
    this.requestTimeoutMs = validateTimeoutMs(settings.requestTimeoutMs, 15000);
    this.pairingToken = typeof settings.pairingToken === "string" && settings.pairingToken.trim()
      ? settings.pairingToken.trim()
      : null;
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

  async getJson(path) {
    return await this.requestJson(path, { method: "GET" });
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
    const timeout = withTimeout(this.requestTimeoutMs);
    const headers = new Headers(init.headers || {});
    if (this.pairingToken) {
      headers.set("X-Pairing-Token", this.pairingToken);
    }
    try {
      const response = await fetch(`${this.backendOrigin}${path}`, {
        ...init,
        headers,
        signal: timeout.controller.signal
      });
      if (!response.ok) {
        const payload = await parseJsonSafe(response);
        const errorCode = payload && payload.error_code ? payload.error_code : DESKTOP_ERROR_CODES.backendUnavailable;
        const message = payload && payload.message ? payload.message : "Backend request failed.";
        throw new DesktopApiError(errorCode, message, response.status);
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
