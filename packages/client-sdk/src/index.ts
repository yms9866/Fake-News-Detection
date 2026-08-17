export class FndApiError extends Error {
  code: string;
  status: number;
  requestId: string | null;
  traceId: string | null;
  validationDetails: Array<{ loc?: string[]; msg?: string }>;
  backendOrigin: string | null;
  technicalDetails: string;

  constructor(
    code: string,
    message: string,
    status = 0,
    details: {
      requestId?: string | null;
      traceId?: string | null;
      validationDetails?: Array<{ loc?: string[]; msg?: string }>;
      backendOrigin?: string | null;
      technicalDetails?: string;
    } = {}
  ) {
    super(message);
    this.name = "FndApiError";
    this.code = code;
    this.status = status;
    this.requestId = details.requestId || null;
    this.traceId = details.traceId || null;
    this.validationDetails = Array.isArray(details.validationDetails) ? details.validationDetails : [];
    this.backendOrigin = details.backendOrigin || null;
    this.technicalDetails = details.technicalDetails || "";
  }
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export type OriginPolicy = "loopback" | "any";

export type RequestOptions = RequestInit & {
  timeoutMs?: number;
  retry?: boolean;
};

export function normalizeBackendOrigin(
  origin = "http://127.0.0.1:8000",
  originPolicy: OriginPolicy = "loopback"
) {
  let parsed: URL;
  try {
    parsed = new URL(String(origin));
  } catch {
    throw new FndApiError("FND_INVALID_BACKEND_ORIGIN", "Backend origin must be a valid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FndApiError("FND_INVALID_BACKEND_ORIGIN", "Backend origin must use HTTP or HTTPS.");
  }
  if (originPolicy === "loopback" && parsed.protocol === "http:" && !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new FndApiError("FND_INVALID_BACKEND_ORIGIN", "Only loopback backend origins are enabled in local mode.");
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

export function validateTextPayload(payload: { text?: string; deep_check?: boolean; max_length?: number }) {
  if (!payload || typeof payload.text !== "string" || payload.text.trim().length === 0) {
    throw new FndApiError("FND_EMPTY_TEXT", "Text analysis requires text.");
  }
  return {
    text: payload.text.trim(),
    deep_check: Boolean(payload.deep_check),
    max_length: payload.max_length || 512
  };
}

export function validateUrlPayload(payload: { url?: string; deep_check?: boolean; max_length?: number }) {
  let parsed: URL;
  try {
    parsed = new URL(String(payload && payload.url));
  } catch {
    throw new FndApiError("FND_INVALID_URL", "Enter a valid article URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new FndApiError("FND_INVALID_URL", "Only HTTP and HTTPS URLs can be analyzed.");
  }
  return {
    url: parsed.toString(),
    deep_check: Boolean(payload.deep_check),
    max_length: payload.max_length || 512
  };
}

export function safeExternalUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || /[\u0000-\u001f\u007f]/u.test(raw)) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!parsed.hostname || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function statusFallbackCode(status: number) {
  if (status === 400) return "FND_HTTP_400";
  if (status === 404) return "FND_NOT_FOUND";
  if (status === 422) return "FND_VALIDATION_ERROR";
  if (status === 429) return "FND_RATE_LIMITED";
  if (status >= 500) return "FND_SERVER_ERROR";
  return "FND_BACKEND_ERROR";
}

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, done: () => clearTimeout(id) };
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export type FndApiClientSettings = {
  backendOrigin?: string;
  apiUrl?: string;
  requestTimeoutMs?: number;
  timeoutMs?: number;
  analysisTimeoutMs?: number;
  originPolicy?: OriginPolicy;
  fetchImpl?: typeof fetch;
  pairingToken?: string | null;
};

export class FndApiClient {
  backendOrigin: string;
  timeoutMs: number;
  analysisTimeoutMs: number;
  originPolicy: OriginPolicy;
  fetchImpl: typeof fetch;
  pairingToken: string | null;

  constructor(settings: FndApiClientSettings = {}) {
    this.originPolicy = settings.originPolicy || "loopback";
    this.backendOrigin = normalizeBackendOrigin(
      settings.backendOrigin || settings.apiUrl || "http://127.0.0.1:8000",
      this.originPolicy
    );
    this.timeoutMs = settings.requestTimeoutMs || settings.timeoutMs || 60000;
    this.analysisTimeoutMs = settings.analysisTimeoutMs || this.timeoutMs;
    this.fetchImpl = settings.fetchImpl || fetch.bind(globalThis);
    this.pairingToken = settings.pairingToken || null;
  }

  get apiUrl() {
    return this.backendOrigin;
  }

  configure(settings: FndApiClientSettings = {}) {
    if (settings.originPolicy) {
      this.originPolicy = settings.originPolicy;
    }
    if (settings.backendOrigin || settings.apiUrl) {
      this.backendOrigin = normalizeBackendOrigin(
        settings.backendOrigin || settings.apiUrl,
        this.originPolicy
      );
    }
    if (settings.requestTimeoutMs || settings.timeoutMs) {
      this.timeoutMs = Number(settings.requestTimeoutMs || settings.timeoutMs);
    }
    if (settings.analysisTimeoutMs) {
      this.analysisTimeoutMs = settings.analysisTimeoutMs;
    }
    if (settings.fetchImpl) {
      this.fetchImpl = settings.fetchImpl;
    }
    if (settings.pairingToken !== undefined) {
      this.pairingToken = settings.pairingToken;
    }
  }

  live() {
    return this.getJson("/v1/health/live");
  }

  getHealth() {
    return this.live();
  }

  ready() {
    return this.getJson("/v1/health/ready");
  }

  models() {
    return this.getJson("/v1/models");
  }

  analyzeText(payload: { text?: string; deep_check?: boolean; max_length?: number }) {
    return this.requestJson("/v1/analyses/text", {
      method: "POST",
      body: JSON.stringify(validateTextPayload(payload)),
      headers: { "Content-Type": "application/json" },
      timeoutMs: this.analysisTimeoutMs
    });
  }

  analyzeUrl(payload: { url?: string; deep_check?: boolean; max_length?: number }) {
    return this.requestJson("/v1/analyses/url", {
      method: "POST",
      body: JSON.stringify(validateUrlPayload(payload)),
      headers: { "Content-Type": "application/json" },
      timeoutMs: this.analysisTimeoutMs
    });
  }

  uploadMedia(
    mediaType: string,
    file: Blob,
    options: { deepCheck?: boolean; maxLength?: number; idempotencyKey?: string; filename?: string } = {}
  ) {
    if (!["image", "audio", "video"].includes(mediaType)) {
      throw new FndApiError("FND_UNSUPPORTED_MEDIA", "Unsupported media type.");
    }
    const form = new FormData();
    form.append("file", file, options.filename || (file as File).name || `upload-${mediaType}`);
    form.append("deep_check", String(Boolean(options.deepCheck)));
    form.append("max_length", String(options.maxLength || 512));
    return this.requestJson(`/v1/analyses/${mediaType}`, {
      method: "POST",
      body: form,
      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {},
      timeoutMs: this.analysisTimeoutMs
    });
  }

  uploadImage(file: Blob, options?: { deepCheck?: boolean; maxLength?: number; filename?: string; idempotencyKey?: string }) {
    return this.uploadMedia("image", file, options);
  }

  uploadAudio(file: Blob, options?: { deepCheck?: boolean; maxLength?: number; filename?: string; idempotencyKey?: string }) {
    return this.uploadMedia("audio", file, options);
  }

  uploadVideo(file: Blob, options?: { deepCheck?: boolean; maxLength?: number; filename?: string; idempotencyKey?: string }) {
    return this.uploadMedia("video", file, options);
  }

  getAnalysis(analysisId: string) {
    return this.getJson(`/v1/analyses/${encodeURIComponent(analysisId)}`);
  }

  getJob(jobId: string) {
    return this.getJson(`/v1/jobs/${encodeURIComponent(jobId)}`);
  }

  cancelJob(jobId: string) {
    return this.requestJson(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  }

  async getJobEvents(jobId: string, afterSequence = 0) {
    const response = await this.request(
      `/v1/jobs/${encodeURIComponent(jobId)}/events?after_sequence=${Number(afterSequence) || 0}`,
      { method: "GET" }
    );
    return await response.text();
  }

  async waitForJob(
    jobId: string,
    options: { intervalMs?: number; timeoutMs?: number; onProgress?: (job: Record<string, unknown>) => void } = {}
  ) {
    const intervalMs = options.intervalMs || 1000;
    const timeoutMs = options.timeoutMs || 180000;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const job = await this.getJob(jobId);
      if (options.onProgress) {
        options.onProgress(job);
      }
      const status = String(job.status || "");
      if (["completed", "failed", "cancelled"].includes(status)) {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new FndApiError("FND_REQUEST_TIMEOUT", "The media job timed out before it finished.");
  }

  createLiveSession(payload: Record<string, unknown>) {
    return this.requestJson("/v1/live-sessions", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  getLiveSession(sessionId: string) {
    return this.getJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}`);
  }

  submitLiveFrame(sessionId: string, payload: Record<string, unknown>) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/frames`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  verifyLiveSession(sessionId: string, payload: Record<string, unknown> = {}) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" }
    });
  }

  pauseLiveSession(sessionId: string) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/pause`, { method: "POST" });
  }

  resumeLiveSession(sessionId: string) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/resume`, { method: "POST" });
  }

  stopLiveSession(sessionId: string) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/stop`, { method: "POST" });
  }

  cancelLiveSession(sessionId: string) {
    return this.requestJson(`/v1/live-sessions/${encodeURIComponent(sessionId)}/cancel`, { method: "POST" });
  }

  async getLiveSessionEvents(sessionId: string, afterSequence = 0) {
    const response = await this.request(
      `/v1/live-sessions/${encodeURIComponent(sessionId)}/events?after_sequence=${Number(afterSequence) || 0}`,
      { method: "GET" }
    );
    return await response.text();
  }

  getJson(path: string, options: RequestOptions = {}) {
    return this.requestJson(path, { method: "GET", ...options });
  }

  async requestJson(path: string, init: RequestOptions = {}) {
    const response = await this.request(path, init);
    const payload = await parseJsonSafe(response);
    if (payload && typeof payload === "object") {
      payload.request_id = payload.request_id || response.headers?.get?.("X-Request-ID");
      payload.trace_id = payload.trace_id || response.headers?.get?.("X-Trace-ID");
      return payload;
    }
    throw new FndApiError(
      "FND_MALFORMED_RESPONSE",
      "The backend returned a response that was not valid JSON.",
      response.status,
      {
        requestId: response.headers?.get?.("X-Request-ID"),
        traceId: response.headers?.get?.("X-Trace-ID"),
        backendOrigin: this.backendOrigin
      }
    );
  }

  async request(path: string, init: RequestOptions = {}): Promise<Response> {
    const timeoutMs = init.timeoutMs || this.timeoutMs;
    const timeout = withTimeout(timeoutMs);
    const headers = new Headers(init.headers || {});
    if (this.pairingToken) {
      headers.set("X-FND-Pairing-Token", this.pairingToken);
      headers.set("X-Pairing-Token", this.pairingToken);
    }
    const { timeoutMs: _timeoutMs, retry, ...fetchInit } = init;
    try {
      const response = await this.fetchImpl(`${this.backendOrigin}${path}`, {
        ...fetchInit,
        headers,
        signal: timeout.controller.signal
      });
      if (!response.ok) {
        const payload = await parseJsonSafe(response);
        throw new FndApiError(
          payload && payload.error_code ? payload.error_code : statusFallbackCode(response.status),
          payload && payload.message ? payload.message : "Backend request failed.",
          response.status,
          {
            requestId: payload?.request_id || response.headers?.get?.("X-Request-ID"),
            traceId: payload?.trace_id || response.headers?.get?.("X-Trace-ID"),
            validationDetails: Array.isArray(payload?.details) ? payload.details : [],
            backendOrigin: this.backendOrigin,
            technicalDetails: payload ? JSON.stringify(payload) : ""
          }
        );
      }
      return response;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
        throw new FndApiError(
          "FND_REQUEST_TIMEOUT",
          `The request timed out before the local API responded at ${this.backendOrigin}.`,
          0,
          { backendOrigin: this.backendOrigin }
        );
      }
      if (error instanceof FndApiError) {
        throw error;
      }
      if (retry) {
        return await this.request(path, { ...init, retry: false });
      }
      const cause = error && typeof error === "object" && "cause" in error ? (error as { cause?: { code?: string } }).cause : undefined;
      const refused = cause?.code === "ECONNREFUSED";
      throw new FndApiError(
        refused ? "FND_CONNECTION_REFUSED" : "FND_CORS_OR_NETWORK_FAILURE",
        refused
          ? `The local API could not be reached at ${this.backendOrigin}.`
          : `The request to ${this.backendOrigin} could not be completed. This may be a CORS or network failure.`,
        0,
        {
          backendOrigin: this.backendOrigin,
          technicalDetails: error instanceof Error ? error.message : String(error || "")
        }
      );
    } finally {
      timeout.done();
    }
  }
}

export function createFndApiClient(settings?: FndApiClientSettings) {
  return new FndApiClient(settings);
}

export const WebApiClient = FndApiClient;
export const WebClientError = FndApiError;
export const createWebApiClient = createFndApiClient;
export const DesktopApiClient = FndApiClient;
export const DesktopApiError = FndApiError;
export const createDesktopApiClient = createFndApiClient;
export const MobileApiClient = FndApiClient;
export const MobileApiError = FndApiError;
export const ApiClient = FndApiClient;
export const createApiClient = createFndApiClient;
