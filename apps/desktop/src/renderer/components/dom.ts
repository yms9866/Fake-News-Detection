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
  wrapper.append(el("label", label), control);
  return wrapper;
}

export function textInput(value = "") {
  const input = document.createElement("input");
  input.value = value;
  return input;
}

export function textarea(value = "") {
  const input = document.createElement("textarea");
  input.value = value;
  return input;
}

export function checkbox(checked = false) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  return input;
}

export function numberInput(value = 512) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "128";
  input.max = "8192";
  input.step = "1";
  input.value = String(value);
  return input;
}
