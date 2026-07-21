import { EXTENSION_VERSION } from "./constants.js";

export function logEvent(eventName, fields = {}) {
  const safeFields = {};
  for (const key of [
    "action",
    "clientState",
    "analysisId",
    "jobId",
    "requestId",
    "traceId",
    "durationMs",
    "errorCode"
  ]) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      safeFields[key] = fields[key];
    }
  }
  console.debug("[fnd-extension]", {
    event: eventName,
    extensionVersion: EXTENSION_VERSION,
    ...safeFields
  });
}

