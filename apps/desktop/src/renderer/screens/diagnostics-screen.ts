import { button, div, el } from "../components/dom.js";
import { renderPanel, renderScreenHeader } from "../components/ui.js";

export function renderDiagnosticsScreen(
  appState: { diagnostics: Record<string, unknown> | null },
  actions: { refreshDiagnostics: () => Promise<void> }
) {
  const screen = div("screen diagnostics-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Runtime health",
      title: "Diagnostics",
      lede: "Inspect backend readiness, capture permissions, and local runtime details."
    })
  );

  const panel = renderPanel();
  panel.append(el("pre", JSON.stringify(appState.diagnostics || {}, null, 2), "diagnostics-json"));
  panel.append(button("Refresh diagnostics", actions.refreshDiagnostics, "button primary"));
  screen.append(panel);
  return screen;
}
