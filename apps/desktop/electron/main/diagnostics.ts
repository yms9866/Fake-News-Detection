export function collectDiagnostics({ appInfo = {}, backendStatus = {}, settings = {}, capture = {} } = {}) {
  return {
    app: {
      name: appInfo.name || "Fake News Desktop",
      version: appInfo.version || "0.5.0",
      platform: process.platform
    },
    backend: {
      state: backendStatus.state || "unknown",
      origin: backendStatus.origin || null,
      owned: Boolean(backendStatus.owned),
      pid: backendStatus.pid || null,
      ready: Boolean(backendStatus.ready),
      error: backendStatus.error || null
    },
    settings: {
      backendOrigin: settings.backendOrigin || "http://127.0.0.1:8000",
      requestTimeoutMs: settings.requestTimeoutMs || 60000,
      startupTimeoutMs: settings.startupTimeoutMs || 30000,
      pairingToken: settings.pairingToken ? "[configured]" : null
    },
    capture: {
      captureCount: capture.captureCount || 0,
      framePersisted: Boolean(capture.framePersisted)
    }
  };
}
