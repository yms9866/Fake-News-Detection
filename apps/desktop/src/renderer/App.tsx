import { createDesktopApiClient } from "./api/client.js";
import { captureDataUrlToBlob, makeCaptureUploadOptions } from "./capture/capture-model.js";
import { el } from "./components/dom.js";
import {
  renderBrandMark,
  renderCollapseToggle,
  renderConnectionStatus,
  renderThemeToggle
} from "./components/ui.js";
import { NAV_ITEMS, labelForRoute } from "./navigation/nav-items.js";
import { summarizeHistoryItem } from "./components/safe-content.js";
import { renderActiveJobScreen } from "./screens/active-job-screen.js";
import { createAnalyzeDraft, renderAnalyzeScreen } from "./screens/analyze-screen.js";
import { renderCaptureSourceScreen } from "./screens/capture-source-screen.js";
import { renderDiagnosticsScreen } from "./screens/diagnostics-screen.js";
import { renderHistoryScreen } from "./screens/history-screen.js";
import { renderLiveOcrScreen } from "./screens/live-ocr-screen.js";
import { renderMediaUploadScreen } from "./screens/media-upload-screen.js";
import { renderReportScreen } from "./screens/report-screen.js";
import { renderResultScreen } from "./screens/result-screen.js";
import { renderReviewScreen } from "./screens/review-screen.js";
import { renderSettingsScreen } from "./screens/settings-screen.js";
import { createRendererHistoryStore, createRendererSettingsStore } from "./stores/settings-store.js";

const DEFAULT_SETTINGS = {
  backendOrigin: "http://127.0.0.1:8000",
  defaultDeepCheck: false,
  defaultMaxLength: 512,
  requestTimeoutMs: 600000,
  startupTimeoutMs: 300000
};

const THEME_STORAGE_KEY = "fnd.desktop.theme";
const SIDEBAR_STORAGE_KEY = "fnd.desktop.sidebarCollapsed";

export class DesktopInitializationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DesktopInitializationError";
    this.code = code;
  }
}

export function resolveDesktopBridge(scope = globalThis) {
  const bridge = scope && scope.desktopApi;
  if (!bridge || typeof bridge !== "object") {
    throw new DesktopInitializationError(
      "DESKTOP_BRIDGE_MISSING",
      "The secure Electron preload bridge was not initialized. Rebuild the desktop app and launch it through Electron."
    );
  }
  const requiredGroups = ["backend", "capture", "settings", "history", "diagnostics", "external"];
  for (const group of requiredGroups) {
    if (!bridge[group] || typeof bridge[group] !== "object") {
      throw new DesktopInitializationError(
        "DESKTOP_BRIDGE_INCOMPLETE",
        `The secure Electron preload bridge is missing the ${group} API.`
      );
    }
  }
  if (typeof bridge.backend.start !== "function" || typeof bridge.external.open !== "function") {
    throw new DesktopInitializationError(
      "DESKTOP_BRIDGE_INCOMPLETE",
      "The secure Electron preload bridge does not match the renderer contract."
    );
  }
  return bridge;
}

export function renderDesktopInitializationError(root, error) {
  root.replaceChildren();
  const panel = document.createElement("main");
  panel.className = "init-error-shell";
  const card = document.createElement("section");
  card.className = "error-panel";
  const title = document.createElement("h1");
  title.textContent = "Desktop runtime could not start";
  const message = document.createElement("p");
  message.textContent = error && error.message ? error.message : "The desktop bridge is unavailable.";
  const code = document.createElement("p");
  code.className = "muted";
  code.textContent = `Issue code: ${error && error.code ? error.code : "DESKTOP_INITIALIZATION_ERROR"}`;
  card.append(title, message, code);
  panel.append(card);
  root.append(panel);
}

function readStoredTheme() {
  try {
    const value = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readStoredSidebarCollapsed() {
  try {
    return globalThis.localStorage?.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyDocumentTheme(theme) {
  const rootEl = document.documentElement;
  rootEl.classList.remove("light", "dark", "light-theme", "dark-theme");
  rootEl.classList.add(theme, `${theme}-theme`);
  rootEl.dataset.theme = theme;
}

export function renderDesktopApp(root, bridge = resolveDesktopBridge()) {
  const settingsStore = createRendererSettingsStore(bridge);
  const historyStore = createRendererHistoryStore(bridge);
  const analyzeDraft = createAnalyzeDraft(DEFAULT_SETTINGS);
  const state = {
    route: "analyze",
    backendState: "unknown",
    backendReady: false,
    settings: { ...DEFAULT_SETTINGS },
    diagnostics: null,
    history: [],
    captureSources: [],
    selectedCaptureSource: null,
    activeJob: null,
    liveSession: null,
    latestResult: null,
    loading: false,
    error: null,
    theme: readStoredTheme(),
    sidebarCollapsed: readStoredSidebarCollapsed()
  };
  const client = createDesktopApiClient(state.settings);
  applyDocumentTheme(state.theme);

  const actions = {
    bridge,
    redraw() {
      draw();
    },
    navigate(route) {
      state.route = route;
      draw();
    },
    toggleSidebar() {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      try {
        globalThis.localStorage?.setItem(SIDEBAR_STORAGE_KEY, state.sidebarCollapsed ? "1" : "0");
      } catch {
        /* ignore */
      }
      draw();
    },
    toggleTheme() {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyDocumentTheme(state.theme);
      try {
        globalThis.localStorage?.setItem(THEME_STORAGE_KEY, state.theme);
      } catch {
        /* ignore */
      }
      draw();
    },
    async startBackend() {
      await run(async () => {
        const response = await bridge.backend.start();
        if (response.ok) {
          state.backendState = response.value.state;
          state.backendReady = Boolean(response.value.ready);
        }
      });
    },
    async refreshDiagnostics() {
      await run(async () => {
        const response = await bridge.diagnostics.get();
        state.diagnostics = response.ok ? response.value : response.error;
        if (state.diagnostics.backend) {
          state.backendState = state.diagnostics.backend.state;
          state.backendReady = Boolean(state.diagnostics.backend.ready);
        }
      });
    },
    async analyzeText(payload) {
      await run(async () => completeAnalysis(await client.analyzeText(payload)));
    },
    async analyzeUrl(payload) {
      await run(async () => completeAnalysis(await client.analyzeUrl(payload)));
    },
    async uploadMedia(file, options) {
      await run(async () => {
        if (!file) {
          throw new Error("Choose a media file first.");
        }
        const mediaType = file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("video/")
            ? "video"
            : "image";
        const accepted = await client.uploadMedia(mediaType, file, options);
        await monitorJob(accepted.job_id);
      });
    },
    async listCaptureSources(sourceType) {
      await run(async () => {
        const response = await bridge.capture.sources(sourceType);
        state.captureSources = response.ok ? response.value : [];
      });
    },
    selectCaptureSource(source) {
      state.selectedCaptureSource = source;
      draw();
    },
    async captureOnce(source, crop = null) {
      await run(async () => {
        const response = await bridge.capture.once({
          sourceId: source.id,
          sourceType: source.sourceType,
          confirm: true,
          crop
        });
        if (!response.ok) {
          throw new Error(response.error.message);
        }
        const blob = await captureDataUrlToBlob(response.value.dataUrl);
        const accepted = await client.uploadImage(blob, makeCaptureUploadOptions(state.settings));
        await monitorJob(accepted.job_id);
      });
    },
    async cancelActiveJob() {
      await run(async () => {
        if (state.activeJob && state.activeJob.job_id) {
          state.activeJob = await client.cancelJob(state.activeJob.job_id);
        }
      });
    },
    async startLiveOcr(payload) {
      await run(async () => {
        state.liveSession = await client.createLiveSession(payload);
      });
    },
    async submitLiveFrame(payload) {
      await run(async () => {
        if (!state.liveSession) {
          throw new Error("Start a live OCR session first.");
        }
        state.liveSession = await client.submitLiveFrame(state.liveSession.session_id, payload);
      });
    },
    async pauseLiveOcr() {
      await run(async () => {
        if (state.liveSession) {
          state.liveSession = await client.pauseLiveSession(state.liveSession.session_id);
        }
      });
    },
    async resumeLiveOcr() {
      await run(async () => {
        if (state.liveSession) {
          state.liveSession = await client.resumeLiveSession(state.liveSession.session_id);
        }
      });
    },
    async stopLiveOcr() {
      await run(async () => {
        if (state.liveSession) {
          state.liveSession = await client.stopLiveSession(state.liveSession.session_id);
        }
      });
    },
    async cancelLiveOcr() {
      await run(async () => {
        if (state.liveSession) {
          state.liveSession = await client.cancelLiveSession(state.liveSession.session_id);
        }
      });
    },
    async verifyLiveOcr(payload) {
      await run(async () => {
        if (state.liveSession) {
          state.liveSession = await client.verifyLiveSession(state.liveSession.session_id, payload);
        }
      });
    },
    async openSource(url) {
      await run(async () => {
        const response = await bridge.external.open(url);
        if (!response.ok) {
          const err = new Error(response.error && response.error.message ? response.error.message : "Source link could not be opened.");
          err.code = response.error && response.error.code ? response.error.code : "DESKTOP_SOURCE_OPEN_FAILED";
          throw err;
        }
      });
    },
    async openHistory(item) {
      await run(async () => {
        if (!item || !item.analysisId) {
          throw new Error("History item is missing an analysis id.");
        }
        state.latestResult = await client.getAnalysis(item.analysisId);
        state.route = "result";
      });
    },
    async saveSettings(settings) {
      await run(async () => {
        state.settings = { ...state.settings, ...(await settingsStore.save(settings)) };
        client.configure(state.settings);
        analyzeDraft.deepCheck = state.settings.defaultDeepCheck;
        analyzeDraft.maxLength = String(state.settings.defaultMaxLength);
      });
    },
    async clearHistory() {
      await run(async () => {
        state.history = await historyStore.clear();
      });
    },
    async clearLocalState() {
      await run(async () => {
        state.history = await historyStore.clear();
        state.settings = { ...DEFAULT_SETTINGS, ...(await settingsStore.clear()) };
        state.latestResult = null;
        state.activeJob = null;
        state.liveSession = null;
        analyzeDraft.deepCheck = state.settings.defaultDeepCheck;
        analyzeDraft.maxLength = String(state.settings.defaultMaxLength);
      });
    }
  };

  async function run(operation) {
    state.error = null;
    state.loading = true;
    draw();
    try {
      await operation();
    } catch (error) {
      state.error = {
        code: error && error.code ? error.code : "DESKTOP_UI_ERROR",
        message: error && error.message ? error.message : "Desktop operation failed.",
        status: error && error.status ? error.status : 0,
        requestId: error && error.requestId ? error.requestId : null,
        traceId: error && error.traceId ? error.traceId : null,
        validationDetails: error && Array.isArray(error.validationDetails) ? error.validationDetails : []
      };
    } finally {
      state.loading = false;
    }
    draw();
  }

  async function completeAnalysis(result) {
    state.latestResult = result;
    state.route = "result";
    state.history = await historyStore.save(summarizeHistoryItem(result));
  }

  async function monitorJob(jobId) {
    state.route = "active-job";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      state.activeJob = await client.getJob(jobId);
      draw();
      if (["completed", "failed", "cancelled"].includes(state.activeJob.status)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (state.activeJob && state.activeJob.analysis_id && state.activeJob.status === "completed") {
      await completeAnalysis(await client.getAnalysis(state.activeJob.analysis_id));
    }
  }

  async function hydrate() {
    await run(async () => {
      state.settings = { ...DEFAULT_SETTINGS, ...(await settingsStore.get()) };
      client.configure(state.settings);
      analyzeDraft.deepCheck = state.settings.defaultDeepCheck;
      analyzeDraft.maxLength = String(state.settings.defaultMaxLength);
      state.history = await historyStore.list();
      await actions.refreshDiagnostics();
    });
  }

  function navButton(label, route, icon) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = route === state.route ? "nav active" : "nav";
    node.title = label;
    const iconWrap = document.createElement("div");
    iconWrap.className = "nav-icon";
    iconWrap.textContent = icon;
    node.append(iconWrap);
    node.append(el("span", label, "nav-label"));
    node.addEventListener("click", () => actions.navigate(route));
    return node;
  }

  function draw() {
    applyDocumentTheme(state.theme);
    root.replaceChildren();
    const layout = document.createElement("main");
    layout.className = "app-shell";

    const aside = document.createElement("aside");
    aside.className = state.sidebarCollapsed ? "sidebar collapsed" : "sidebar";

    const sidebarHeader = document.createElement("div");
    sidebarHeader.className = "sidebar-header";
    sidebarHeader.append(renderBrandMark(state.sidebarCollapsed));
    sidebarHeader.append(renderCollapseToggle(state.sidebarCollapsed, actions.toggleSidebar));
    aside.append(sidebarHeader);

    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Primary");
    for (const section of NAV_ITEMS) {
      const group = document.createElement("div");
      group.className = "nav-section";
      group.append(el("div", section.section, "nav-section-header"));
      for (const item of section.items) {
        group.append(navButton(item.label, item.route, item.icon));
      }
      nav.append(group);
    }
    aside.append(nav);
    layout.append(aside);

    const content = document.createElement("div");
    content.className = "content-shell";

    const header = document.createElement("header");
    header.className = "top-header";
    const headerLeft = document.createElement("div");
    headerLeft.className = "header-left";
    headerLeft.append(el("span", labelForRoute(state.route), "header-title"));
    const headerRight = document.createElement("div");
    headerRight.className = "header-right";
    headerRight.append(renderThemeToggle(state.theme, actions.toggleTheme));
    headerRight.append(
      renderConnectionStatus(
        { state: state.backendState, ready: state.backendReady },
        () => void actions.refreshDiagnostics()
      )
    );
    if (!state.backendReady) {
      headerRight.append(buttonGhost("Start backend", () => void actions.startBackend()));
    }
    header.append(headerLeft, headerRight);
    content.append(header);

    const main = document.createElement("div");
    main.className = "main-content";
    if (state.error) {
      const alert = document.createElement("section");
      alert.className = "error-panel";
      alert.setAttribute("role", "alert");
      alert.append(el("h2", errorTitle(state.error.code)));
      alert.append(el("p", state.error.message));
      alert.append(el("p", `Issue code: ${state.error.code}`, "muted"));
      const validationItems = validationMessages(state.error);
      if (validationItems.length > 0) {
        const list = el("ul", null, "warnings");
        for (const item of validationItems) {
          list.append(el("li", item));
        }
        alert.append(list);
      }
      main.append(alert);
    }
    if (state.loading) {
      main.append(renderLoadingPanel());
    }
    main.append(renderCurrentScreen());
    content.append(main);
    layout.append(content);
    root.append(layout);
  }

  function renderCurrentScreen() {
    switch (state.route) {
      case "media":
        return renderMediaUploadScreen(state, actions);
      case "capture":
        return renderCaptureSourceScreen(state, actions);
      case "live":
        return renderLiveOcrScreen(state, actions);
      case "active-job":
        return renderActiveJobScreen(state, actions);
      case "result":
        return renderResultScreen(state, actions);
      case "history":
        return renderHistoryScreen(state, actions);
      case "report":
        return renderReportScreen(state);
      case "review":
        return renderReviewScreen(state, actions);
      case "settings":
        return renderSettingsScreen(state, actions);
      case "diagnostics":
        return renderDiagnosticsScreen(state, actions);
      default:
        return renderAnalyzeScreen(state, actions, analyzeDraft);
    }
  }

  draw();
  hydrate();
  return { state, actions, client };
}

function buttonGhost(label, onClick) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "button compact ghost";
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

function renderLoadingPanel() {
  const panel = document.createElement("section");
  panel.className = "status-panel loading-state";
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  panel.append(el("strong", "Working"));
  panel.append(el("p", "The desktop app is waiting for the local runtime or API response.", "muted"));
  return panel;
}

function errorTitle(code) {
  if (code === "DESKTOP_BACKEND_UNAVAILABLE" || code === "FND_CONNECTION_REFUSED" || code === "FND_CORS_OR_NETWORK_FAILURE") {
    return "Backend unavailable";
  }
  if (code === "DESKTOP_BACKEND_TIMEOUT" || code === "FND_REQUEST_TIMEOUT") {
    return "Backend request timed out";
  }
  return "Desktop operation failed";
}

function validationMessages(error) {
  if (!error || !Array.isArray(error.validationDetails)) {
    return [];
  }
  return error.validationDetails
    .map((detail) => {
      const field = Array.isArray(detail.loc) && detail.loc.length > 0 ? ` (${detail.loc.join(".")})` : "";
      return `${detail.msg || "Please check this field."}${field}`;
    })
    .filter(Boolean);
}
