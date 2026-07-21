import { renderResultOverlay } from "./result-overlay.js";
import overlayCss from "./overlay-css.js";

const ROOT_ID = "fnd-analysis-overlay-root";

export function showOverlay(summary) {
  const root = ensureOverlayRoot();
  const card = renderResultOverlay(root.shadowRoot, summary);
  card.addEventListener("fnd-dismiss", dismissOverlay);
  return card;
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
