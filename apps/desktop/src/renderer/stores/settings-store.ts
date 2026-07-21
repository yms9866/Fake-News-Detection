export function createRendererSettingsStore(bridge) {
  return {
    async get() {
      const response = await bridge.settings.get();
      return unwrapBridge(response);
    },
    async save(settings) {
      const response = await bridge.settings.save(settings);
      return unwrapBridge(response);
    },
    async clear() {
      const response = await bridge.settings.clear();
      return unwrapBridge(response);
    }
  };
}

export function createRendererHistoryStore(bridge) {
  return {
    async list() {
      const response = await bridge.history.list();
      return unwrapBridge(response);
    },
    async save(item) {
      const response = await bridge.history.save(item);
      return unwrapBridge(response);
    },
    async clear() {
      const response = await bridge.history.clear();
      return unwrapBridge(response);
    }
  };
}

export function unwrapBridge(response) {
  if (response && response.ok) {
    return response.value;
  }
  const error = response && response.error ? response.error : {};
  const err = new Error(error.message || "Desktop bridge operation failed.");
  err.code = error.code || "DESKTOP_BRIDGE_ERROR";
  throw err;
}
