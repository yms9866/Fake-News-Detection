export const DESKTOP_ERROR_CODES = Object.freeze({
  invalidChannel: "DESKTOP_INVALID_IPC_CHANNEL",
  invalidPayload: "DESKTOP_INVALID_PAYLOAD",
  invalidBackendOrigin: "DESKTOP_INVALID_BACKEND_ORIGIN",
  backendUnavailable: "DESKTOP_BACKEND_UNAVAILABLE",
  backendTimeout: "DESKTOP_BACKEND_TIMEOUT",
  capturePermissionRequired: "DESKTOP_CAPTURE_PERMISSION_REQUIRED",
  captureSourceRequired: "DESKTOP_CAPTURE_SOURCE_REQUIRED",
  unsafeExternalUrl: "DESKTOP_UNSAFE_EXTERNAL_URL"
});

export const ALLOWED_IPC_CHANNELS = Object.freeze({
  backendStatus: "desktop:backend:status",
  backendStart: "desktop:backend:start",
  backendStop: "desktop:backend:stop",
  backendLogs: "desktop:backend:logs",
  captureSources: "desktop:capture:sources",
  captureOnce: "desktop:capture:once",
  settingsGet: "desktop:settings:get",
  settingsSave: "desktop:settings:save",
  settingsClear: "desktop:settings:clear",
  historyList: "desktop:history:list",
  historySave: "desktop:history:save",
  historyClear: "desktop:history:clear",
  diagnosticsGet: "desktop:diagnostics:get",
  externalOpen: "desktop:external:open"
});

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export class DesktopRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DesktopRuntimeError";
    this.code = code;
    this.details = details;
  }
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeBackendOrigin(origin) {
  const raw = String(origin || "http://127.0.0.1:8000").trim();
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.invalidBackendOrigin,
      "Backend origin must be a valid loopback URL."
    );
  }
  if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.invalidBackendOrigin,
      "Desktop can only connect to a local loopback backend by default."
    );
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/u, "");
}

export function validateTimeoutMs(value, fallback = 15000) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.round(parsed), 1000), 120000);
}

export function validateMaxLength(value, fallback = 512) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 128 || parsed > 8192) {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.invalidPayload,
      "max_length must be between 128 and 8192."
    );
  }
  return parsed;
}

export function validateTextRequest(payload) {
  if (!isPlainObject(payload) || typeof payload.text !== "string" || payload.text.trim().length === 0) {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.invalidPayload,
      "Text analysis requires non-empty text."
    );
  }
  return {
    text: payload.text.trim(),
    deep_check: Boolean(payload.deep_check),
    max_length: validateMaxLength(payload.max_length)
  };
}

export function validateUrlRequest(payload) {
  if (!isPlainObject(payload) || typeof payload.url !== "string") {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.invalidPayload,
      "URL analysis requires a URL."
    );
  }
  let parsed;
  try {
    parsed = new URL(payload.url);
  } catch {
    throw new DesktopRuntimeError(DESKTOP_ERROR_CODES.invalidPayload, "URL must be valid.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.invalidPayload,
      "Only HTTP and HTTPS URLs can be analyzed."
    );
  }
  return {
    url: parsed.toString(),
    deep_check: Boolean(payload.deep_check),
    max_length: validateMaxLength(payload.max_length)
  };
}

export function validateCaptureRequest(payload) {
  if (!isPlainObject(payload) || typeof payload.sourceId !== "string" || payload.sourceId.trim().length === 0) {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.captureSourceRequired,
      "A capture source must be selected before capture."
    );
  }
  const crop = isPlainObject(payload.crop)
    ? {
        x: Math.max(0, Number(payload.crop.x || 0)),
        y: Math.max(0, Number(payload.crop.y || 0)),
        width: Math.max(1, Number(payload.crop.width || 1)),
        height: Math.max(1, Number(payload.crop.height || 1))
      }
    : null;
  return {
    sourceId: payload.sourceId.trim(),
    sourceType: payload.sourceType === "window" ? "window" : "screen",
    confirm: payload.confirm === true,
    crop
  };
}

export function validateSettings(payload) {
  const value = isPlainObject(payload) ? payload : {};
  return {
    backendOrigin: normalizeBackendOrigin(value.backendOrigin),
    defaultDeepCheck: Boolean(value.defaultDeepCheck),
    defaultMaxLength: validateMaxLength(value.defaultMaxLength, 512),
    startupTimeoutMs: validateTimeoutMs(value.startupTimeoutMs, 30000),
    requestTimeoutMs: validateTimeoutMs(value.requestTimeoutMs, 15000),
    pairingToken: typeof value.pairingToken === "string" && value.pairingToken.trim()
      ? value.pairingToken.trim()
      : null
  };
}

export function validateExternalUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    throw new DesktopRuntimeError(DESKTOP_ERROR_CODES.unsafeExternalUrl, "External link is not a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.unsafeExternalUrl,
      "Only HTTP and HTTPS links can be opened."
    );
  }
  return parsed.toString();
}

export function redactSecret(value) {
  return String(value || "")
    .replace(/(pairing[_-]?token=)[^&\s]+/giu, "$1[redacted]")
    .replace(/(token\s*[:=]\s*)[^\s,]+/giu, "$1[redacted]");
}

export function validateIpcRequest(channel, payload = {}) {
  const allowed = new Set(Object.values(ALLOWED_IPC_CHANNELS));
  if (!allowed.has(channel)) {
    throw new DesktopRuntimeError(
      DESKTOP_ERROR_CODES.invalidChannel,
      "Renderer attempted to call an unsupported desktop channel."
    );
  }
  switch (channel) {
    case ALLOWED_IPC_CHANNELS.captureSources:
      return {
        sourceType: isPlainObject(payload) && payload.sourceType === "window" ? "window" : "screen"
      };
    case ALLOWED_IPC_CHANNELS.captureOnce:
      return validateCaptureRequest(payload);
    case ALLOWED_IPC_CHANNELS.settingsSave:
      return validateSettings(payload);
    case ALLOWED_IPC_CHANNELS.externalOpen:
      return { url: validateExternalUrl(isPlainObject(payload) ? payload.url : payload) };
    case ALLOWED_IPC_CHANNELS.historySave:
      if (!isPlainObject(payload) || typeof payload.analysisId !== "string") {
        throw new DesktopRuntimeError(DESKTOP_ERROR_CODES.invalidPayload, "History item requires an analysis id.");
      }
      return {
        analysisId: payload.analysisId,
        jobId: typeof payload.jobId === "string" ? payload.jobId : null,
        inputType: typeof payload.inputType === "string" ? payload.inputType : "unknown",
        finalVerdict: typeof payload.finalVerdict === "string" ? payload.finalVerdict : null,
        createdAt: typeof payload.createdAt === "string" ? payload.createdAt : new Date().toISOString()
      };
    default:
      return {};
  }
}
