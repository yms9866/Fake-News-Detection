import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const mainSource = await readFile(new URL("../../electron/main/main.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../../electron/preload/preload.ts", import.meta.url), "utf8");

test("main window enables context isolation", () => {
  assert.match(mainSource, /contextIsolation:\s*true/u);
});

test("main window disables node integration", () => {
  assert.match(mainSource, /nodeIntegration:\s*false/u);
});

test("main window enables renderer sandbox", () => {
  assert.match(mainSource, /sandbox:\s*true/u);
});

test("preload exposes a named desktop bridge only", () => {
  assert.match(preloadSource, /exposeInMainWorld\("desktopApi"/u);
  assert.equal(preloadSource.includes("exposeInMainWorld(\"ipcRenderer\""), false);
});

test("main process registers allowlisted IPC handlers", () => {
  assert.match(mainSource, /ALLOWED_IPC_CHANNELS/u);
  assert.match(mainSource, /validateIpcRequest/u);
});

test("desktop source avoids shell-backed process launches", () => {
  assert.equal(mainSource.includes("shell" + ": true"), false);
});
