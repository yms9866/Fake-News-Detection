import { button, checkbox, div, el, field, numberInput, textInput, textarea } from "../components/dom.js";

export function renderLiveOcrScreen(appState, actions) {
  const screen = div("screen form-screen live-ocr");
  screen.append(el("h1", "Live OCR"));
  screen.append(el("p", "Choose a source, start a session, then submit frames only while the visible indicator is active.", "muted"));

  const sourceId = textInput(appState.selectedCaptureSource ? appState.selectedCaptureSource.id : "");
  const sourceType = textInput(appState.selectedCaptureSource ? appState.selectedCaptureSource.sourceType : "screen");
  const ocrText = textarea("Breaking news claim text from the selected source.");
  const deepCheck = checkbox(false);
  const maxLength = numberInput(appState.settings.defaultMaxLength || 512);

  screen.append(
    field("Source id", sourceId),
    field("Source type", sourceType),
    field("Frame OCR text", ocrText),
    field("Deep check verification", deepCheck),
    field("Max length", maxLength)
  );

  const live = appState.liveSession;
  const controls = div("actions");
  controls.append(
    button("List screens", () => actions.listCaptureSources("screen")),
    button("List windows", () => actions.listCaptureSources("window")),
    button("Start live OCR", () =>
      actions.startLiveOcr({
        source_type: sourceType.value === "window" ? "window" : sourceType.value === "browser_tab" ? "browser_tab" : "screen",
        source_id: sourceId.value,
        permission_granted: true,
        settings: {
          capture_interval_ms: 1000,
          stability_required_frames: 1,
          verification_cooldown_seconds: 60
        }
      })
    )
  );
  if (live) {
    controls.append(
      button("Submit frame", () =>
        actions.submitLiveFrame({
          frame_id: `desktop-frame-${Date.now()}`,
          perceptual_hash: String(Date.now()),
          ocr_text: ocrText.value
        })
      ),
      button("Pause", actions.pauseLiveOcr),
      button("Resume", actions.resumeLiveOcr),
      button("Verify", () =>
        actions.verifyLiveOcr({
          trigger: "user",
          deep_check: deepCheck.checked,
          max_length: Number(maxLength.value),
          force: true
        })
      ),
      button("Stop", actions.stopLiveOcr),
      button("Cancel", actions.cancelLiveOcr, "danger")
    );
  }
  screen.append(controls);

  if (Array.isArray(appState.captureSources) && appState.captureSources.length > 0) {
    const list = div("source-list");
    for (const source of appState.captureSources) {
      const row = div("source-row");
      row.append(el("strong", source.name));
      row.append(button("Use", () => actions.selectCaptureSource(source)));
      list.append(row);
    }
    screen.append(list);
  }

  if (live) {
    const status = div("live-status");
    status.append(el("h2", liveStatusText(live)));
    status.append(el("p", live.visible_indicator_active ? "Capture is active." : "Capture is paused or stopped.", "muted"));
    if (live.stable_text) {
      status.append(el("p", live.stable_text, "muted"));
    }
    if (live.latest_verification) {
      status.append(el("p", `${live.latest_verification.final_verdict}: ${live.latest_verification.reason}`));
    }
    screen.append(status);
  }

  return screen;
}

function liveStatusText(live) {
  const labels = {
    awaiting_permission: "Waiting for permission",
    capturing: live && live.stable_text ? "Text detected" : "Looking for readable text",
    paused: "Paused",
    finalizing: "Preparing result",
    completed: "Stopped",
    cancelled: "Cancelled",
    failed: "Live OCR unavailable"
  };
  return labels[live && live.status] || "Preparing Live OCR";
}
