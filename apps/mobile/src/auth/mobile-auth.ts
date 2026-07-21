export function createMobileAuthAdapter(storage) {
  return {
    async setToken(token, expiresAt) {
      storage.save({ authToken: token, expiresAt });
    },
    getToken(now = Date.now()) {
      const settings = storage.get();
      if (!settings.authToken || settings.expiresAt <= now) {
        return null;
      }
      return settings.authToken;
    },
    remoteLogout() {
      storage.clear();
      return { loggedOut: true };
    }
  };
}
