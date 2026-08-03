export function createMobileAuthAdapter(storage, client) {
  return {
    async setToken(token, expiresAt) {
      storage.save({ authToken: token, expiresAt });
      if (client && typeof client.setAuthToken === "function") {
        client.setAuthToken(token);
      }
    },
    getToken(now = Date.now()) {
      const settings = storage.get();
      if (!settings.authToken || settings.expiresAt <= now) {
        return null;
      }
      return settings.authToken;
    },
    remoteLogout() {
      if (client && typeof client.signOut === "function") {
        return Promise.resolve(client.signOut())
          .catch(() => {
            // Local cleanup still matters when the backend cannot be reached.
          })
          .then(() => {
            storage.clear();
            if (client && typeof client.setAuthToken === "function") {
              client.setAuthToken("");
            }
            return { loggedOut: true };
          });
      }
      storage.clear();
      if (client && typeof client.setAuthToken === "function") {
        client.setAuthToken("");
      }
      return { loggedOut: true };
    },
    async signIn(username = "mobile-reviewer") {
      if (!client || typeof client.signIn !== "function") {
        throw new Error("Mobile API client is not configured for sign in.");
      }
      const session = await client.signIn({ username });
      if (session && session.access_token) {
        storage.save({
          authToken: session.access_token,
          expiresAt: session.expires_at ? Date.parse(session.expires_at) : Date.now()
        });
      }
      return session;
    }
  };
}
