import { createWebApiClient } from "./api/client.js";
import { button, checkbox, div, el, field, input, textarea } from "./components/dom.js";
import { renderResultView } from "./components/result-view.js";
import { compactHistoryItem } from "./components/safe-rendering.js";
import { renderConnectionStatus, renderEmptyState, renderErrorPanel, renderLoadingState } from "./components/status-panels.js";
import { requestCameraImage, requestDisplayCapture, requestMicrophone, stopStream } from "./capture/browser-capture.js";
import { createBackendAuthAdapter } from "./auth/dev-auth.js";
import { createHistoryStore } from "./stores/history-store.js";
import { createCsrfToken } from "./security/csrf.js";

const DEFAULT_SETTINGS = {
  backendOrigin: "http://127.0.0.1:8000",
  defaultDeepCheck: true,
  defaultMaxLength: 512,
  requestTimeoutMs: 60000,
  csrfToken: createCsrfToken("web-client")
};

export function renderWebApp(root) {
  const client = createWebApiClient(DEFAULT_SETTINGS);
  const auth = createBackendAuthAdapter(client);
  const history = createHistoryStore();
  const state = {
    route: "analyze",
    session: null,
    result: null,
    job: null,
    live: null,
    diagnostics: null,
    connection: { status: "unknown", origin: DEFAULT_SETTINGS.backendOrigin },
    loading: false,
    error: null,
    lastRetry: null,
    history: []
  };

  const actions = {
    navigate(route) {
      state.route = route;
      draw();
    },
    async checkConnection() {
      state.connection = { status: "checking", origin: client.backendOrigin };
      state.lastRetry = actions.checkConnection;
      draw();
      try {
        await client.live();
        state.connection = { status: "ready", origin: client.backendOrigin };
      } catch (error) {
        state.connection = { status: "unavailable", origin: client.backendOrigin };
        state.error = normalizeUiError(error);
      }
      draw();
    },
    async signIn() {
      await run(async () => {
        state.session = await auth.signIn("local-reviewer");
      });
    },
    async signOut() {
      await run(async () => {
        await auth.signOut();
        state.session = null;
      });
    },
    async analyzeText(payload) {
      await run(async () => setResult(await client.analyzeText(payload)));
    },
    async analyzeUrl(payload) {
      await run(async () => setResult(await client.analyzeUrl(payload)));
    },
    async uploadMedia(file) {
      await run(async () => {
        if (!file) {
          throw new Error("Choose a media file first.");
        }
        const type = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "image";
        const accepted = await client.uploadMedia(type, file, { deepCheck: false, maxLength: 512 });
        state.job = await client.getJob(accepted.job_id);
      });
    },
    async cancelJob() {
      await run(async () => {
        if (state.job) {
          state.job = await client.cancelJob(state.job.job_id);
        }
      });
    },
    async capture(kind) {
      await run(async () => {
        const stream = kind === "display"
          ? await requestDisplayCapture()
          : kind === "camera"
            ? await requestCameraImage()
            : await requestMicrophone();
        stopStream(stream);
      });
    },
    async startLive() {
      await run(async () => {
        state.live = await client.createLiveSession({
          source_type: "screen",
          source_id: "browser-display",
          permission_granted: true
        });
      });
    },
    async submitLiveText(text) {
      await run(async () => {
        if (!state.live) {
          throw new Error("Start a live session first.");
        }
        state.live = await client.submitLiveFrame(state.live.session_id, {
          frame_id: `web-frame-${Date.now()}`,
          perceptual_hash: String(Date.now()),
          ocr_text: text
        });
      });
    },
    async verifyLive() {
      await run(async () => {
        if (state.live) {
          state.live = await client.verifyLiveSession(state.live.session_id, { trigger: "user", force: true });
        }
      });
    },
    async diagnostics() {
      await run(async () => {
        state.diagnostics = {
          live: await client.live(),
          ready: await client.ready(),
          models: await client.models()
        };
      });
    }
  };

  async function run(operation) {
    state.error = null;
    state.loading = true;
    state.lastRetry = () => run(operation);
    draw();
    try {
      await operation();
    } catch (error) {
      state.error = normalizeUiError(error);
      if (!state.error.status) {
        state.connection = { status: "unavailable", origin: client.backendOrigin };
      }
    } finally {
      state.loading = false;
    }
    draw();
  }

  function setResult(result) {
    state.result = result;
    state.history = history.add(compactHistoryItem(result));
    state.route = "result";
  }

  function nav(label, route) {
    const node = button(label, () => actions.navigate(route), route === state.route ? "nav active" : "nav");
    node.setAttribute("aria-current", route === state.route ? "page" : "false");
    return node;
  }

  function draw() {
    root.replaceChildren();
    const layout = document.createElement("main");
    layout.className = "app-shell";
    const navigation = document.createElement("nav");
    navigation.setAttribute("aria-label", "Primary");
    navigation.append(
      nav("Analyze", "analyze"),
      nav("Media", "media"),
      nav("Capture", "capture"),
      nav("Live", "live"),
      nav("Result", "result"),
      nav("History", "history"),
      nav("Report", "report"),
      nav("Review", "review"),
      nav("Admin", "admin"),
      nav("Auth", "auth"),
      nav("Diagnostics", "diagnostics")
    );
    layout.append(navigation);
    const content = div("content-shell");
    content.append(renderConnectionStatus(state.connection, actions.checkConnection));
    if (state.error) {
      content.append(renderErrorPanel(state.error, state.lastRetry));
    }
    if (state.loading) {
      content.append(renderLoadingState("Analyzing"));
    }
    content.append(renderRoute());
    layout.append(content);
    root.append(layout);
  }

  function renderRoute() {
    switch (state.route) {
      case "media":
        return renderMedia();
      case "capture":
        return renderCapture();
      case "live":
        return renderLive();
      case "result":
        return renderResult();
      case "history":
        return renderHistory();
      case "report":
        return renderReport();
      case "review":
        return renderReview();
      case "admin":
        return renderAdmin();
      case "auth":
        return renderAuth();
      case "diagnostics":
        return renderDiagnostics();
      default:
        return renderAnalyze();
    }
  }

  function renderAnalyze() {
    const screen = div("screen");
    screen.append(el("p", "Evidence-focused analysis", "eyebrow"));
    screen.append(el("h1", "Check a claim, article, or source"));
    screen.append(el("p", "The final verdict is based on deterministic evidence policy. Style analysis is shown separately and never proves truth by itself.", "lede"));
    const text = textarea("");
    const url = input("url", "");
    const deepCheck = checkbox(DEFAULT_SETTINGS.defaultDeepCheck);
    const maxLength = input("number", String(DEFAULT_SETTINGS.defaultMaxLength));
    maxLength.min = "128";
    maxLength.max = "8192";
    maxLength.step = "1";
    screen.append(
      field("Text", text),
      field("URL", url),
      field("Deep check", deepCheck),
      field("Max length", maxLength)
    );
    const actionsRow = div("actions");
    actionsRow.append(
      button("Analyze text", () => actions.analyzeText({ text: text.value, deep_check: deepCheck.checked, max_length: Number(maxLength.value) || DEFAULT_SETTINGS.defaultMaxLength })),
      button("Analyze URL", () => actions.analyzeUrl({ url: url.value, deep_check: deepCheck.checked, max_length: Number(maxLength.value) || DEFAULT_SETTINGS.defaultMaxLength }))
    );
    screen.append(actionsRow);
    return screen;
  }

  function renderMedia() {
    const screen = div("screen");
    screen.append(el("h1", "Media"));
    const file = input("file");
    file.accept = "image/*,audio/*,video/*";
    screen.append(field("Upload", file), button("Analyze upload", () => actions.uploadMedia(file.files && file.files[0])));
    if (state.job) {
      screen.append(el("p", `${state.job.status}: ${state.job.message || ""}`, "muted"), button("Cancel job", actions.cancelJob, "danger"));
    }
    return screen;
  }

  function renderCapture() {
    const screen = div("screen");
    screen.append(el("h1", "Browser Capture"));
    screen.append(
      button("Display capture", () => actions.capture("display")),
      button("Camera image", () => actions.capture("camera")),
      button("Microphone recording", () => actions.capture("microphone"))
    );
    return screen;
  }

  function renderLive() {
    const screen = div("screen");
    const text = textarea("Live OCR text block");
    screen.append(el("h1", "Live OCR"));
    screen.append(field("Frame text", text));
    screen.append(button("Start live session", actions.startLive), button("Submit frame", () => actions.submitLiveText(text.value)), button("Verify", actions.verifyLive));
    if (state.live) {
      screen.append(el("p", liveStatusText(state.live), "muted"));
      if (state.live.stable_text) {
        screen.append(el("p", state.live.stable_text, "muted"));
      }
    }
    return screen;
  }

  function renderResult() {
    const screen = div("screen result");
    screen.append(el("h1", "Analysis result"));
    screen.append(renderResultView(state.result));
    return screen;
  }

  function renderHistory() {
    const screen = div("screen");
    screen.append(el("h1", "History"));
    if (state.history.length === 0) {
      screen.append(renderEmptyState("No history yet", "Completed analyses will appear here for quick review."));
      return screen;
    }
    for (const item of state.history) {
      screen.append(el("p", `${item.analysisId} ${item.finalVerdict}`));
    }
    return screen;
  }

  function renderReport() {
    const screen = div("screen");
    screen.append(el("h1", "Report"));
    screen.append(el("pre", JSON.stringify(state.result || {}, null, 2)));
    return screen;
  }

  function renderReview() {
    const screen = div("screen");
    screen.append(el("h1", "Review"));
    screen.append(el("p", state.session ? "Reviewer shell active" : "Sign in to review.", "muted"));
    return screen;
  }

  function renderAdmin() {
    const screen = div("screen");
    screen.append(el("h1", "Admin"));
    screen.append(el("p", "Administration shell for future RBAC and tenant controls.", "muted"));
    return screen;
  }

  function renderAuth() {
    const screen = div("screen");
    screen.append(el("h1", "Auth"));
    screen.append(state.session ? el("p", `Signed in as ${state.session.user.name}`) : el("p", "No active session.", "muted"));
    screen.append(button("Sign in", actions.signIn), button("Sign out", actions.signOut));
    return screen;
  }

  function renderDiagnostics() {
    const screen = div("screen");
    screen.append(el("h1", "Diagnostics"), button("Refresh diagnostics", actions.diagnostics));
    screen.append(el("pre", JSON.stringify(state.diagnostics || {}, null, 2)));
    return screen;
  }

  draw();
  actions.checkConnection();
  return { state, actions, client, auth };
}

function liveStatusText(live) {
  const labels = {
    awaiting_permission: "Waiting for screen access.",
    capturing: live && live.stable_text ? "Text detected. Ready to verify." : "Looking for readable text.",
    paused: "Live OCR is paused.",
    finalizing: "Preparing the final Live OCR result.",
    completed: "Live OCR stopped.",
    cancelled: "Live OCR cancelled.",
    failed: "Live OCR is temporarily unavailable."
  };
  return labels[live && live.status] || "Preparing Live OCR.";
}

function normalizeUiError(error) {
  return {
    code: error && error.code ? error.code : "WEB_ERROR",
    message: error && error.message ? error.message : "Web operation failed.",
    status: error && error.status ? error.status : 0,
    requestId: error && error.requestId ? error.requestId : null,
    traceId: error && error.traceId ? error.traceId : null,
    validationDetails: error && Array.isArray(error.validationDetails) ? error.validationDetails : [],
    backendOrigin: error && error.backendOrigin ? error.backendOrigin : DEFAULT_SETTINGS.backendOrigin,
    technicalDetails: error && error.technicalDetails ? error.technicalDetails : ""
  };
}
