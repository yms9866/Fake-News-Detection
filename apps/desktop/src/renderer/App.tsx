import { createDesktopApiClient } from "./api/client.js";
import { captureDataUrlToBlob, makeCaptureUploadOptions } from "./capture/capture-model.js";
import { summarizeHistoryItem } from "./components/safe-content.js";
import { renderActiveJobScreen } from "./screens/active-job-screen.js";
import { renderCaptureSourceScreen } from "./screens/capture-source-screen.js";
import { renderDiagnosticsScreen } from "./screens/diagnostics-screen.js";
import { renderHistoryScreen } from "./screens/history-screen.js";
import { renderHomeScreen } from "./screens/home-screen.js";
import { renderLiveOcrScreen } from "./screens/live-ocr-screen.js";
import { renderMediaUploadScreen } from "./screens/media-upload-screen.js";
import { renderNewAnalysisScreen } from "./screens/new-analysis-screen.js";
import { renderResultScreen } from "./screens/result-screen.js";
import { renderSettingsScreen } from "./screens/settings-screen.js";
import { renderTextUrlScreen } from "./screens/text-url-screen.js";
import { createRendererHistoryStore, createRendererSettingsStore } from "./stores/settings-store.js";

const DEFAULT_SETTINGS = {
  backendOrigin: "http://127.0.0.1:8000",
  defaultDeepCheck: false,
  defaultMaxLength: 512,
  requestTimeoutMs: 15000,
  startupTimeoutMs: 30000
};

export function renderDesktopApp(root, bridge = window.desktopApi) {
  const settingsStore = createRendererSettingsStore(bridge);
  const historyStore = createRendererHistoryStore(bridge);
  const state = {
    route: "home",
    backendState: "unknown",
    settings: { ...DEFAULT_SETTINGS },
    diagnostics: null,
    history: [],
    captureSources: [],
    selectedCaptureSource: null,
    activeJob: null,
    liveSession: null,
    latestResult: null,
    error: null
  };
  const client = createDesktopApiClient(state.settings);

  const actions = {
    bridge,
    navigate(route) {
      state.route = route;
      draw();
    },
    async startBackend() {
      await run(async () => {
        const response = await bridge.backend.start();
        if (response.ok) {
          state.backendState = response.value.state;
        }
      });
    },
    async refreshDiagnostics() {
      await run(async () => {
        const response = await bridge.diagnostics.get();
        state.diagnostics = response.ok ? response.value : response.error;
        if (state.diagnostics.backend) {
          state.backendState = state.diagnostics.backend.state;
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
    async saveSettings(settings) {
      await run(async () => {
        state.settings = { ...state.settings, ...(await settingsStore.save(settings)) };
        client.configure(state.settings);
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
      });
    }
  };

  async function run(operation) {
    state.error = null;
    try {
      await operation();
    } catch (error) {
      state.error = {
        code: error && error.code ? error.code : "DESKTOP_UI_ERROR",
        message: error && error.message ? error.message : "Desktop operation failed."
      };
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
      state.history = await historyStore.list();
      await actions.refreshDiagnostics();
    });
  }

  function navButton(label, route) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = route === state.route ? "nav active" : "nav";
    node.textContent = label;
    node.addEventListener("click", () => actions.navigate(route));
    return node;
  }

  function draw() {
    root.replaceChildren();
    const layout = document.createElement("main");
    const nav = document.createElement("nav");
    nav.append(
      navButton("Home", "home"),
      navButton("New", "new-analysis"),
      navButton("Text/URL", "text-url"),
      navButton("Media", "media"),
      navButton("Capture", "capture"),
      navButton("Live OCR", "live-ocr"),
      navButton("Job", "active-job"),
      navButton("Result", "result"),
      navButton("History", "history"),
      navButton("Settings", "settings"),
      navButton("Diagnostics", "diagnostics")
    );
    layout.append(nav);
    if (state.error) {
      const alert = document.createElement("p");
      alert.className = "alert";
      alert.textContent = `${state.error.code}: ${state.error.message}`;
      layout.append(alert);
    }
    layout.append(renderCurrentScreen());
    root.append(layout);
  }

  function renderCurrentScreen() {
    switch (state.route) {
      case "new-analysis":
        return renderNewAnalysisScreen(actions);
      case "text-url":
        return renderTextUrlScreen(state, actions);
      case "media":
        return renderMediaUploadScreen(state, actions);
      case "capture":
        return renderCaptureSourceScreen(state, actions);
      case "live-ocr":
        return renderLiveOcrScreen(state, actions);
      case "active-job":
        return renderActiveJobScreen(state, actions);
      case "result":
        return renderResultScreen(state, actions);
      case "history":
        return renderHistoryScreen(state, actions);
      case "settings":
        return renderSettingsScreen(state, actions);
      case "diagnostics":
        return renderDiagnosticsScreen(state, actions);
      default:
        return renderHomeScreen(state, actions);
    }
  }

  draw();
  hydrate();
  return { state, actions, client };
}
