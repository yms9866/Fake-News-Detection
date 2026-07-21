import { renderJobProgress } from "../components/job-progress.js";
import { div, el } from "../components/dom.js";

export function renderActiveJobScreen(appState, actions) {
  const screen = div("screen");
  screen.append(el("h1", "Active Job"));
  screen.append(renderJobProgress(appState.activeJob, actions.cancelActiveJob));
  return screen;
}
