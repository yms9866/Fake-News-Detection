import { button, checkbox, div, el, field, numberInput, textInput, textarea } from "../components/dom.js";
import { renderPanel, renderScreenHeader, renderToggleRow } from "../components/ui.js";

export function renderLiveOcrScreen(
  appState: {
    settings: { defaultMaxLength: number };
    selectedCaptureSource: { id: string; name: string; sourceType: string } | null;
    captureSources: Array<{ id: string; name: string; sourceType: string }>;
    liveSession: Record<string, unknown> | null;
  },
  actions: Record<string, (...args: unknown[]) => Promise<void>>
) {
  const screen = div("screen form-screen live-screen");
  screen.append(
    renderScreenHeader({
      eyebrow: "Continuous capture",
      title: "Live",
      lede: "Choose a source, start a session, then submit frames while the visible indicator is active."
    })
  );

  const panel = renderPanel();
  const sourceId = textInput(appState.selectedCaptureSource ? appState.selectedCaptureSource.id : "");
  const sourceType = textInput(appState.selectedCaptureSource ? appState.selectedCaptureSource.sourceType : "screen");
  const ocrText = textarea("Breaking news claim text from the selected source.");
  const deepCheck = checkbox(false);
  const maxLength = numberInput(appState.settings.defaultMaxLength || 512);

  panel.append(
    field("Source id", sourceId),
    field("Source type", sourceType),
    field("Frame OCR text", ocrText),
    renderToggleRow(
      "Deep check verification",
      "Run evidence search when verifying stable live text.",
      deepCheck.checked,
      (next) => {
        deepCheck.checked = next;
      }
    ),
    field("Max length", maxLength)
  );

  const live = appState.liveSession;
  const controls = div("actions");
  controls.append(
    button("List screens", () => actions.listCaptureSources("screen"), "button ghost"),
    button("List windows", () => actions.listCaptureSources("window"), "button ghost"),
    button(
      "Start live session",
      () =>
        actions.startLiveOcr({
          source_type: sourceType.value === "window" ? "window" : sourceType.value === "browser_tab" ? "browser_tab" : "screen",
          source_id: sourceId.value,
          permission_granted: true,
          settings: {
            capture_interval_ms: 1000,
            stability_required_frames: 1,
            verification_cooldown_seconds: 60
          }
        }),
      "button primary"
    )
  );
  if (live) {
    controls.append(
      button(
        "Submit frame",
        () =>
          actions.submitLiveFrame({
            frame_id: `desktop-frame-${Date.now()}`,
            perceptual_hash: String(Date.now()),
            ocr_text: ocrText.value
          }),
        "button ghost"
      ),
      button("Pause", actions.pauseLiveOcr, "button ghost"),
      button("Resume", actions.resumeLiveOcr, "button ghost"),
      button(
        "Verify",
        () =>
          actions.verifyLiveOcr({
            trigger: "user",
            deep_check: deepCheck.checked,
            max_length: Number(maxLength.value),
            force: true
          }),
        "button ghost"
      ),
      button("Stop", actions.stopLiveOcr, "button ghost"),
      button("Cancel", actions.cancelLiveOcr, "button danger")
    );
  }
  panel.append(controls);

  if (Array.isArray(appState.captureSources) && appState.captureSources.length > 0) {
    const list = div("source-list");
    for (const source of appState.captureSources) {
      const row = div("source-row");
      row.append(el("strong", source.name));
      row.append(button("Use", () => actions.selectCaptureSource(source), "button ghost"));
      list.append(row);
    }
    panel.append(list);
  }

  if (live) {
    const status = div("live-status panel nested");
    status.append(el("h3", liveStatusText(live)));
    status.append(el("p", live.visible_indicator_active ? "Capture is active." : "Capture is paused or stopped.", "muted"));
    if (live.stable_text) {
      status.append(el("p", String(live.stable_text), "muted"));
    }
    if (live.latest_verification) {
      const verification = live.latest_verification as Record<string, unknown>;
      status.append(el("p", `${verification.final_verdict}: ${verification.reason}`));
    }
    panel.append(status);
  }

  screen.append(panel);
  return screen;
}

function liveStatusText(live: Record<string, unknown>) {
  const labels: Record<string, string> = {
    awaiting_permission: "Waiting for permission",
    capturing: live && live.stable_text ? "Text detected" : "Looking for readable text",
    paused: "Paused",
    finalizing: "Preparing result",
    completed: "Stopped",
    cancelled: "Cancelled",
    failed: "Live OCR unavailable"
  };
  return labels[String(live && live.status)] || "Preparing Live OCR";
}
