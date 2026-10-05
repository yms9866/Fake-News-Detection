import { button, checkbox, div, el, field, numberInput, textInput } from "../components/dom.js";
import { renderPanel, renderScreenHeader, renderToggleRow } from "../components/ui.js";

export function renderSettingsScreen(
  appState: {
    settings: {
      backendOrigin: string;
      defaultDeepCheck: boolean;
      defaultMaxLength: number;
      requestTimeoutMs: number;
    };
  },
  actions: {
    saveSettings: (settings: Record<string, unknown>) => Promise<void>;
    clearLocalState: () => Promise<void>;
  }
) {
  const screen = div("screen form-screen settings-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Preferences",
      title: "Settings",
      lede: "Manage your connection to the Veritas engine and default analysis parameters."
    })
  );

  const panel = renderPanel();
  const origin = textInput(appState.settings.backendOrigin || "http://127.0.0.1:8000");
  const deepCheck = checkbox(appState.settings.defaultDeepCheck);
  const maxLength = numberInput(appState.settings.defaultMaxLength || 512);
  const timeout = numberInput(appState.settings.requestTimeoutMs || 600000);

  panel.append(
    field("Backend origin", origin),
    renderToggleRow(
      "Search for supporting evidence by default",
      "Enable Gemini Google Search grounding on new analyses.",
      deepCheck.checked,
      (next) => {
        deepCheck.checked = next;
      }
    ),
    field("Default max length", maxLength),
    field("Request timeout (ms)", timeout)
  );

  panel.append(el("p", "This local client does not use sign-in. Analysis calls the API directly.", "muted"));
  const actionsRow = div("actions");
  actionsRow.append(
    button("Save settings", () =>
      actions.saveSettings({
        backendOrigin: origin.value,
        defaultDeepCheck: deepCheck.checked,
        defaultMaxLength: Number(maxLength.value),
        requestTimeoutMs: Number(timeout.value)
      }),
      "button primary"
    ),
    button("Clear local state", actions.clearLocalState, "button danger")
  );
  panel.append(actionsRow);
  screen.append(panel);
  return screen;
}
