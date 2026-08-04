import { MESSAGE_TYPES, makeMessage } from "../shared/messages.js";

export function renderPopup(root) {
  const state = {
    busy: false,
    connection: "Checking backend...",
    active: null,
    latest: null,
    error: null
  };

  async function refresh() {
    const response = await send(MESSAGE_TYPES.getAnalysisState);
    state.active = response.active || null;
    state.latest = response.latest || null;
    draw();
  }

  async function testConnection() {
    state.connection = "Checking backend...";
    draw();
    const response = await send(MESSAGE_TYPES.testConnection);
    state.connection = response.ok ? "Backend connected" : response.error.message;
    draw();
  }

  async function run(type) {
    state.busy = true;
    state.error = null;
    draw();
    const response = await send(type);
    state.busy = false;
    if (!response.ok) {
      state.error = response.error;
    }
    await refresh();
  }

  async function cancel() {
    if (!state.active || !state.active.jobId) {
      return;
    }
    await run(MESSAGE_TYPES.cancelJob);
  }

  async function openSettings() {
    chrome.runtime.openOptionsPage();
  }

  async function openLatest() {
    await send(MESSAGE_TYPES.openLatestReport);
  }

  function draw() {
    root.replaceChildren();
    const title = el("h1", "Fake News Analysis");
    const status = div("status");
    status.append(el("strong", "Backend"), el("p", state.connection, "muted"));

    const actions = div("actions");
    actions.append(
      action("Analyze selected text", () => run(MESSAGE_TYPES.analyzeSelection), true),
      action("Analyze current article", () => run(MESSAGE_TYPES.analyzeArticle)),
      action("Analyze current page", () => run(MESSAGE_TYPES.analyzePage)),
      action("Analyze visible tab", () => run(MESSAGE_TYPES.captureVisibleTab)),
      action("Open latest report", openLatest),
      action("Settings", openSettings)
    );
    if (state.active && state.active.jobId) {
      actions.append(action("Cancel active job", cancel));
    }

    root.append(title, status, actions);
    if (state.active) {
      root.append(renderActive(state.active));
    }
    if (state.latest) {
      root.append(renderLatest(state.latest));
    }
    if (state.error) {
      const error = div("error");
      error.textContent = `${state.error.code}: ${state.error.message}`;
      root.append(error);
    }
    const footer = div("footer");
    footer.append(action("Test connection", testConnection), action("Refresh", refresh));
    root.append(footer);
  }

  function action(label, handler, primary = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.disabled = state.busy;
    if (primary) {
      button.className = "primary";
    }
    button.addEventListener("click", handler);
    return button;
  }

  void refresh();
  void testConnection();
  draw();
}

function renderActive(active) {
  const card = div("result");
  card.append(el("strong", "Active job"), document.createTextNode(active.jobId || "Analysis running"));
  card.append(el("p", `State: ${active.clientState || "processing"}`));
  if (active.backendJobStatus) {
    card.append(el("p", `Backend: ${active.backendJobStatus}`));
  }
  return card;
}

function renderLatest(summary) {
  const card = div("result");
  card.append(
    metric("Style signal strength", summary.styleConfidence || "N/A"),
    metric("Style assessment", summary.styleText || fallbackStyleText(summary.styleSignal)),
    metric("Claims checked", String(summary.claimCount || 0)),
    metric("Gemini evidence analysis", summary.verificationStatus || "not_run"),
    metric("Final decision", `${summary.finalVerdict || "UNVERIFIED"} (${summary.confidence || "LOW"})`),
    metric("Qualifying sources", String(summary.qualifyingSourceCount || 0))
  );
  if (summary.warnings && summary.warnings.length) {
    card.append(el("p", summary.warnings.join(" "), "muted"));
  }
  return card;
}

function metric(label, value) {
  const p = document.createElement("p");
  p.append(el("strong", `${label}: `), document.createTextNode(value));
  return p;
}

function fallbackStyleText(signal) {
  if (signal === "LOW_STYLE_RISK") {
    return "The writing style seems similar to real or legitimate news reporting.";
  }
  if (signal === "HIGH_STYLE_RISK") {
    return "The writing style seems similar to fake, misleading, or fabricated content.";
  }
  return "The writing-style assessment is unavailable.";
}

function div(className) {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function el(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) {
    node.className = className;
  }
  return node;
}

async function send(type, payload = null) {
  return await chrome.runtime.sendMessage(makeMessage(type, payload));
}
