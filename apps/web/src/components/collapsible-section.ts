import { div, el, button } from "./dom.js";

export function renderCollapsibleSection(title, content, collapsed = true) {
  const section = div("collapsible-section");
  const isCollapsed = collapsed;
  
  const header = div("collapsible-header");
  const titleEl = el("h3", title);
  const toggle = button(isCollapsed ? "Show details" : "Hide details", () => {
    section.classList.toggle("collapsed");
    toggle.textContent = section.classList.contains("collapsed") ? "Show details" : "Hide details";
  }, "toggle-button");
  
  header.append(titleEl, toggle);
  section.append(header);
  
  const contentWrapper = div("collapsible-content");
  contentWrapper.className = isCollapsed ? "collapsible-content collapsed" : "collapsible-content";
  contentWrapper.append(content);
  section.append(contentWrapper);
  
  return section;
}
