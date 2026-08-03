export function createPkceChallenge(seed = cryptoRandom()) {
  const verifier = `dev-${seed}`.replace(/[^a-zA-Z0-9._~-]/gu, "");
  const challenge = btoa(verifier).replace(/=+$/u, "");
  return { verifier, challenge, method: "plain-dev" };
}

export function createDevAuthAdapter(clock = () => Date.now()) {
  let session = null;
  return {
    async signIn(username = "local-user") {
      const pkce = createPkceChallenge(username);
      session = {
        user: { id: username, name: username, roles: ["user"] },
        pkce,
        expiresAt: clock() + 60 * 60 * 1000
      };
      return session;
    },
    getSession() {
      if (!session || session.expiresAt <= clock()) {
        session = null;
      }
      return session;
    },
    requireRole(role) {
      const current = this.getSession();
      return Boolean(current && current.user.roles.includes(role));
    },
    signOut() {
      session = null;
    }
  };
}

export function createBackendAuthAdapter(client, clock = () => Date.now()) {
  let session = null;
  return {
    async signIn(username = "local-reviewer") {
      const response = await client.signIn({
        username,
        tenant_id: "local",
        client_type: "web"
      });
      session = normalizeSession(response, clock);
      return session;
    },
    async restore() {
      const response = await client.restoreSession();
      session = normalizeSession(response, clock);
      return session;
    },
    getSession() {
      if (!session || session.expiresAt <= clock()) {
        session = null;
      }
      return session;
    },
    requireRole(role) {
      const current = this.getSession();
      return Boolean(current && current.user.roles.includes(role));
    },
    async signOut() {
      if (session) {
        await client.signOut();
      }
      session = null;
    }
  };
}

function normalizeSession(response, clock) {
  if (!response || !response.authenticated || !response.user) {
    return null;
  }
  const expiresAt = response.expires_at ? Date.parse(response.expires_at) : clock();
  return {
    user: {
      id: response.user.user_id,
      name: response.user.user_id,
      roles: response.user.roles || []
    },
    expiresAt
  };
}

function cryptoRandom() {
  if (globalThis.crypto && crypto.getRandomValues) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return String(Date.now());
}
