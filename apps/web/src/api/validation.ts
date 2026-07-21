const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export class WebClientError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = "WebClientError";
    this.code = code;
    this.status = status;
  }
}

export function normalizeBackendOrigin(origin = "http://127.0.0.1:8000") {
  let parsed;
  try {
    parsed = new URL(String(origin));
  } catch {
    throw new WebClientError("WEB_INVALID_BACKEND_ORIGIN", "Backend origin must be a valid URL.");
  }
  if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new WebClientError("WEB_INVALID_BACKEND_ORIGIN", "Only loopback backend origins are enabled in local mode.");
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

export function validateTextPayload(payload) {
  if (!payload || typeof payload.text !== "string" || payload.text.trim().length === 0) {
    throw new WebClientError("WEB_EMPTY_TEXT", "Text analysis requires text.");
  }
  return {
    text: payload.text.trim(),
    deep_check: Boolean(payload.deep_check),
    max_length: payload.max_length || 512
  };
}

export function validateUrlPayload(payload) {
  let parsed;
  try {
    parsed = new URL(String(payload && payload.url));
  } catch {
    throw new WebClientError("WEB_INVALID_URL", "Enter a valid article URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebClientError("WEB_INVALID_URL", "Only HTTP and HTTPS URLs can be analyzed.");
  }
  return {
    url: parsed.toString(),
    deep_check: Boolean(payload.deep_check),
    max_length: payload.max_length || 512
  };
}

export function safeExternalUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
