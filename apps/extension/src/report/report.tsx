import { MESSAGE_TYPES, makeMessage } from "../shared/messages.js";

const root = document.getElementById("root");
render();

async function render() {
  const response = await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.getAnalysisState));
  root.replaceChildren();
  root.append(el("h1", "Latest analysis report"));
  if (!response.latest) {
    root.append(el("p", "No completed analysis is available yet.", "muted"));
    return;
  }
  const summary = response.latest;
  const card = div("result");
  card.append(
    metric("Analysis ID", summary.analysisId || ""),
    metric("Writing-style risk", summary.styleSignal || "UNKNOWN"),
    metric("Style scope", summary.styleScopeReliable ? "Reliable" : "Limited"),
    metric("Evidence verification", summary.verificationStatus || "not_run"),
    metric("Final decision", `${summary.finalVerdict || "UNVERIFIED"} (${summary.confidence || "LOW"})`),
    metric("Sources", String(summary.sourceCount || 0)),
    metric("Request ID", summary.requestId || ""),
    metric("Trace ID", summary.traceId || "")
  );
  if (summary.warnings && summary.warnings.length) {
    card.append(el("p", summary.warnings.join(" "), "muted"));
  }
  if (summary.reason) {
    card.append(el("p", summary.reason));
  }
  root.append(card);
}

function metric(label, value) {
  const p = document.createElement("p");
  p.append(el("strong", `${label}: `), document.createTextNode(value));
  return p;
}

function div(className) {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

function el(tag, text, className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) {
    node.className = className;
  }
  return node;
}

