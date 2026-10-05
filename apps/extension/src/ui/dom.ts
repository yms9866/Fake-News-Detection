export function el(tag, text = "", className = "") {
  const node = document.createElement(tag);
  if (text) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
}

export function div(className = "") {
  return el("div", "", className);
}

export function button(label, handler, className = "") {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = label;
  if (className) {
    node.className = className;
  }
  if (handler) {
    node.addEventListener("click", handler);
  }
  return node;
}

export function svgIcon(path, size = 18) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const node = document.createElementNS("http://www.w3.org/2000/svg", "path");
  node.setAttribute("d", path);
  svg.append(node);
  return svg;
}

export const ICONS = {
  selection: "M4 6h10M4 12h16M4 18h8",
  article: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  page: "M7 3h7l5 5v13H7zM14 3v5h5",
  camera: "M4 8h3l2-2h6l2 2h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a7.7 7.7 0 0 0 .1-6l2-1.2-2-3.4-2.3.7a7.8 7.8 0 0 0-5.2-3L11.4 1h-4l-.6 2.1A7.8 7.8 0 0 0 1.6 6.3L.3 8.6l2 3.4 2-.6a7.7 7.7 0 0 0 .1 6l-2 1.2 2 3.4 2.3-.7a7.8 7.8 0 0 0 5.2 3l.6 2.1h4l.6-2.1a7.8 7.8 0 0 0 5.2-3l2.3.7 2-3.4z",
  report: "M7 3h8l4 4v14H7zM11 11h6M11 15h6M11 19h4",
  close: "M6 6l12 12M18 6L6 18",
  shield: "M12 3l8 3v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6z"
};
