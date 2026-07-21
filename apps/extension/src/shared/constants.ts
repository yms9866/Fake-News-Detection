export const EXTENSION_VERSION = "0.4.0";
export const DEFAULT_BACKEND_ORIGIN = "http://127.0.0.1:8000";
export const DEFAULT_TIMEOUT_MS = 15000;
export const DEFAULT_MAX_LENGTH = 512;
export const PAIRING_HEADER = "X-FND-Pairing-Token";
export const REQUEST_ID_HEADER = "X-Request-ID";
export const TRACE_ID_HEADER = "X-Trace-ID";
export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const STORAGE_KEYS = {
  settings: "fnd.settings",
  activeAnalysis: "fnd.activeAnalysis",
  latestSummary: "fnd.latestSummary"
};
export const CLIENT_STATES = {
  idle: "idle",
  extracting: "extracting",
  submitting: "submitting",
  queued: "queued",
  processing: "processing",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled"
};

