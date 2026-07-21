import { validateSettings } from "../../src/shared/runtime-validation.js";

export const DEFAULT_DESKTOP_SETTINGS = Object.freeze({
  backendOrigin: "http://127.0.0.1:8000",
  defaultDeepCheck: false,
  defaultMaxLength: 512,
  startupTimeoutMs: 30000,
  requestTimeoutMs: 15000,
  pairingToken: null
});

export class SecureSettingsStore {
  constructor(options = {}) {
    this.storage = options.storage || new Map();
    this.key = options.key || "desktop-settings";
  }

  getSettings() {
    const stored = this.storage.get(this.key);
    if (!stored) {
      return { ...DEFAULT_DESKTOP_SETTINGS };
    }
    return { ...DEFAULT_DESKTOP_SETTINGS, ...JSON.parse(stored) };
  }

  saveSettings(payload) {
    const settings = validateSettings({ ...DEFAULT_DESKTOP_SETTINGS, ...payload });
    this.storage.set(this.key, JSON.stringify(settings));
    return this.redacted(settings);
  }

  clear() {
    this.storage.delete(this.key);
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }

  redacted(settings = this.getSettings()) {
    return {
      ...settings,
      pairingToken: settings.pairingToken ? "[configured]" : null
    };
  }
}
