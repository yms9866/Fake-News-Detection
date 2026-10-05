export type {
  AnalysisStatus,
  AnalysisResponse,
  JobResponse,
  JobStatusCode,
  Quality,
  ConfidenceLevel,
  InputTypeCode as AnalysisInputType,
  StyleSignal,
  MediaTypeCode as MediaType,
  ForensicSignalCode as ForensicSignal,
  LiveSourceTypeCode as LiveSourceType,
  LiveSessionStatusCode as LiveSessionStatus
} from "../../../../packages/contracts/typescript/api.ts";

export type ConnectionCredentials = {
  backendOrigin: string;
  pairingToken?: string;
};

export type ExtensionSettings = ConnectionCredentials & {
  settingsVersion?: number;
  defaultDeepCheck: boolean;
  defaultMaxLength: number;
  requestTimeoutMs: number;
  showOverlayAutomatically: boolean;
  storeLatestAnalysisReference: boolean;
};
