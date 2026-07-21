import assert from "node:assert/strict";
import { test } from "node:test";
import { collectDiagnostics } from "../../dist/electron/main/diagnostics.js";
import { SecureSettingsStore } from "../../dist/electron/main/secure-storage.js";
import { createRendererHistoryStore, createRendererSettingsStore } from "../../dist/src/renderer/stores/settings-store.js";

test("settings persistence stores loopback backend configuration", () => {
  const store = new SecureSettingsStore();
  const saved = store.saveSettings({ backendOrigin: "http://localhost:8000", pairingToken: "pair" });
  assert.equal(saved.backendOrigin, "http://localhost:8000");
  assert.equal(saved.pairingToken, "[configured]");
});

test("settings clear returns defaults", () => {
  const store = new SecureSettingsStore();
  store.saveSettings({ backendOrigin: "http://localhost:8000" });
  assert.equal(store.clear().backendOrigin, "http://127.0.0.1:8000");
});

test("diagnostics redact pairing credential", () => {
  const diagnostics = collectDiagnostics({ settings: { pairingToken: "secret", backendOrigin: "http://127.0.0.1:8000" } });
  assert.equal(diagnostics.settings.pairingToken, "[configured]");
});

test("renderer settings store unwraps bridge responses", async () => {
  const store = createRendererSettingsStore({
    settings: {
      get: async () => ({ ok: true, value: { backendOrigin: "http://127.0.0.1:8000" } }),
      save: async (payload) => ({ ok: true, value: payload }),
      clear: async () => ({ ok: true, value: {} })
    }
  });
  assert.equal((await store.get()).backendOrigin, "http://127.0.0.1:8000");
});

test("renderer history store can clear local client state", async () => {
  const store = createRendererHistoryStore({
    history: {
      list: async () => ({ ok: true, value: [{ analysisId: "a1" }] }),
      save: async () => ({ ok: true, value: [{ analysisId: "a2" }] }),
      clear: async () => ({ ok: true, value: [] })
    }
  });
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.clear()).length, 0);
});
