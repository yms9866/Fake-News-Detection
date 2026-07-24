const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_IPC_CHANNELS = Object.freeze({
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

const ALLOWED_CHANNEL_VALUES = new Set(Object.values(ALLOWED_IPC_CHANNELS));

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateIpcRequest(channel, payload = {}) {
  if (!ALLOWED_CHANNEL_VALUES.has(channel)) {
    const error = new Error("Renderer attempted to call an unsupported desktop channel.");
    error.code = "DESKTOP_INVALID_IPC_CHANNEL";
    throw error;
  }

  if (channel === ALLOWED_IPC_CHANNELS.captureSources) {
    return {
      sourceType: isPlainObject(payload) && payload.sourceType === "window" ? "window" : "screen"
    };
  }

  if (channel === ALLOWED_IPC_CHANNELS.externalOpen) {
    return {
      url: isPlainObject(payload) ? String(payload.url || "") : String(payload || "")
    };
  }

  return isPlainObject(payload) ? { ...payload } : {};
}

function invoke(channel, payload = {}) {
  const validated = validateIpcRequest(channel, payload);
  return ipcRenderer.invoke(channel, validated);
}

const desktopApi = Object.freeze({
  backend: Object.freeze({
    getStatus: () => invoke(ALLOWED_IPC_CHANNELS.backendStatus),
    start: () => invoke(ALLOWED_IPC_CHANNELS.backendStart),
    stop: () => invoke(ALLOWED_IPC_CHANNELS.backendStop),
    logs: () => invoke(ALLOWED_IPC_CHANNELS.backendLogs)
  }),
  capture: Object.freeze({
    sources: (sourceType) => invoke(ALLOWED_IPC_CHANNELS.captureSources, { sourceType }),
    once: (payload) => invoke(ALLOWED_IPC_CHANNELS.captureOnce, payload)
  }),
  settings: Object.freeze({
    get: () => invoke(ALLOWED_IPC_CHANNELS.settingsGet),
    save: (payload) => invoke(ALLOWED_IPC_CHANNELS.settingsSave, payload),
    clear: () => invoke(ALLOWED_IPC_CHANNELS.settingsClear)
  }),
  history: Object.freeze({
    list: () => invoke(ALLOWED_IPC_CHANNELS.historyList),
    save: (payload) => invoke(ALLOWED_IPC_CHANNELS.historySave, payload),
    clear: () => invoke(ALLOWED_IPC_CHANNELS.historyClear)
  }),
  diagnostics: Object.freeze({
    get: () => invoke(ALLOWED_IPC_CHANNELS.diagnosticsGet)
  }),
  external: Object.freeze({
    open: (url) => invoke(ALLOWED_IPC_CHANNELS.externalOpen, { url })
  })
});

contextBridge.exposeInMainWorld("desktopApi", desktopApi);
