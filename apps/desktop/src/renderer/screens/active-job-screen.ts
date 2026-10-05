import { renderJobProgress } from "../components/job-progress.js";
import { div } from "../components/dom.js";
import { renderPanel, renderScreenHeader } from "../components/ui.js";

export function renderActiveJobScreen(
  appState: { activeJob: Record<string, unknown> | null },
  actions: { cancelActiveJob: () => Promise<void> }
) {
  const screen = div("screen active-job-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Processing",
      title: "Active job",
      lede: "Waiting for the backend to finish media extraction or analysis."
    })
  );
  const panel = renderPanel();
  panel.append(renderJobProgress(appState.activeJob, actions.cancelActiveJob));
  screen.append(panel);
  return screen;
}
