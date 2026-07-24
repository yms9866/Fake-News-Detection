import { renderResultView } from "../components/result-view.js";
import { div, el } from "../components/dom.js";

export function renderResultScreen(appState, actions) {
  const screen = div("screen");
  screen.append(el("h1", "Result"));
  screen.append(renderResultView(appState.latestResult, actions));
  return screen;
}
