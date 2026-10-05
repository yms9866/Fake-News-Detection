import { FndApiClient, FndApiError } from "@fnd/client-sdk";
import { normalizeApiUrl, resolveApiUrl } from "../config/api";

export const MOBILE_API_CLIENT_ERROR_CODES = {
  BACKEND_ERROR: "FND_BACKEND_ERROR",
  NETWORK_UNREACHABLE: "FND_CORS_OR_NETWORK_FAILURE",
  REQUEST_TIMEOUT: "FND_REQUEST_TIMEOUT"
};

export const MobileApiError = FndApiError;

export class MobileApiClient extends FndApiClient {
  constructor(settings: Record<string, unknown> = {}) {
    const configuredUrl = String(settings.apiUrl || settings.backendOrigin || "");
    const origin = configuredUrl
      ? normalizeApiUrl(configuredUrl)
      : resolveApiUrl({
          env: settings.env as Record<string, string> | undefined,
          platform: settings.platform as string | undefined
        });
    super({
      backendOrigin: origin,
      originPolicy: "any",
      requestTimeoutMs: Number(settings.timeoutMs || settings.requestTimeoutMs || 15000),
      analysisTimeoutMs: Number(settings.analysisTimeoutMs || 120000),
      fetchImpl: (settings.fetchImpl as typeof fetch | undefined) || fetch.bind(globalThis)
    });
  }

  getHealth() {
    return this.live();
  }

  uploadMediaUri(
    mediaType: "image" | "audio" | "video",
    file: { uri: string; name: string; mimeType?: string },
    options: { deepCheck?: boolean; maxLength?: number; idempotencyKey?: string } = {}
  ) {
    const form = new FormData();
    form.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || `${mediaType}/*`
    } as unknown as Blob);
    form.append("deep_check", String(Boolean(options.deepCheck)));
    form.append("max_length", String(options.maxLength || 512));
    return this.requestJson(`/v1/analyses/${mediaType}`, {
      method: "POST",
      body: form,
      headers: options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {},
      timeoutMs: this.analysisTimeoutMs
    });
  }
}
