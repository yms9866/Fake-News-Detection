import { renderDesktopApp, renderDesktopInitializationError } from "./App.js";

const root = document.getElementById("root");
if (root) {
  try {
    renderDesktopApp(root);
  } catch (error) {
    console.error(error);
    renderDesktopInitializationError(root, error);
  }
}
