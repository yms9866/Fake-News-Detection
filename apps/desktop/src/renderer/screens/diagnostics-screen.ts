import { button, div, el } from "../components/dom.js";

export function renderDiagnosticsScreen(appState, actions) {
  const screen = div("screen diagnostics");
  screen.append(el("h1", "Diagnostics"));
  const diagnostics = appState.diagnostics || {};
  screen.append(el("pre", JSON.stringify(diagnostics, null, 2)));
  screen.append(button("Refresh diagnostics", actions.refreshDiagnostics));
  return screen;
}
