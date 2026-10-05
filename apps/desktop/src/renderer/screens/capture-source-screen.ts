import { button, div, el } from "../components/dom.js";
import { renderPanel, renderScreenHeader } from "../components/ui.js";

export function renderCaptureSourceScreen(
  appState: {
    captureSources: Array<{ id: string; name: string; sourceType: string }>;
    selectedCaptureSource: { id: string; name: string; sourceType: string } | null;
  },
  actions: {
    listCaptureSources: (sourceType: string) => Promise<void>;
    selectCaptureSource: (source: { id: string; name: string; sourceType: string }) => void;
    captureOnce: (source: { id: string; name: string; sourceType: string }, crop?: Record<string, number> | null) => Promise<void>;
  }
) {
  const screen = div("screen capture-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Screen capture",
      title: "Capture",
      lede: "Choose a screen or window, then confirm a single frame capture for analysis."
    })
  );

  const panel = renderPanel();
  const toolbar = div("actions");
  toolbar.append(
    button("List screens", () => actions.listCaptureSources("screen"), "button ghost"),
    button("List windows", () => actions.listCaptureSources("window"), "button ghost")
  );
  panel.append(toolbar);

  const sources = div("source-list");
  if (!appState.captureSources || appState.captureSources.length === 0) {
    sources.append(el("p", "No sources loaded yet.", "muted"));
  }
  for (const source of appState.captureSources || []) {
    const row = div("source-row");
    row.append(el("strong", source.name));
    row.append(button("Select", () => actions.selectCaptureSource(source), "button ghost"));
    sources.append(row);
  }
  panel.append(sources);

  const selected = appState.selectedCaptureSource;
  if (selected) {
    const selectedPanel = div("selected-source");
    selectedPanel.append(el("h3", "Selected source"));
    selectedPanel.append(el("p", selected.name, "muted"));
    const captureActions = div("actions");
    captureActions.append(
      button("Capture one frame", () => actions.captureOnce(selected), "button primary"),
      button("Capture cropped region", () => actions.captureOnce(selected, { x: 0, y: 0, width: 800, height: 450 }), "button ghost")
    );
    selectedPanel.append(captureActions);
    panel.append(selectedPanel);
  }

  screen.append(panel);
  return screen;
}
