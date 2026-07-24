import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const mainSource = await readFile(new URL("../../electron/main/main.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../../electron/preload/preload.ts", import.meta.url), "utf8");
const bridgeContractsSource = await readFile(new URL("../../electron/preload/bridge-contracts.ts", import.meta.url), "utf8");
const packageSource = await readFile(new URL("../../package.json", import.meta.url), "utf8");
const devScriptSource = await readFile(new URL("../../scripts/dev.mjs", import.meta.url), "utf8");

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
  assert.match(preloadSource, /require\("electron"\)/u);
  assert.equal(preloadSource.includes("exposeInMainWorld(\"ipcRenderer\""), false);
  assert.equal(preloadSource.includes("ipcRenderer:"), false);
  assert.equal(preloadSource.includes("runtime-validation"), false);
  assert.match(bridgeContractsSource, /desktopApi:\s*DesktopBridge/u);
});

test("main process registers allowlisted IPC handlers", () => {
  assert.match(mainSource, /ALLOWED_IPC_CHANNELS/u);
  assert.match(mainSource, /validateIpcRequest/u);
});

test("desktop source avoids shell-backed process launches", () => {
  assert.equal(mainSource.includes("shell" + ": true"), false);
});

test("BrowserWindow uses the compiled preload path", () => {
  assert.match(mainSource, /resolvePreloadPath\(dirname\)/u);
  assert.match(mainSource, /\.\.\/preload\/preload\.cjs/u);
  assert.match(mainSource, /existsSync\(preloadPath\)/u);
  assert.match(mainSource, /DESKTOP_PRELOAD_MISSING/u);
});

test("package main points at the compiled Electron main output", () => {
  const parsed = JSON.parse(packageSource);
  assert.equal(parsed.main, "dist/electron/main/main.js");
});

test("Windows development command builds first and resolves local Electron", () => {
  assert.match(devScriptSource, /scripts\/build\.mjs/u);
  assert.match(devScriptSource, /electron\.exe/u);
  assert.match(devScriptSource, /electron.*cli\.js/u);
  assert.match(devScriptSource, /ELECTRON_BINARY/u);
  assert.equal(devScriptSource.includes("shell" + ": true"), false);
  assert.equal(devScriptSource.includes("electron.cmd"), false);
  assert.match(devScriptSource, /windowsHide:\s*false/u);
});

test("main process retains and shows the desktop window", () => {
  assert.match(mainSource, /let mainWindow = null/u);
  assert.match(mainSource, /mainWindow = new BrowserWindow/u);
  assert.match(mainSource, /mainWindow\.show\(\)/u);
  assert.match(mainSource, /mainWindow\.focus\(\)/u);
});
