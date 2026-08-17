import { FndApiClient, FndApiError, createFndApiClient } from "@fnd/client-sdk";

export const DesktopApiClient = FndApiClient;
export const DesktopApiError = FndApiError;
export const createDesktopApiClient = createFndApiClient;
export { FndApiClient, FndApiError, normalizeBackendOrigin, safeExternalUrl } from "@fnd/client-sdk";
