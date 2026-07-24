import { button, div, el } from "../components/dom.js";

export function renderHomeScreen(appState, actions) {
  const screen = div("screen home");
  screen.append(el("p", "Local evidence workspace", "eyebrow"));
  screen.append(el("h1", "Fake News Desktop"));
  screen.append(el("p", "Review claims with local style analysis, deterministic evidence policy, and source records you can inspect safely.", "lede"));
  screen.append(el("p", "Local backend: " + (appState.backendState || "unknown"), "muted"));
  const actionsRow = div("actions");
  actionsRow.append(
    button("Start backend", actions.startBackend),
    button("Check readiness", actions.refreshDiagnostics),
    button("New analysis", () => actions.navigate("new-analysis"))
  );
  screen.append(actionsRow);
  if (appState.latestResult) {
    screen.append(el("h2", "Latest result"));
    screen.append(el("p", `${appState.latestResult.final_verdict || "UNVERIFIED"} - ${appState.latestResult.confidence || "LOW"} confidence`));
  }
  return screen;
}
