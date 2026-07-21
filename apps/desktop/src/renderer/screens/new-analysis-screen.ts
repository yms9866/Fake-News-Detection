import { button, div, el } from "../components/dom.js";

export function renderNewAnalysisScreen(actions) {
  const screen = div("screen");
  screen.append(el("h1", "New Analysis"));
  const grid = div("choice-grid");
  grid.append(
    button("Text or URL", () => actions.navigate("text-url"), "choice"),
    button("Media Upload", () => actions.navigate("media"), "choice"),
    button("One-time Capture", () => actions.navigate("capture"), "choice")
  );
  screen.append(grid);
  return screen;
}
