export const MOBILE_API_ERROR_CODES = {
  INVALID_API_URL: "MOBILE_INVALID_API_URL",
  API_URL_MISSING: "MOBILE_API_URL_MISSING"
};

export class MobileConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MobileConfigError";
    this["code"] = code;
  }
}

function publicEnvFromRuntime() {
  const processValue = Reflect.get(globalThis, "process");
  if (!processValue || typeof processValue !== "object") {
    return {};
  }
  const env = Reflect.get(processValue, "env");
  return env && typeof env === "object" ? env : {};
}

export function normalizeApiUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new MobileConfigError(MOBILE_API_ERROR_CODES.API_URL_MISSING, "EXPO_PUBLIC_API_URL is required.");
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new MobileConfigError(MOBILE_API_ERROR_CODES.INVALID_API_URL, "EXPO_PUBLIC_API_URL must be a valid absolute URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MobileConfigError(MOBILE_API_ERROR_CODES.INVALID_API_URL, "EXPO_PUBLIC_API_URL must use http or https.");
  }

  return parsed.toString().replace(/\/+$/u, "");
}

export function developmentApiUrlForPlatform(platform) {
  return platform === "android" ? "http://10.0.2.2:8000" : "http://127.0.0.1:8000";
}

export function resolveApiUrl(options = {}) {
  const env = options["env"] || publicEnvFromRuntime();
  const configured = env["EXPO_PUBLIC_API_URL"] || env["EXPO_PUBLIC_BACKEND_ORIGIN"] || "";
  if (configured) {
    return normalizeApiUrl(configured);
  }
  if (options["requireConfigured"]) {
    throw new MobileConfigError(MOBILE_API_ERROR_CODES.API_URL_MISSING, "Set EXPO_PUBLIC_API_URL before starting the mobile app.");
  }
  return developmentApiUrlForPlatform(options["platform"] || "native");
}
