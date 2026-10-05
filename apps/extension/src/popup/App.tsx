import { MESSAGE_TYPES, makeMessage } from "../shared/messages.js";
import { saveLatestSummary } from "../shared/storage.js";
import { button, div, el, svgIcon, ICONS } from "../ui/dom.js";
import { humanJobState, renderVerdictCard } from "../ui/summary.js";

export function renderPopup(root) {
  const state = {
    busy: false,
    connection: "Checking…",
    connected: false,
    active: null,
    latest: null,
    error: null
  };
  let pollTimer = null;
  let lastSnapshot = "";

  function jobInFlight(active) {
    return Boolean(
      active &&
        active.jobId &&
        !["completed", "failed", "cancelled"].includes(active.clientState)
    );
  }

  function schedulePoll() {
    if (pollTimer) {
      return;
    }
    pollTimer = setTimeout(() => {
      pollTimer = null;
      void refresh();
    }, 1000);
  }

  async function refresh() {
    const response = await send(MESSAGE_TYPES.getAnalysisState);
    if (!response || response.ok === false) {
      return;
    }
    state.active = response.active || null;
    state.latest = response.latest || null;
    if (jobInFlight(state.active)) {
      state.busy = true;
      schedulePoll();
    }
    draw();
  }

  async function testConnection() {
    state.connection = "Checking…";
    draw();
    const response = await send(MESSAGE_TYPES.testConnection);
    state.connected = Boolean(response.ok);
    state.connection = response.ok ? "Local API ready" : response.error.message;
    draw();
  }

  async function run(type) {
    state.busy = true;
    state.error = null;
    draw();
    const response = await send(type);
    if (!response.ok) {
      state.error = response.error;
      state.busy = false;
    }
    await refresh();
    if (!jobInFlight(state.active)) {
      state.busy = false;
      draw();
    }
  }

  async function cancel() {
    if (!state.active || !state.active.jobId) {
      return;
    }
    await run(MESSAGE_TYPES.cancelJob);
  }

  async function openReport() {
    try {
      if (state.latest) {
        await saveLatestSummary(state.latest);
      }
      await chrome.tabs.create({ url: chrome.runtime.getURL("report/report.html") });
      return;
    } catch {
      /* fall through to the service worker */
    }
    const response = await send(MESSAGE_TYPES.openLatestReport, { summary: state.latest });
    if (!response || response.ok === false) {
      state.error = (response && response.error) || {
        code: "NO_RESULT",
        message: "Could not open the report."
      };
      draw();
    }
  }

  function draw() {
    const snapshot = JSON.stringify(state);
    if (snapshot === lastSnapshot) {
      return;
    }
    lastSnapshot = snapshot;
    root.replaceChildren();
    const shell = div("shell");

    const top = div("topbar");
    const brand = div("brand");
    brand.append(el("span", "FND", "brand-mark"));
    const titles = div();
    titles.append(el("h1", "Fake News Analysis"));
    titles.append(el("p", "Check this page", "subtitle"));
    brand.append(titles);
    const pill = el("span", state.connected ? "Connected" : state.connection, `pill${state.connected ? " ok" : ""}`);
    pill.title = state.connection;
    top.append(brand, pill);
    shell.append(top);

    const grid = div("action-grid");
    grid.append(
      actionCard("Selection", "Selected text only", ICONS.selection, () => run(MESSAGE_TYPES.analyzeSelection), true),
      actionCard("Article", "Main story on this page", ICONS.article, () => run(MESSAGE_TYPES.analyzeArticle)),
      actionCard("Full page", "All visible page text", ICONS.page, () => run(MESSAGE_TYPES.analyzePage)),
      actionCard("Screenshot", "One-time visible tab capture", ICONS.camera, () => run(MESSAGE_TYPES.captureVisibleTab))
    );
    shell.append(grid);

    const utilities = div("utility-row");
    utilities.append(
      button("Open report", () => void openReport(), "ghost"),
      button("Settings", () => chrome.runtime.openOptionsPage(), "ghost")
    );
    shell.append(utilities);

    if (jobInFlight(state.active) || (state.active && state.busy)) {
      shell.append(renderJob(state.active, cancel, state.busy));
    }
    if (state.error) {
      const error = div("error-banner");
      error.append(el("strong", readableError(state.error)));
      error.append(el("p", state.error.message, "muted"));
      shell.append(error);
    }
    if (state.latest) {
      shell.append(el("div", "Latest result", "section-title"));
      shell.append(renderVerdictCard(state.latest, { compact: true }));
    } else if (!state.busy) {
      shell.append(el("p", "Analyze this page to see a verdict here.", "empty"));
    }

    root.append(shell);
  }

  function actionCard(title, hint, iconPath, handler, primary = false) {
    const node = button("", handler, primary ? "action-card primary" : "action-card");
    node.disabled = state.busy;
    const heading = div("action-title");
    heading.append(svgIcon(iconPath, 16), el("strong", title));
    node.append(heading, el("span", hint));
    return node;
  }

  void refresh();
  void testConnection();
  draw();
  if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(() => {
      void refresh();
    });
  }
}

function renderJob(active, onCancel, busy) {
  const card = div("job-card");
  const top = div("job-top");
  top.append(el("strong", humanJobState(active && active.clientState)));
  if (active && active.jobId) {
    const cancelButton = button("Cancel", onCancel, "danger");
    cancelButton.disabled = !busy;
    top.append(cancelButton);
  }
  card.append(top);
  const bar = div("progress");
  bar.append(el("span"));
  card.append(bar);
  if (active && active.backendJobStatus) {
    card.append(el("p", `Backend: ${active.backendJobStatus}`, "muted"));
  }
  return card;
}

function readableError(error) {
  const code = String(error && error.code ? error.code : "ERROR").replace(/_/gu, " ");
  return code.charAt(0) + code.slice(1).toLowerCase();
}

async function send(type, payload = null) {
  return await chrome.runtime.sendMessage(makeMessage(type, payload));
}
