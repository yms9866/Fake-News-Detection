import { contextBridge, ipcRenderer } from "electron";
import { ALLOWED_IPC_CHANNELS, validateIpcRequest } from "../../src/shared/runtime-validation.js";

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
