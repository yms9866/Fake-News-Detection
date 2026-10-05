import { textOnly } from "./safe-content.js";
import { button, div, el } from "./dom.js";

export function renderBrandMark(collapsed = false) {
  const container = div("brand-container");
  container.append(el("div", "✦", "brand-icon"));
  if (!collapsed) {
    container.append(el("span", "VERITAS AI", "brand-title"));
    container.append(el("span", "LOCAL", "brand-badge"));
  }
  return container;
}

export function renderCollapseToggle(collapsed: boolean, onToggle: () => void) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "collapse-toggle";
  node.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  node.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  node.textContent = collapsed ? "»" : "«";
  node.addEventListener("click", onToggle);
  return node;
}

export function renderThemeToggle(theme: "light" | "dark", onToggle: () => void) {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "theme-toggle";
  node.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  node.title = theme === "dark" ? "Light mode" : "Dark mode";
  node.textContent = theme === "dark" ? "☀" : "☾";
  node.addEventListener("click", onToggle);
  return node;
}

export function renderConnectionStatus(
  status: { state?: string; ready?: boolean },
  retryAction: () => void
) {
  const connection = describeBackendConnection(status || {});
  const node = div(`connection-status ${connection.statusClass}`);
  node.setAttribute("aria-live", "polite");
  node.append(div("status-dot"));
  node.append(el("strong", connection.shortLabel));
  if (connection.statusClass !== "ready") {
    node.append(
      button("Check connection", retryAction, "button compact")
    );
  }
  return node;
}

export function describeBackendConnection(status: { state?: string; ready?: boolean }) {
  const state = String(status.state || "unknown").toLowerCase();
  const ready = Boolean(status.ready);
  const connected =
    state === "connected-existing" ||
    state === "running-owned" ||
    state === "running" ||
    state === "ready";

  if (connected && ready) {
    return {
      className: "online",
      statusClass: "ready",
      label: "Backend ready",
      shortLabel: "Ready"
    };
  }
  if (connected) {
    return {
      className: "starting",
      statusClass: "checking",
      label: "Backend live",
      shortLabel: "Live"
    };
  }
  if (state === "starting") {
    return {
      className: "starting",
      statusClass: "checking",
      label: "Starting backend",
      shortLabel: "Checking"
    };
  }
  if (state === "stopping") {
    return {
      className: "starting",
      statusClass: "checking",
      label: "Stopping backend",
      shortLabel: "Checking"
    };
  }
  return {
    className: "offline",
    statusClass: "unavailable",
    label: "Backend offline",
    shortLabel: "Offline"
  };
}

/** @deprecated Prefer renderConnectionStatus in the top header. */
export function renderConnectionPill(backendStatus: { state?: string; ready?: boolean } | string) {
  const status =
    typeof backendStatus === "string"
      ? { state: backendStatus, ready: false }
      : backendStatus || { state: "unknown", ready: false };
  const connection = describeBackendConnection(status);
  const pill = div(`connection-pill ${connection.className}`);
  pill.append(el("span", "●", "connection-dot"));
  pill.append(el("span", connection.label));
  return pill;
}

export function renderScreenHeader(options: {
  eyebrow?: string;
  title: string;
  lede?: string;
}) {
  const header = div("screen-header");
  if (options.eyebrow) {
    header.append(el("p", options.eyebrow, "eyebrow"));
  }
  header.append(el("h1", options.title));
  if (options.lede) {
    header.append(el("p", options.lede, "lede"));
  }
  return header;
}

export function renderPanel(children: Array<HTMLElement | null | undefined> = []) {
  const panel = div("panel");
  for (const child of children) {
    if (child) {
      panel.append(child);
    }
  }
  return panel;
}

export function renderEmptyState(title: string, message: string) {
  const empty = div("empty-state");
  empty.append(el("h2", title));
  empty.append(el("p", message, "muted"));
  return empty;
}

export function renderVerdictBanner(result: Record<string, unknown> | null) {
  const banner = div(`verdict-banner ${verdictClass(result)}`);
  const verdict = textOnly(result && result.final_verdict, "UNVERIFIED");
  const confidence = textOnly(result && result.confidence, "LOW");
  const reason = textOnly(result && result.reason, "No reason returned.");

  const headerRow = div("verdict-header-row");
  const badge = div("verdict-status-badge");
  badge.append(el("span", verdictSymbol(verdict), "verdict-glyph"));
  badge.append(el("span", verdict));
  headerRow.append(badge);

  const meter = div("confidence-meter-container");
  meter.append(el("span", "Confidence", "meter-label"));
  const track = div("confidence-meter-track");
  const fill = div("confidence-meter-fill");
  fill.style.width = `${confidencePercent(confidence)}%`;
  track.append(fill);
  meter.append(track);
  meter.append(el("span", confidence, "meter-value"));
  headerRow.append(meter);
  banner.append(headerRow);
  banner.append(el("p", reason, "verdict-reason"));
  return banner;
}

export function renderSegmentedControl<T extends string>(
  value: T,
  options: Array<{ value: T; label: string }>,
  onChange: (next: T) => void
) {
  const group = div("tabs");
  for (const option of options) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = option.value === value ? "tab-button active" : "tab-button";
    tab.textContent = option.label;
    tab.addEventListener("click", () => onChange(option.value));
    group.append(tab);
  }
  return group;
}

export function renderToggleRow(title: string, description: string, checked: boolean, onChange: (next: boolean) => void) {
  const row = div("toggle-row");
  const copy = div("toggle-copy");
  copy.append(el("strong", title));
  copy.append(el("p", description, "muted"));
  row.append(copy);

  const toggle = document.createElement("label");
  toggle.className = "toggle-switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const slider = el("span", null, "toggle-slider");
  toggle.append(input, slider);
  row.append(toggle);
  return row;
}

function verdictClass(result: Record<string, unknown> | null) {
  const verdict = textOnly(result && result.final_verdict, "UNVERIFIED").toUpperCase();
  if (verdict.includes("REAL") || verdict.includes("TRUE") || verdict.includes("AUTHENTIC")) {
    return "verdict-real";
  }
  if (verdict.includes("FAKE") || verdict.includes("FALSE") || verdict.includes("MISLEADING")) {
    return "verdict-fake";
  }
  return "verdict-uncertain";
}

function verdictSymbol(verdict: string) {
  const upper = verdict.toUpperCase();
  if (upper.includes("REAL") || upper.includes("TRUE") || upper.includes("AUTHENTIC")) {
    return "✓";
  }
  if (upper.includes("FAKE") || upper.includes("FALSE") || upper.includes("MISLEADING")) {
    return "!";
  }
  return "?";
}

function confidencePercent(confidence: string) {
  const upper = confidence.toUpperCase();
  if (upper.includes("HIGH")) {
    return 92;
  }
  if (upper.includes("MEDIUM")) {
    return 68;
  }
  if (upper.includes("LOW")) {
    return 35;
  }
  const numeric = Number(confidence);
  if (!Number.isNaN(numeric) && confidence.trim() !== "") {
    return Math.max(8, Math.min(Math.round(numeric * 100), 100));
  }
  return 50;
}
