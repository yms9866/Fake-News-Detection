export class MobileApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MobileApiError";
    this.code = code;
  }
}

export class MobileApiClient {
  constructor(settings = {}) {
    this.backendOrigin = settings.backendOrigin || "http://127.0.0.1:8000";
    this.timeoutMs = settings.timeoutMs || 15000;
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
    });
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
    });
  }

  uploadMedia(mediaType, file, options = {}) {
    const form = new FormData();
    form.append("file", file, file.name || `mobile-${mediaType}`);
    form.append("deep_check", String(Boolean(options.deepCheck)));
    form.append("max_length", String(options.maxLength || 512));
    return this.requestJson(`/v1/analyses/${mediaType}`, { method: "POST", body: form });
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

  async requestJson(path, init) {
    const response = await fetch(`${this.backendOrigin}${path}`, init);
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new MobileApiError(payload && payload.error_code ? payload.error_code : "MOBILE_BACKEND_ERROR", payload && payload.message ? payload.message : "Backend request failed.");
    }
    return payload;
  }
}
