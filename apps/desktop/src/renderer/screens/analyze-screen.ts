import { button, div, field, numberInput, textarea } from "../components/dom.js";
import { renderPanel, renderScreenHeader, renderSegmentedControl, renderToggleRow } from "../components/ui.js";

export type AnalyzeDraft = {
  mode: "text" | "url";
  text: string;
  url: string;
  deepCheck: boolean;
  maxLength: string;
};

export function createAnalyzeDraft(settings: { defaultDeepCheck: boolean; defaultMaxLength: number }) {
  return {
    mode: "text" as const,
    text: "",
    url: "",
    deepCheck: settings.defaultDeepCheck,
    maxLength: String(settings.defaultMaxLength)
  };
}

export function renderAnalyzeScreen(
  appState: { settings: { defaultDeepCheck: boolean; defaultMaxLength: number }; backendState?: string },
  actions: {
    analyzeText: (payload: { text: string; deep_check: boolean; max_length: number }) => Promise<void>;
    analyzeUrl: (payload: { url: string; deep_check: boolean; max_length: number }) => Promise<void>;
    startBackend: () => Promise<void>;
    refreshDiagnostics: () => Promise<void>;
    redraw: () => void;
  },
  draft: AnalyzeDraft
) {
  const screen = div("screen analyze-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Evidence-first verification",
      title: "What would you like to verify?",
      lede: "Paste a claim, article, headline, or source URL. Veritas analyzes available evidence through your local API."
    })
  );

  const panel = renderPanel();
  panel.append(
    renderSegmentedControl(draft.mode, [
      { value: "text", label: "Text" },
      { value: "url", label: "URL" }
    ], (next) => {
      if (draft.mode === next) {
        return;
      }
      draft.mode = next;
      actions.redraw();
    })
  );

  if (draft.mode === "text") {
    const text = textarea(draft.text);
    text.placeholder = "Paste a claim, article, headline, or text to analyze…";
    text.addEventListener("input", () => {
      draft.text = text.value;
    });
    panel.append(field("Claim or article text", text));
  } else {
    const url = document.createElement("input");
    url.type = "url";
    url.value = draft.url;
    url.placeholder = "https://example.com/article";
    url.addEventListener("input", () => {
      draft.url = url.value;
    });
    panel.append(field("Source URL", url));
  }

  panel.append(
    renderToggleRow(
      "Search for supporting evidence",
      "Run Gemini Google Search grounding to strengthen verification.",
      draft.deepCheck,
      (next) => {
        draft.deepCheck = next;
      }
    )
  );

  const maxLength = numberInput(Number(draft.maxLength) || appState.settings.defaultMaxLength);
  maxLength.addEventListener("input", () => {
    draft.maxLength = maxLength.value;
  });
  panel.append(field("Maximum analysis length", maxLength));

  const actionsRow = div("actions");
  actionsRow.append(
    button("Verify now →", () => {
      const max = Number(draft.maxLength) || appState.settings.defaultMaxLength;
      if (draft.mode === "text") {
        const trimmed = draft.text.trim();
        if (!trimmed) {
          return;
        }
        void actions.analyzeText({
          text: trimmed,
          deep_check: draft.deepCheck,
          max_length: max
        });
        return;
      }
      const trimmedUrl = draft.url.trim();
      if (!trimmedUrl) {
        return;
      }
      void actions.analyzeUrl({
        url: trimmedUrl,
        deep_check: draft.deepCheck,
        max_length: max
      });
    }, "button primary")
  );
  panel.append(actionsRow);
  screen.append(panel);
  return screen;
}
