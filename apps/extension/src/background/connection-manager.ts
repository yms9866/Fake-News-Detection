import { createApiClient } from "../shared/api-client.js";
import { EXTENSION_ERROR_CODES, ExtensionError } from "../shared/errors.js";
import { getSettings } from "../shared/storage.js";

export async function getConfiguredClient() {
  const settings = await getSettings();
  return {
    settings,
    client: createApiClient(settings)
  };
}

export async function testConnection() {
  const { client } = await getConfiguredClient();
  const live = await client.live();
  const ready = await client.ready();
  const models = await client.models();
  if (!live || live.status !== "live") {
    throw new ExtensionError(
      EXTENSION_ERROR_CODES.backendUnavailable,
      "Backend liveness check failed."
    );
  }
  return { ok: true, live, ready, models };
}

