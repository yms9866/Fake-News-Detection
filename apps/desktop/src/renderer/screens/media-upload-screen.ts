import { button, checkbox, div, el, field, numberInput } from "../components/dom.js";
import { renderPanel, renderScreenHeader, renderToggleRow } from "../components/ui.js";

export function renderMediaUploadScreen(
  appState: { settings: { defaultDeepCheck: boolean; defaultMaxLength: number } },
  actions: { uploadMedia: (file: File | null, options: Record<string, unknown>) => Promise<void> }
) {
  const screen = div("screen form-screen media-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Multimodal verification",
      title: "Media",
      lede: "Upload an image, audio clip, or video for transcription and evidence analysis."
    })
  );

  const panel = renderPanel();
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,audio/*,video/*";
  const deepCheck = checkbox(appState.settings.defaultDeepCheck);
  const maxLength = numberInput(appState.settings.defaultMaxLength);

  panel.append(field("Media file", input));
  panel.append(
    renderToggleRow(
      "Search for supporting evidence",
      "Run Gemini Google Search grounding after media extraction.",
      deepCheck.checked,
      (next) => {
        deepCheck.checked = next;
      }
    )
  );
  panel.append(field("Maximum analysis length", maxLength));
  panel.append(
    button("Upload and analyze", () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      actions.uploadMedia(file, {
        deepCheck: deepCheck.checked,
        maxLength: Number(maxLength.value)
      });
    }, "button primary")
  );
  screen.append(panel);
  return screen;
}
