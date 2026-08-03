import { normalizeApiUrl, resolveApiUrl } from "../config/api";

export const MOBILE_API_CLIENT_ERROR_CODES = {
  BACKEND_ERROR: "MOBILE_BACKEND_ERROR",
  NETWORK_UNREACHABLE: "MOBILE_NETWORK_UNREACHABLE",
  REQUEST_TIMEOUT: "MOBILE_REQUEST_TIMEOUT"
};

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_ANALYSIS_TIMEOUT_MS = 120000;

export class MobileApiError extends Error {
  constructor(code, message, options = {}) {
    const authToken = options["authToken"] || "";
    const redacted = authToken ? String(message).split(authToken).join("[redacted]") : String(message);
    super(redacted);
    this.name = "MobileApiError";
    this["code"] = code;
    this["status"] = options["status"] || null;
    this["details"] = options["details"] || null;
  }
}

export class MobileApiClient {
  constructor(settings = {}) {
    const configuredUrl = settings["apiUrl"] || settings["backendOrigin"];
    this["apiUrl"] = normalizeApiUrl(configuredUrl || resolveApiUrl({
      env: settings["env"],
      platform: settings["platform"]
    }));
    this["backendOrigin"] = this["apiUrl"];
    this["timeoutMs"] = Number(settings["timeoutMs"] || DEFAULT_TIMEOUT_MS);
    this["analysisTimeoutMs"] = Number(settings["analysisTimeoutMs"] || DEFAULT_ANALYSIS_TIMEOUT_MS);
    this["fetchImpl"] = settings["fetchImpl"] || fetch;
    this["authToken"] = settings["authToken"] || "";
  }

  setAuthToken(token) {
    this["authToken"] = token ? String(token) : "";
  }

  getHealth() {
    return this.requestJson("/v1/health/live", { method: "GET" });
  }

  async signIn(payload = {}) {
    const response = await this.requestJson("/v1/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({
        username: String(payload["username"] || "mobile-reviewer").trim() || "mobile-reviewer",
        tenant_id: String(payload["tenant_id"] || "local").trim() || "local",
        client_type: "mobile"
      }),
      headers: { "Content-Type": "application/json" }
    });
    if (response && response["access_token"]) {
      this.setAuthToken(response["access_token"]);
    }
    return response;
  }

  restoreSession() {
    return this.requestJson("/v1/auth/session", { method: "GET" });
  }

  async refreshSession() {
    const response = await this.requestJson("/v1/auth/refresh", { method: "POST" });
    if (response && response["access_token"]) {
      this.setAuthToken(response["access_token"]);
    }
    return response;
  }

  async signOut() {
    try {
      return await this.requestJson("/v1/auth/sign-out", { method: "POST" });
    } finally {
      this.setAuthToken("");
    }
  }

  analyzeText(payload) {
    return this.requestJson("/v1/analyses/text", {
      method: "POST",
      body: JSON.stringify({
        text: String(payload.text || "").trim(),
        deep_check: Boolean(payload.deep_check),
        max_length: payload.max_length || 512
      }),
      headers: { "Content-Type": "application/json" }
    }, { timeoutMs: this["analysisTimeoutMs"] });
  }

  analyzeUrl(payload) {
    return this.requestJson("/v1/analyses/url", {
      method: "POST",
      body: JSON.stringify({
        url: String(payload.url || ""),
        deep_check: Boolean(payload.deep_check),
        max_length: payload.max_length || 512
      }),
      headers: { "Content-Type": "application/json" }
    }, { timeoutMs: this["analysisTimeoutMs"] });
  }

  uploadMedia(mediaType, file, options = {}) {
    const form = new FormData();
    form.append("file", file, file.name || `mobile-${mediaType}`);
    form.append("deep_check", String(Boolean(options["deepCheck"])));
    form.append("max_length", String(options["maxLength"] || 512));
    return this.requestJson(
      `/v1/analyses/${mediaType}`,
      { method: "POST", body: form },
      { timeoutMs: this["analysisTimeoutMs"] }
    );
  }

  getJob(jobId) {
    return this.requestJson(`/v1/jobs/${encodeURIComponent(jobId)}`, { method: "GET" });
  }

  cancelJob(jobId) {
    return this.requestJson(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
  }

  getAnalysis(analysisId) {
    return this.requestJson(`/v1/analyses/${encodeURIComponent(analysisId)}`, { method: "GET" });
  }

  async requestJson(path, init, options = {}) {
    const controller = new AbortController();
    const timeoutMs = Number(options["timeoutMs"] || this["timeoutMs"]);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
      ...(init && init.headers ? init.headers : {})
    };
    if (this["authToken"]) {
      headers.Authorization = `Bearer ${this["authToken"]}`;
    }

    try {
      const response = await this["fetchImpl"](`${this["apiUrl"]}${path}`, {
        ...(init || {}),
        headers,
        signal: controller.signal
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        throw new MobileApiError(
          payload && payload.error_code ? payload.error_code : MOBILE_API_CLIENT_ERROR_CODES.BACKEND_ERROR,
          backendMessage(payload, `Backend request failed with HTTP ${response.status}.`),
          { authToken: this["authToken"], details: payload, status: response.status }
        );
      }
      return payload;
    } catch (caught) {
      if (caught instanceof MobileApiError) {
        throw caught;
      }
      if (caught && caught["name"] === "AbortError") {
        throw new MobileApiError(
          MOBILE_API_CLIENT_ERROR_CODES.REQUEST_TIMEOUT,
          `Backend request timed out after ${timeoutMs}ms.`,
          { authToken: this["authToken"] }
        );
      }
      throw new MobileApiError(
        MOBILE_API_CLIENT_ERROR_CODES.NETWORK_UNREACHABLE,
        caught instanceof Error ? caught.message : "Backend is unreachable.",
        { authToken: this["authToken"] }
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readPayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function backendMessage(payload, fallback) {
  if (payload && payload.error_code && payload.message) {
    return `${payload.error_code}: ${payload.message}`;
  }
  if (payload && payload.message) {
    return payload.message;
  }
  if (payload && payload.detail) {
    return typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
  }
  return fallback;
}
