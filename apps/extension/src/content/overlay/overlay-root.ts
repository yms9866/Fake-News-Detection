import { renderResultOverlay } from "./result-overlay.js";
import overlayCss from "./overlay-css.js";
import { MESSAGE_TYPES, makeMessage } from "../../shared/messages.js";
import { saveLatestSummary } from "../../shared/storage.js";

const ROOT_ID = "fnd-analysis-overlay-root";

export function showOverlay(summary) {
  const root = ensureOverlayRoot();
  const card = renderResultOverlay(root.shadowRoot, summary);
  if (!root.shadowRoot.querySelector("style")) {
    const style = document.createElement("style");
    style.textContent = overlayCss;
    root.shadowRoot.prepend(style);
  }
  card.addEventListener("fnd-dismiss", dismissOverlay);
  card.addEventListener("fnd-open-details", (event) => {
    void openLatestReport(event.detail);
  });
  return card;
}

async function openLatestReport(summary) {
  try {
    if (summary) {
      await saveLatestSummary(summary);
    }
  } catch {
    /* storage is best-effort before opening the report */
  }
  chrome.runtime.sendMessage(
    makeMessage(MESSAGE_TYPES.openLatestReport, summary ? { summary } : null),
    () => {
      void chrome.runtime.lastError;
    }
  );
}

export function dismissOverlay() {
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    existing.remove();
  }
}

export function ensureOverlayRoot() {
  let host = document.getElementById(ROOT_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = ROOT_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = overlayCss;
    shadow.append(style);
    document.documentElement.append(host);
  }
  return host;
}
