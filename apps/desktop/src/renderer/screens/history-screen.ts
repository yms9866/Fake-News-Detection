import { button, div, el } from "../components/dom.js";

export function renderHistoryScreen(appState, actions) {
  const screen = div("screen");
  screen.append(el("h1", "History"));
  const list = el("ul", null, "history-list");
  for (const item of appState.history || []) {
    const row = el("li");
    row.append(el("strong", item.analysisId));
    row.append(el("span", ` ${item.inputType} ${item.finalVerdict || ""}`, "muted"));
    list.append(row);
  }
  if (!appState.history || appState.history.length === 0) {
    list.append(el("li", "No local history references yet.", "muted"));
  }
  screen.append(list, button("Clear history", actions.clearHistory, "danger"));
  return screen;
}
