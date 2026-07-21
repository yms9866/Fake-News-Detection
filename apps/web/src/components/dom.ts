export function el(tagName, text, className) {
  const node = document.createElement(tagName);
  if (text !== undefined && text !== null) {
    node.textContent = String(text);
  }
  if (className) {
    node.className = className;
  }
  return node;
}

export function div(className) {
  return el("div", null, className);
}

export function button(label, onClick, className = "button") {
  const node = el("button", label, className);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

export function field(label, control) {
  const wrapper = div("field");
  const labelNode = el("label", label);
  const id = control.id || label.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
  control.id = id;
  labelNode.setAttribute("for", id);
  wrapper.append(labelNode, control);
  return wrapper;
}

export function input(type = "text", value = "") {
  const node = document.createElement("input");
  node.type = type;
  node.value = value;
  return node;
}

export function textarea(value = "") {
  const node = document.createElement("textarea");
  node.value = value;
  return node;
}
