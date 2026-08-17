import {
  DEFAULT_BACKEND_ORIGIN,
  DEFAULT_MAX_LENGTH,
  DEFAULT_TIMEOUT_MS,
  STORAGE_KEYS
} from "./constants.js";
import { EXTENSION_ERROR_CODES, ExtensionError } from "./errors.js";

const memoryLocal = new Map();
const memorySession = new Map();

export const DEFAULT_SETTINGS = {
  backendOrigin: DEFAULT_BACKEND_ORIGIN,
  pairingToken: "",
  defaultDeepCheck: false,
  defaultMaxLength: DEFAULT_MAX_LENGTH,
  requestTimeoutMs: DEFAULT_TIMEOUT_MS,
  showOverlayAutomatically: true,
  storeLatestAnalysisReference: true
};

function chromeStorage(area) {
  if (globalThis.chrome && chrome.storage && chrome.storage[area]) {
    return chrome.storage[area];
  }
  return null;
}

async function getFrom(area, key, fallback) {
  const store = chromeStorage(area);
  if (store) {
    const result = await store.get(key);
    return Object.prototype.hasOwnProperty.call(result, key) ? result[key] : fallback;
  }
  const memory = area === "session" ? memorySession : memoryLocal;
  return memory.has(key) ? memory.get(key) : fallback;
}

async function setTo(area, value) {
  const store = chromeStorage(area);
  if (store) {
    await store.set(value);
    return;
  }
  const memory = area === "session" ? memorySession : memoryLocal;
  for (const [key, item] of Object.entries(value)) {
    memory.set(key, item);
  }
}

async function removeFrom(area, keys) {
  const store = chromeStorage(area);
  if (store) {
    await store.remove(keys);
    return;
  }
  const memory = area === "session" ? memorySession : memoryLocal;
  for (const key of Array.isArray(keys) ? keys : [keys]) {
    memory.delete(key);
  }
}

export function normalizeBackendOrigin(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.invalidSettings,
      "Backend origin must be a valid URL."
    );
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.invalidSettings,
      "Backend origin must use http or https."
    );
  }
  if (url.username || url.password) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.invalidSettings,
      "Backend origin must not include embedded credentials."
    );
  }
  const host = url.hostname.toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (!isLoopback) {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.invalidSettings,
      "Slice 4 local mode only supports localhost or loopback backend origins."
    );
  }
  return `${url.protocol}//${url.host}`.replace(/\/+$/u, "");
}

export function normalizeSettings(raw) {
  const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  return {
    ...merged,
    backendOrigin: normalizeBackendOrigin(merged.backendOrigin),
    pairingToken: String(merged.pairingToken || "").trim(),
    defaultDeepCheck: Boolean(merged.defaultDeepCheck),
    defaultMaxLength: Math.min(8192, Math.max(128, Number(merged.defaultMaxLength) || DEFAULT_MAX_LENGTH)),
    requestTimeoutMs: Math.min(120000, Math.max(1000, Number(merged.requestTimeoutMs) || DEFAULT_TIMEOUT_MS)),
    showOverlayAutomatically: Boolean(merged.showOverlayAutomatically),
    storeLatestAnalysisReference: Boolean(merged.storeLatestAnalysisReference)
  };
}

export async function getSettings() {
  return normalizeSettings(await getFrom("local", STORAGE_KEYS.settings, DEFAULT_SETTINGS));
}

export async function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  await setTo("local", { [STORAGE_KEYS.settings]: normalized });
  return normalized;
}

export async function getActiveAnalysis() {
  return await getFrom("session", STORAGE_KEYS.activeAnalysis, null);
}

export async function saveActiveAnalysis(reference) {
  await setTo("session", { [STORAGE_KEYS.activeAnalysis]: reference });
}

export async function clearActiveAnalysis() {
  await removeFrom("session", STORAGE_KEYS.activeAnalysis);
}

export async function getLatestSummary() {
  return await getFrom("local", STORAGE_KEYS.latestSummary, null);
}

export async function saveLatestSummary(summary) {
  await setTo("local", { [STORAGE_KEYS.latestSummary]: summary });
}

export async function clearExtensionState() {
  await removeFrom("session", STORAGE_KEYS.activeAnalysis);
  await removeFrom("local", [STORAGE_KEYS.latestSummary]);
}

export const memoryStorageForTests = { memoryLocal, memorySession };
