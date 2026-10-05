import { MESSAGE_TYPES, makeMessage } from "../shared/messages.js";
import { getLatestSummary } from "../shared/storage.js";
import { div, el } from "../ui/dom.js";
import { stanceClass, stanceLabel } from "../ui/evidence.js";
import { fallbackStyleText, renderVerdictCard } from "../ui/summary.js";

const root = document.getElementById("root");
paintShell("Loading the latest analysis…");
void loadReport();

async function loadReport() {
  try {
    const storedSummary = await getLatestSummary();
    if (storedSummary) {
      renderReport(storedSummary);
      return;
    }
    const stored = await chrome.runtime.sendMessage(makeMessage(MESSAGE_TYPES.getAnalysisState));
    if (stored && stored.latest) {
      renderReport(stored.latest);
      return;
    }
    paintShell(
      (stored && stored.error && stored.error.message) ||
        "No completed analysis is available yet. Run one from the extension popup."
    );
  } catch (error) {
    paintShell(error && error.message ? String(error.message) : "The report could not be opened.");
  }
}

function paintShell(message) {
  root.replaceChildren();
  const shell = pageFrame();
  shell.append(el("p", message, "empty"));
  root.append(shell);
}

function pageFrame() {
  const shell = div("shell");
  const top = div("topbar");
  const brand = div("brand");
  brand.append(el("span", "FND", "brand-mark"));
  const titles = div();
  titles.append(el("h1", "Latest analysis"));
  titles.append(el("p", "Saved on this browser profile only", "subtitle"));
  brand.append(titles);
  top.append(brand);
  shell.append(top);
  return shell;
}

function renderReport(summary) {
  const shell = pageFrame();
  try {
    shell.append(renderVerdictCard(summary || {}));

    if (summary.styleText || summary.styleSignal) {
      shell.append(section("Writing style"));
      shell.append(el("p", summary.styleText || fallbackStyleText(summary.styleSignal)));
      if (summary.styleConfidence) {
        shell.append(el("p", `Signal strength: ${summary.styleConfidence}`, "muted"));
      }
    }

    if (summary.reason) {
      shell.append(section("Why this verdict"));
      shell.append(el("p", summary.reason));
    }

    shell.append(renderSearch(summary.searchSummary, summary.verificationStatus));
    shell.append(renderSources(Array.isArray(summary.sources) ? summary.sources : []));
    shell.append(renderClaims(Array.isArray(summary.claims) ? summary.claims : []));
    shell.append(renderGemini(summary.geminiEvidence || null));
  } catch (error) {
    shell.append(
      el("p", error && error.message ? String(error.message) : "The report could not be rendered.", "warning-line")
    );
  }
  root.replaceChildren(shell);
}

function renderSearch(searchSummary, verificationStatus) {
  const wrap = div("form-card");
  wrap.append(section("Gemini Google Search"));
  if (!searchSummary) {
    wrap.append(
      el(
        "p",
        verificationStatus === "not_run"
          ? "Google Search grounding was not run for this analysis."
          : "No search summary was saved for this analysis.",
        "muted"
      )
    );
    return wrap;
  }
  wrap.append(el("p", searchSummary.scope || "Gemini searches the live public web with Google Search grounding."));
  wrap.append(
    el(
      "p",
      `${Number(searchSummary.totalQueries || searchSummary.total_queries || 0)} searches, ${Number(searchSummary.totalResults || searchSummary.total_results || 0)} grounded results, ${Number(searchSummary.reviewedSourceCount || searchSummary.reviewed_source_count || 0)} cited sources`,
      "muted"
    )
  );
  const queries = Array.isArray(searchSummary.queries) ? searchSummary.queries : [];
  if (queries.length) {
    const list = document.createElement("ul");
    list.className = "query-list";
    for (const item of queries) {
      const query = typeof item === "string" ? item : item && item.query;
      if (!query) {
        continue;
      }
      list.append(el("li", query));
    }
    wrap.append(list);
  }
  if (Array.isArray(searchSummary.limitations) && searchSummary.limitations.length) {
    wrap.append(el("p", searchSummary.limitations.join(" "), "muted"));
  }
  return wrap;
}

function renderSources(sources) {
  const wrap = div("form-card");
  wrap.append(section("Reviewed sources"));
  if (!sources.length) {
    wrap.append(el("p", "No structured source records were returned.", "muted"));
    return wrap;
  }
  const grouped = new Map();
  for (const source of sources) {
    if (!source || typeof source !== "object") {
      continue;
    }
    const stance = source.stance || "UNKNOWN";
    if (!grouped.has(stance)) {
      grouped.set(stance, []);
    }
    grouped.get(stance).push(source);
  }
  for (const [stance, items] of grouped) {
    wrap.append(el("h3", `${items.length} ${stanceLabel(stance).toLowerCase()}`, "source-group"));
    for (const source of items) {
      wrap.append(renderSource(source));
    }
  }
  return wrap;
}

function renderSource(source) {
  const card = div(`source-row stance-${stanceClass(source.stance)}`);
  const heading = div("source-heading");
  heading.append(el("strong", source.title || source.domain || "Untitled source"));
  heading.append(el("span", stanceLabel(source.stance), `chip stance-${stanceClass(source.stance)}`));
  card.append(heading);
  const meta = [source.publisher, source.domain, source.reliability ? `${source.reliability} reliability` : ""]
    .filter(Boolean)
    .join(" · ");
  if (meta) {
    card.append(el("p", meta, "muted"));
  }
  if (source.explanation) {
    card.append(el("p", source.explanation, "muted"));
  }
  if (source.url) {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "source-link";
    link.textContent = "Open source";
    card.append(link);
  } else {
    card.append(el("p", "No safe source link available.", "muted"));
  }
  return card;
}

function renderClaims(claims) {
  const wrap = div("form-card");
  wrap.append(section("Claims checked"));
  if (!claims.length) {
    wrap.append(el("p", "No atomic factual claims were checked for this analysis.", "muted"));
    return wrap;
  }
  for (const claim of claims) {
    if (!claim || typeof claim !== "object") {
      continue;
    }
    const card = div("source-row");
    card.append(el("p", `Claim ${claim.sequence || ""}`, "muted"));
    card.append(el("strong", claim.claimText || "Untitled claim"));
    const chips = div("chip-row");
    chips.append(el("span", claim.status || "INSUFFICIENT_EVIDENCE", "chip"));
    chips.append(el("span", `${claim.confidence || "LOW"} confidence`, "chip"));
    card.append(chips);
    if (claim.explanation) {
      card.append(el("p", claim.explanation, "muted"));
    }
    wrap.append(card);
  }
  return wrap;
}

function renderGemini(evidence) {
  const wrap = div("form-card");
  wrap.append(section("Gemini evidence analysis"));
  if (!evidence) {
    wrap.append(el("p", "Evidence verification was not performed for this analysis.", "muted"));
    return wrap;
  }
  wrap.append(el("p", `${evidence.assessment || "UNVERIFIED"} — ${evidence.confidence || "LOW"} confidence`));
  wrap.append(el("p", `Evidence quality: ${evidence.evidenceQuality || "LOW"}`, "muted"));
  if (evidence.explanation) {
    wrap.append(el("p", evidence.explanation));
  }
  wrap.append(
    el(
      "p",
      evidence.groundingUsed
        ? "Grounded in reviewed source passages."
        : "No reviewed source grounding was available.",
      "muted"
    )
  );
  if (evidence.error) {
    wrap.append(el("p", evidence.error, "warning-line"));
  }
  return wrap;
}

function section(title) {
  return el("div", title, "section-title");
}
