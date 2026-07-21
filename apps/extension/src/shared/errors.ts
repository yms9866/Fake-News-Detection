export const EXTENSION_ERROR_CODES = {
  backendUnavailable: "BACKEND_UNAVAILABLE",
  backendNotReady: "BACKEND_NOT_READY",
  requestTimeout: "REQUEST_TIMEOUT",
  invalidPage: "INVALID_PAGE",
  noSelectedText: "NO_SELECTED_TEXT",
  articleExtractionFailed: "ARTICLE_EXTRACTION_FAILED",
  unsupportedPageUrl: "UNSUPPORTED_PAGE_URL",
  screenshotCaptureFailed: "SCREENSHOT_CAPTURE_FAILED",
  uploadFailed: "UPLOAD_FAILED",
  jobNotFound: "JOB_NOT_FOUND",
  jobFailed: "JOB_FAILED",
  jobCancelled: "JOB_CANCELLED",
  contractMismatch: "CONTRACT_MISMATCH",
  invalidSettings: "INVALID_SETTINGS"
};

export class ExtensionError extends Error {
  constructor(code, message, details = {}) {
    super(sanitizeMessage(message));
    this.name = "ExtensionError";
    this.code = code;
    this.details = details;
    this.requestId = details.requestId || null;
    this.traceId = details.traceId || null;
    this.backendCode = details.backendCode || null;
  }
}

export function sanitizeMessage(message) {
  return String(message || "Unexpected extension error.")
    .replace(/[A-Z]:\\[^\s]+/gu, "[local-path]")
    .replace(/\/[^\s]*\/[^\s]+/gu, "[path]")
    .replace(/traceback[\s\S]*/iu, "traceback hidden")
    .replace(/stack[\s\S]*/iu, "stack hidden")
    .slice(0, 240);
}

export function mapBackendError(errorPayload, fallbackCode = EXTENSION_ERROR_CODES.backendUnavailable) {
  if (!errorPayload || typeof errorPayload !== "object") {
    return new ExtensionError(fallbackCode, "Backend request failed.");
  }
  return new ExtensionError(
    errorPayload.error_code || fallbackCode,
    errorPayload.message || "Backend request failed.",
    {
      backendCode: errorPayload.error_code || null,
      requestId: errorPayload.request_id || null,
      traceId: errorPayload.trace_id || null
    }
  );
}

export function safeErrorPayload(error) {
  if (error instanceof ExtensionError) {
    return {
      code: error.code,
      message: error.message,
      backendCode: error.backendCode,
      requestId: error.requestId,
      traceId: error.traceId
    };
  }
  return {
    code: EXTENSION_ERROR_CODES.backendUnavailable,
    message: sanitizeMessage(error && error.message ? error.message : String(error))
  };
}

