import { div, el, button } from "./dom.js";
import { evidenceLinkDescriptor, textOnly } from "./safe-rendering.js";

export function renderSourceChip(item, onClick) {
  const descriptor = evidenceLinkDescriptor(item);
  const chip = div("source-chip");
  
  // Stance dot
  const stanceDot = div("stance-dot");
  stanceDot.className = `stance-dot stance-${getStanceClass(descriptor.stance)}`;
  chip.append(stanceDot);
  
  // Domain/Icon
  const icon = div("source-icon");
  const firstLetter = (descriptor.domain || descriptor.publisher || "U").charAt(0).toUpperCase();
  icon.textContent = firstLetter;
  chip.append(icon);
  
  // Domain name
  const domain = el("span", descriptor.domain || descriptor.publisher || "Unknown", "source-domain");
  chip.append(domain);
  
  // Reliability dot
  const reliabilityDot = div("reliability-dot");
  reliabilityDot.className = `reliability-dot reliability-${getReliabilityClass(descriptor.reliability)}`;
  chip.append(reliabilityDot);
  
  // Click to expand
  chip.addEventListener("click", () => {
    if (onClick) onClick(item, descriptor);
  });
  chip.style.cursor = "pointer";
  
  return chip;
}

export function renderSourceDetail(item, descriptor) {
  const detail = div("source-detail panel");
  
  detail.append(el("h4", descriptor.title));
  detail.append(el("p", descriptor.publisher || descriptor.domain || "Unknown publisher", "muted"));
  
  // Stance
  const stanceBadge = div("badge");
  stanceBadge.textContent = stanceLabel(descriptor.stance);
  stanceBadge.className = `badge stance-badge stance-${getStanceClass(descriptor.stance)}`;
  detail.append(stanceBadge);
  
  // Source type
  const typeBadge = div("badge");
  typeBadge.textContent = sourceTypeLabel(descriptor.sourceType);
  detail.append(typeBadge);
  
  // Reliability with visual indicator
  const reliabilityWrapper = div("reliability-wrapper");
  const reliabilityDot = div("reliability-dot");
  reliabilityDot.className = `reliability-dot reliability-${getReliabilityClass(descriptor.reliability)}`;
  reliabilityWrapper.append(reliabilityDot);
  reliabilityWrapper.append(el("span", `${descriptor.reliability} reliability`, "muted"));
  detail.append(reliabilityWrapper);
  
  // Grounding note
  if (descriptor.fetched) {
    detail.append(el("p", "Gemini returned this via Google Search grounding", "muted"));
  }
  
  // Additional info
  if (item.fetch_message) {
    detail.append(el("p", textOnly(item.fetch_message), "muted"));
  }
  if (item.qualification_explanation) {
    detail.append(el("p", textOnly(item.qualification_explanation), "muted"));
  }
  
  // Link
  if (descriptor.url) {
    const link = el("a", "Open source", "button link-button");
    link.href = descriptor.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `Open ${descriptor.citationLabel}: ${descriptor.title}`);
    detail.append(link);
  } else {
    detail.append(el("p", "No safe source link available.", "muted"));
  }
  
  return detail;
}

function getStanceClass(stance) {
  if (stance === "SUPPORTS") return "supports";
  if (stance === "CONTRADICTS") return "contradicts";
  if (stance === "MENTIONS") return "mentions";
  return "unknown";
}

function getReliabilityClass(reliability) {
  const rel = (reliability || "").toUpperCase();
  if (rel.includes("HIGH")) return "high";
  if (rel.includes("MEDIUM")) return "medium";
  return "low";
}

function stanceLabel(stance) {
  if (stance === "SUPPORTS") return "Supports the claim";
  if (stance === "CONTRADICTS") return "Contradicts the claim";
  if (stance === "MENTIONS") return "Mentions the topic";
  return "Stance unknown";
}

function sourceTypeLabel(sourceType) {
  if (sourceType === "OFFICIAL") return "Official or primary source";
  if (sourceType === "REPUTABLE_NEWS" || sourceType === "FACT_CHECK") return "Secondary reporting";
  return `${sourceType || "UNKNOWN"} source`;
}
