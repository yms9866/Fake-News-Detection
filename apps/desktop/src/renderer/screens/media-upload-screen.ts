import { button, checkbox, div, el, field, numberInput } from "../components/dom.js";

export function renderMediaUploadScreen(appState, actions) {
  const screen = div("screen form-screen");
  screen.append(el("h1", "Media Upload"));
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,audio/*,video/*";
  const deepCheck = checkbox(appState.settings.defaultDeepCheck);
  const maxLength = numberInput(appState.settings.defaultMaxLength);
  screen.append(field("File", input), field("Deep check", deepCheck), field("Max length", maxLength));
  screen.append(
    button("Upload and analyze", () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      actions.uploadMedia(file, {
        deepCheck: deepCheck.checked,
        maxLength: Number(maxLength.value)
      });
    })
  );
  return screen;
}
