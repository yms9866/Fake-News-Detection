import { div, el } from "../components/dom.js";
import { renderEmptyState, renderPanel, renderScreenHeader } from "../components/ui.js";
import { textOnly } from "../components/safe-content.js";

export function renderReportScreen(appState: { latestResult: Record<string, unknown> | null }) {
  const screen = div("screen report-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Executive intelligence",
      title: "Analysis Report"
    })
  );

  const result = appState.latestResult;
  if (!result) {
    screen.append(renderEmptyState("No analysis data", "Run an analysis to generate a detailed report."));
    return screen;
  }

  const panel = renderPanel();
  panel.append(el("h3", "Summary"));
  panel.append(el("p", `Verdict: ${textOnly(result.final_verdict, "Unknown")}`));
  panel.append(el("p", `Confidence: ${textOnly(result.confidence, "N/A")}`, "muted"));
  if (result.reason) {
    panel.append(el("p", textOnly(result.reason)));
  }

  const details = document.createElement("details");
  details.className = "technical-details";
  const summary = document.createElement("summary");
  summary.className = "muted";
  summary.textContent = "Technical details";
  details.append(summary);
  details.append(el("p", `Analysis ID: ${textOnly(result.analysis_id, "—")}`, "muted technical-id"));
  panel.append(details);
  screen.append(panel);
  return screen;
}
