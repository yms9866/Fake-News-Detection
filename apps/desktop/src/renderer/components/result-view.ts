import { button, div, el } from "./dom.js";
import { sanitizeEvidenceUrl, textOnly } from "./safe-content.js";

export function renderResultView(result, bridge) {
  const wrapper = div("result-view");
  if (!result) {
    wrapper.append(el("p", "No result selected.", "muted"));
    return wrapper;
  }

  const header = div("result-header");
  header.append(el("h2", textOnly(result.final_verdict, "UNVERIFIED")));
  header.append(el("p", textOnly(result.reason), "muted"));
  wrapper.append(header);

  const meta = div("result-meta");
  meta.append(el("span", `Confidence: ${textOnly(result.confidence, "LOW")}`));
  meta.append(el("span", `Style: ${textOnly(result.style_signal, "UNKNOWN")}`));
  meta.append(el("span", `Request: ${textOnly(result.request_id, "n/a")}`));
  wrapper.append(meta);

  if (Array.isArray(result.warnings) && result.warnings.length > 0) {
    const list = el("ul", null, "warnings");
    for (const warning of result.warnings) {
      list.append(el("li", textOnly(warning)));
    }
    wrapper.append(el("h3", "Warnings"), list);
  }

  wrapper.append(renderEvidence(result.verification, bridge));
  return wrapper;
}

export function renderEvidence(verification, bridge) {
  const section = div("evidence");
  section.append(el("h3", "Evidence"));
  if (!verification || !Array.isArray(verification.evidence) || verification.evidence.length === 0) {
    section.append(el("p", "No evidence was returned for this analysis.", "muted"));
    return section;
  }

  const list = el("ul", null, "evidence-list");
  for (const item of verification.evidence) {
    const row = el("li");
    const safeUrl = sanitizeEvidenceUrl(item.url);
    row.append(el("strong", textOnly(item.title, "Untitled source")));
    row.append(el("span", ` ${textOnly(item.stance, "unknown")} / ${textOnly(item.reliability, "LOW")}`, "muted"));
    if (safeUrl) {
      row.append(button("Open", () => bridge.external.open(safeUrl), "link-button"));
    }
    list.append(row);
  }
  section.append(list);
  return section;
}
