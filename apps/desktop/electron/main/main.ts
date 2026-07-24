import { app, BrowserWindow, desktopCapturer, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BackendProcessManager } from "./backend-process-manager.js";
import { CaptureController } from "./capture-controller.js";
import { collectDiagnostics } from "./diagnostics.js";
import { openExternalLink } from "./external-links.js";
import { SecureSettingsStore } from "./secure-storage.js";
import { ALLOWED_IPC_CHANNELS, validateIpcRequest } from "../../src/shared/runtime-validation.js";

const dirname = fileURLToPath(new URL(".", import.meta.url));
const PRELOAD_MISSING_CODE = "DESKTOP_PRELOAD_MISSING";
let mainWindow = null;

export function secureWebPreferences(preloadPath) {
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  };
}

export function resolvePreloadPath(baseDir = dirname) {
  const preloadPath = join(baseDir, "../preload/preload.cjs");
  if (!existsSync(preloadPath)) {
    const error = new Error(
      `Compiled Electron preload file is missing at ${preloadPath}. Run the desktop build before launching Electron.`
    );
    error.code = PRELOAD_MISSING_CODE;
    throw error;
  }
  return preloadPath;
}

export function createMainWindow() {
  const preloadPath = resolvePreloadPath(dirname);
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    title: "Fake News Desktop",
    webPreferences: secureWebPreferences(preloadPath)
  });
  mainWindow.webContents.on("console-message", (_event, details) => {
    console.log(`[desktop renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(`[desktop renderer] failed to load ${validatedUrl}: ${errorCode} ${errorDescription}`);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[desktop renderer] process gone: ${details.reason}`);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadFile(join(dirname, "../../src/renderer/index.html"));
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

export function registerIpcHandlers({ ipc = ipcMain, backendManager, captureController, settingsStore, historyStore }) {
  const manager = backendManager || new BackendProcessManager();
  const capture = captureController || new CaptureController({
    sourcesProvider: (options) => desktopCapturer.getSources(options)
  });
  const settings = settingsStore || new SecureSettingsStore();
  const history = historyStore || createMemoryHistoryStore();

  function handle(channel, handler) {
    ipc.handle(channel, async (_event, payload) => {
      const validated = validateIpcRequest(channel, payload);
      try {
        return { ok: true, value: await handler(validated) };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error && error.code ? error.code : "DESKTOP_OPERATION_FAILED",
            message: error && error.message ? error.message : "Desktop operation failed."
          }
        };
      }
    });
  }

  handle(ALLOWED_IPC_CHANNELS.backendStatus, () => manager.getStatus());
  handle(ALLOWED_IPC_CHANNELS.backendStart, () => manager.start(settings.getSettings()));
  handle(ALLOWED_IPC_CHANNELS.backendStop, () => manager.stop());
  handle(ALLOWED_IPC_CHANNELS.backendLogs, () => manager.getLogs());
  handle(ALLOWED_IPC_CHANNELS.captureSources, (payload) => capture.listSources(payload.sourceType));
  handle(ALLOWED_IPC_CHANNELS.captureOnce, (payload) => capture.captureOnce(payload));
  handle(ALLOWED_IPC_CHANNELS.settingsGet, () => settings.redacted());
  handle(ALLOWED_IPC_CHANNELS.settingsSave, (payload) => settings.saveSettings(payload));
  handle(ALLOWED_IPC_CHANNELS.settingsClear, () => settings.clear());
  handle(ALLOWED_IPC_CHANNELS.historyList, () => history.list());
  handle(ALLOWED_IPC_CHANNELS.historySave, (payload) => history.save(payload));
  handle(ALLOWED_IPC_CHANNELS.historyClear, () => history.clear());
  handle(ALLOWED_IPC_CHANNELS.diagnosticsGet, () =>
    collectDiagnostics({
      backendStatus: manager.getStatus(),
      settings: settings.getSettings(),
      capture: {
        captureCount: capture.captureCount,
        framePersisted: capture.hasPersistedFrame()
      }
    })
  );
  handle(ALLOWED_IPC_CHANNELS.externalOpen, (payload) => openExternalLink(shell, payload.url));

  return { manager, capture, settings, history };
}

export function createMemoryHistoryStore() {
  const items = [];
  return {
    list: () => [...items],
    save: (item) => {
      items.unshift(item);
      if (items.length > 50) {
        items.pop();
      }
      return [...items];
    },
    clear: () => {
      items.splice(0, items.length);
      return [];
    }
  };
}

if (process.versions.electron) {
  app.whenReady().then(() => {
    registerIpcHandlers({});
    createMainWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
