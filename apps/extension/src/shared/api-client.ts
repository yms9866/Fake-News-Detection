import { FndApiClient, FndApiClientSettings } from "@fnd/client-sdk";
import { DEFAULT_BACKEND_ORIGIN, DEFAULT_TIMEOUT_MS } from "./constants.js";

export class ApiClient extends FndApiClient {
  credentials: FndApiClientSettings;

  constructor(credentials: FndApiClientSettings = {}) {
    const timeoutMs = credentials.requestTimeoutMs || credentials.timeoutMs || DEFAULT_TIMEOUT_MS;
    super({
      backendOrigin: credentials.backendOrigin || DEFAULT_BACKEND_ORIGIN,
      requestTimeoutMs: timeoutMs,
      analysisTimeoutMs: credentials.analysisTimeoutMs || timeoutMs,
      pairingToken: credentials.pairingToken || null,
      originPolicy: "loopback"
    });
    this.credentials = {
      ...credentials,
      backendOrigin: this.backendOrigin
    };
  }

  live() {
    return this.getJson("/v1/health/live", { retry: true });
  }

  ready() {
    return this.getJson("/v1/health/ready", { retry: true });
  }

  models() {
    return this.getJson("/v1/models", { retry: true });
  }

  getAnalysis(analysisId: string) {
    return this.getJson(`/v1/analyses/${encodeURIComponent(analysisId)}`, { retry: true });
  }

  getJob(jobId: string) {
    return this.getJson(`/v1/jobs/${encodeURIComponent(jobId)}`, { retry: true });
  }
}

export function createApiClient(settings?: FndApiClientSettings) {
  return new ApiClient(settings);
}
