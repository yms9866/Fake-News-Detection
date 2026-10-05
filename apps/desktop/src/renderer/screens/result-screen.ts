import { renderResultView } from "../components/result-view.js";
import { div } from "../components/dom.js";
import { renderScreenHeader, renderVerdictBanner } from "../components/ui.js";

export function renderResultScreen(appState: { latestResult: Record<string, unknown> | null }, actions: Record<string, unknown>) {
  const screen = div("screen result-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Evidence summary",
      title: "Result"
    })
  );
  if (appState.latestResult) {
    screen.append(renderVerdictBanner(appState.latestResult));
  }
  screen.append(renderResultView(appState.latestResult, actions));
  return screen;
}
