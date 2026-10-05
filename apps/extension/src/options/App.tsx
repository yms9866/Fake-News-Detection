import { DEFAULT_SETTINGS } from "../shared/storage.js";
import { MESSAGE_TYPES, makeMessage } from "../shared/messages.js";
import { button, div, el } from "../ui/dom.js";

export function renderOptions(root) {
  const state = {
    settings: { ...DEFAULT_SETTINGS },
    message: "",
    error: ""
  };

  async function load() {
    const response = await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.getAnalysisState));
    state.settings = { ...DEFAULT_SETTINGS, ...(response.settings || {}) };
    draw();
  }

  async function save() {
    state.error = "";
    const response = await chrome.runtime.sendMessage(
      makeMessage(MESSAGE_TYPES.saveSettings, readForm(root))
    );
    if (response.ok) {
      state.settings = response.settings;
      state.message = "Settings saved.";
    } else {
      state.error = response.error.message;
    }
    draw();
  }

  async function clearState() {
    await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.clearState));
    state.message = "Stored analysis references cleared.";
    draw();
  }

  async function testConnection() {
    const response = await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.testConnection));
    state.message = response.ok ? "Local API is reachable and ready." : "";
    state.error = response.ok ? "" : response.error.message;
    draw();
  }

  function draw() {
    root.replaceChildren();
    const shell = div("shell");
    const top = div("topbar");
    const brand = div("brand");
    brand.append(el("span", "FND", "brand-mark"));
    const titles = div();
    titles.append(el("h1", "Extension settings"));
    titles.append(el("p", "Local companion for the analysis API", "subtitle"));
    brand.append(titles);
    top.append(brand);
    shell.append(top);

    const form = document.createElement("form");
    form.className = "form-card";
    form.append(el("div", "Connection", "section-title"));
    form.append(
      field("Backend origin", "backendOrigin", state.settings.backendOrigin, "text", "Only localhost or 127.0.0.1"),
      field("Pairing token", "pairingToken", state.settings.pairingToken || "", "password", "Optional. Sent as X-FND-Pairing-Token."),
      field("Request timeout (ms)", "requestTimeoutMs", String(state.settings.requestTimeoutMs), "number", "Deep check often needs 60–120 seconds.")
    );
    form.append(el("div", "Analysis", "section-title"));
    form.append(
      field("Maximum length", "defaultMaxLength", String(state.settings.defaultMaxLength), "number", "Tokens sent to the local style model."),
      toggle("Run factual verification (deep check)", "defaultDeepCheck", state.settings.defaultDeepCheck)
    );
    form.append(el("div", "Display", "section-title"));
    form.append(
      toggle("Show a result overlay on the page", "showOverlayAutomatically", state.settings.showOverlayAutomatically),
      toggle("Remember the latest analysis", "storeLatestAnalysisReference", state.settings.storeLatestAnalysisReference)
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void save();
    });
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "primary-btn";
    saveButton.textContent = "Save settings";
    form.append(saveButton);
    shell.append(form);

    const actions = div("utility-row");
    actions.append(
      button("Test connection", testConnection, "ghost"),
      button("Clear stored results", clearState, "ghost")
    );
    shell.append(actions);
    shell.append(el("p", "This extension only talks to a loopback API. Provider keys stay on the backend.", "muted"));
    if (state.message) {
      shell.append(el("p", state.message, "status-ok"));
    }
    if (state.error) {
      const error = div("error-banner");
      error.textContent = state.error;
      shell.append(error);
    }
    root.append(shell);
  }

  void load();
  draw();
}

function readForm(root) {
  const data = {};
  for (const input of root.querySelectorAll("input")) {
    if (input.type === "checkbox") {
      data[input.name] = input.checked;
    } else if (input.type === "number") {
      data[input.name] = Number(input.value);
    } else {
      data[input.name] = input.value;
    }
  }
  return data;
}

function field(label, name, value, type, hint) {
  const wrapper = div("field");
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = value;
  input.setAttribute("aria-label", label);
  wrapper.append(el("label", label), input);
  if (hint) {
    wrapper.append(el("p", hint, "muted"));
  }
  return wrapper;
}

function toggle(label, name, checked) {
  const wrapper = div("toggle");
  const input = document.createElement("input");
  input.name = name;
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.setAttribute("aria-label", label);
  const copy = div();
  copy.append(el("label", label));
  wrapper.append(input, copy);
  return wrapper;
}
