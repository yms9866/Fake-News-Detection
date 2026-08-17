import { FndApiClient, FndApiClientSettings } from "@fnd/client-sdk";

export class ApiClient extends FndApiClient {
  credentials: FndApiClientSettings;

  constructor(credentials: FndApiClientSettings = {}) {
    super({
      backendOrigin: credentials.backendOrigin || "http://127.0.0.1:8000",
      requestTimeoutMs: credentials.requestTimeoutMs || 15000,
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
