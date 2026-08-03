import { DEFAULT_SETTINGS } from "../shared/storage.js";
import { MESSAGE_TYPES, makeMessage } from "../shared/messages.js";

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
    const response = await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.saveSettings, readForm(root)));
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
    state.message = "Stored extension state cleared.";
    draw();
  }

  async function signIn() {
    const username = root.querySelector("input[name='reviewerName']");
    const response = await chrome.runtime.sendMessage(
      makeMessage(MESSAGE_TYPES.signIn, {
        username: username && username.value ? username.value : "extension-reviewer"
      })
    );
    state.message = response.ok ? "Signed in." : "";
    state.error = response.ok ? "" : response.error.message;
    await load();
  }

  async function signOut() {
    const response = await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.signOut));
    state.message = response.ok ? "Signed out." : "";
    state.error = response.ok ? "" : response.error.message;
    await load();
  }

  async function testConnection() {
    const response = await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.testConnection));
    state.message = response.ok ? "Backend connection works." : "";
    state.error = response.ok ? "" : response.error.message;
    draw();
  }

  function draw() {
    root.replaceChildren();
    root.append(el("h1", "Extension settings"));
    const form = document.createElement("form");
    form.append(
      field("Backend origin", "backendOrigin", state.settings.backendOrigin),
      field("Optional pairing token", "pairingToken", state.settings.pairingToken || "", "password"),
      field("Reviewer name", "reviewerName", "extension-reviewer"),
      field("Maximum length", "defaultMaxLength", String(state.settings.defaultMaxLength), "number"),
      field("Request timeout ms", "requestTimeoutMs", String(state.settings.requestTimeoutMs), "number"),
      checkbox("Style analysis + factual verification", "defaultDeepCheck", state.settings.defaultDeepCheck),
      checkbox("Show page overlay automatically", "showOverlayAutomatically", state.settings.showOverlayAutomatically),
      checkbox("Store latest analysis reference", "storeLatestAnalysisReference", state.settings.storeLatestAnalysisReference)
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void save();
    });
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.textContent = "Save settings";
    form.append(saveButton);
    root.append(form);
    const actions = div("actions");
    actions.append(
      button("Sign in", signIn),
      button("Sign out", signOut),
      button("Test connection", testConnection),
      button("Clear stored state", clearState)
    );
    root.append(actions);
    root.append(el("p", "Local mode accepts only localhost or loopback backend origins.", "muted"));
    if (state.message) {
      root.append(el("p", state.message, "status"));
    }
    if (state.error) {
      root.append(el("p", state.error, "error"));
    }
  }

  void load();
  draw();
}

function readForm(root) {
  const data = {};
  for (const input of root.querySelectorAll("input")) {
    if (input.name === "reviewerName") {
      continue;
    }
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

function field(label, name, value, type = "text") {
  const wrapper = div("status");
  const input = document.createElement("input");
  input.name = name;
  input.type = type;
  input.value = value;
  input.style.width = "100%";
  input.setAttribute("aria-label", label);
  wrapper.append(el("label", label), input);
  return wrapper;
}

function checkbox(label, name, checked) {
  const wrapper = div("status");
  const input = document.createElement("input");
  input.name = name;
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.setAttribute("aria-label", label);
  wrapper.append(input, el("span", ` ${label}`));
  return wrapper;
}

function button(label, handler) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  node.addEventListener("click", handler);
  return node;
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
