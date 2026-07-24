import { button, checkbox, div, el, field, numberInput, textInput } from "../components/dom.js";

export function renderSettingsScreen(appState, actions) {
  const screen = div("screen form-screen");
  screen.append(el("h1", "Settings"));
  const origin = textInput(appState.settings.backendOrigin || "http://127.0.0.1:8000");
  const deepCheck = checkbox(appState.settings.defaultDeepCheck);
  const maxLength = numberInput(appState.settings.defaultMaxLength || 512);
  const timeout = numberInput(appState.settings.requestTimeoutMs || 60000);
  screen.append(
    field("Backend origin", origin),
    field("Default deep check", deepCheck),
    field("Default max length", maxLength),
    field("Request timeout", timeout)
  );
  screen.append(
    button("Save settings", () =>
      actions.saveSettings({
        backendOrigin: origin.value,
        defaultDeepCheck: deepCheck.checked,
        defaultMaxLength: Number(maxLength.value),
        requestTimeoutMs: Number(timeout.value)
      })
    ),
    button("Clear local state", actions.clearLocalState, "danger")
  );
  return screen;
}
