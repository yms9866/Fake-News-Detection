import { validateExternalUrl } from "../../src/shared/runtime-validation.js";

export function openExternalLink(shell, url) {
  const safeUrl = validateExternalUrl(url);
  if (!shell || typeof shell.openExternal !== "function") {
    return { opened: false, url: safeUrl };
  }
  shell.openExternal(safeUrl);
  return { opened: true, url: safeUrl };
}
