import { button, div, el } from "../components/dom.js";
import { evidenceLinkDescriptor, textOnly } from "../components/safe-content.js";
import { renderEmptyState, renderPanel, renderScreenHeader } from "../components/ui.js";

export function renderReviewScreen(
  appState: { latestResult: Record<string, unknown> | null },
  actions: { openSource: (url: string) => Promise<void> }
) {
  const screen = div("screen review-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Evidence inspector",
      title: "Review"
    })
  );

  const result = appState.latestResult;
  if (!result) {
    screen.append(
      renderEmptyState(
        "Nothing to review",
        "Open a result or history item to inspect claims and sources."
      )
    );
    return screen;
  }

  const intro = renderPanel();
  intro.append(el("p", `Final verdict: ${textOnly(result.final_verdict, "UNVERIFIED")}`));
  intro.append(el("p", "Style is not the verdict. Compare claims against reviewed sources.", "muted"));
  screen.append(intro);

  const claims = Array.isArray(result.claims) ? result.claims : [];
  for (const [index, claim] of claims.entries()) {
    const card = div("card");
    card.append(el("p", `Claim ${index + 1}`, "eyebrow"));
    card.append(el("p", textOnly(claim.claim_text, "No text")));
    screen.append(card);
  }

  const sources = Array.isArray(result.sources) ? result.sources : [];
  for (const [index, source] of sources.entries()) {
    const descriptor = evidenceLinkDescriptor(source);
    const card = div("card source-review-card");
    card.append(el("p", `Source ${index + 1}`, "eyebrow"));
    card.append(el("h4", descriptor.title));
    card.append(el("p", descriptor.publisher || descriptor.domain || "Unknown publisher", "muted"));
    const meta = div("badge-list");
    meta.append(el("span", descriptor.stance || "Unknown stance", "badge"));
    meta.append(el("span", `${descriptor.reliability} reliability`, "badge"));
    card.append(meta);
    if (descriptor.url) {
      card.append(
        button("Open source", () => actions.openSource(descriptor.url), "button link-button")
      );
    }
    screen.append(card);
  }

  if (claims.length === 0 && sources.length === 0) {
    screen.append(renderEmptyState("No evidence records", "This analysis did not return claims or sources to inspect."));
  }

  return screen;
}
