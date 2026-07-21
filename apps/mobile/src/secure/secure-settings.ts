export function createSecureSettingsStore(storage = new Map()) {
  const key = "mobile-secure-settings";
  return {
    save(settings) {
      storage.set(key, JSON.stringify(settings));
      return { ...settings, authToken: settings.authToken ? "[configured]" : null };
    },
    get() {
      const raw = storage.get(key);
      return raw ? JSON.parse(raw) : {};
    },
    clear() {
      storage.delete(key);
    }
  };
}
