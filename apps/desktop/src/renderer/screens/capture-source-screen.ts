import { button, div, el } from "../components/dom.js";

export function renderCaptureSourceScreen(appState, actions) {
  const screen = div("screen capture-screen");
  screen.append(el("h1", "One-time Capture"));
  screen.append(el("p", "Choose a screen or window, then confirm a single frame capture.", "muted"));
  const sources = div("source-list");
  if (!appState.captureSources || appState.captureSources.length === 0) {
    sources.append(el("p", "No sources loaded.", "muted"));
  }
  for (const source of appState.captureSources || []) {
    const row = div("source-row");
    row.append(el("strong", source.name));
    row.append(button("Select", () => actions.selectCaptureSource(source)));
    sources.append(row);
  }
  const selected = appState.selectedCaptureSource;
  screen.append(
    button("List screens", () => actions.listCaptureSources("screen")),
    button("List windows", () => actions.listCaptureSources("window")),
    sources
  );
  if (selected) {
    screen.append(el("h2", "Selected source"));
    screen.append(el("p", selected.name, "muted"));
    screen.append(button("Capture one frame", () => actions.captureOnce(selected)));
    screen.append(button("Capture cropped region", () => actions.captureOnce(selected, { x: 0, y: 0, width: 800, height: 450 })));
  }
  return screen;
}
