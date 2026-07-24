import { button, checkbox, div, el, field, numberInput, textInput, textarea } from "../components/dom.js";

export function renderTextUrlScreen(appState, actions) {
  const screen = div("screen form-screen");
  screen.append(el("p", "Evidence-focused analysis", "eyebrow"));
  screen.append(el("h1", "Check a claim or article"));
  screen.append(el("p", "The final verdict comes from backend evidence policy. The writing-style signal is shown separately and is not factual proof.", "lede"));
  const text = textarea("");
  const url = textInput("");
  const deepCheck = checkbox(appState.settings.defaultDeepCheck);
  const maxLength = numberInput(appState.settings.defaultMaxLength);
  screen.append(
    field("Text", text),
    field("URL", url),
    field("Deep check", deepCheck),
    field("Max length", maxLength)
  );
  screen.append(
    button("Analyze text", () =>
      actions.analyzeText({
        text: text.value,
        deep_check: deepCheck.checked,
        max_length: Number(maxLength.value)
      })
    ),
    button("Analyze URL", () =>
      actions.analyzeUrl({
        url: url.value,
        deep_check: deepCheck.checked,
        max_length: Number(maxLength.value)
      })
    )
  );
  return screen;
}
