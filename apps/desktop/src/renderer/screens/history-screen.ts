import { button, div, el } from "../components/dom.js";
import { renderEmptyState, renderPanel, renderScreenHeader } from "../components/ui.js";

export function renderHistoryScreen(
  appState: { history: Array<Record<string, unknown>> },
  actions: {
    openHistory: (item: Record<string, unknown>) => Promise<void>;
    clearHistory: () => Promise<void>;
  }
) {
  const screen = div("screen history-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Local workspace",
      title: "History",
      lede: "Open a previous analysis to inspect its verdict, claims, and sources."
    })
  );

  const history = appState.history || [];
  if (history.length === 0) {
    screen.append(renderEmptyState("No history yet", "Completed analyses will appear here for quick reopening."));
    return screen;
  }

  const panel = renderPanel();
  const list = el("ul", null, "history-list");
  for (const item of history) {
    const row = el("li", null, "history-item");
    const copy = div("history-copy");
    copy.append(el("strong", String(item.analysisId || "Unknown analysis")));
    copy.append(
      el(
        "span",
        `${String(item.inputType || "unknown")} · ${String(item.finalVerdict || "UNVERIFIED")}`,
        "muted"
      )
    );
    row.append(copy);
    row.append(
      button("Open", () => actions.openHistory(item), "button ghost")
    );
    list.append(row);
  }
  panel.append(list);
  panel.append(button("Clear history", actions.clearHistory, "button danger"));
  screen.append(panel);
  return screen;
}
