import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { compactHistoryItem } from "@fnd/analysis-view-model";
import { MobileApiClient, MobileApiError } from "../api/client";
import { normalizeApiUrl, resolveApiUrl } from "../config/api";
import { MobileRoute } from "../navigation/nav-items";
import { createHistoryStore } from "../stores/history-store";

export type MobileSettings = {
  settingsVersion: number;
  backendOrigin: string;
  defaultDeepCheck: boolean;
  defaultMaxLength: number;
  requestTimeoutMs: number;
};

export type ConnectionState = {
  status: "unknown" | "checking" | "ready" | "error";
  label: string;
};

export type UiError = {
  code: string;
  message: string;
};

const SETTINGS_SCHEMA_VERSION = 2;
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_API_URL = resolveApiUrl({ platform: Platform.OS });

export function defaultSettings(): MobileSettings {
  return {
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    backendOrigin: DEFAULT_API_URL,
    defaultDeepCheck: true,
    defaultMaxLength: 512,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS
  };
}

function cleanOrigin(origin: string) {
  try {
    return normalizeApiUrl(origin || DEFAULT_API_URL);
  } catch {
    return DEFAULT_API_URL;
  }
}

function normalizeUiError(error: unknown): UiError {
  if (error instanceof MobileApiError) {
    return { code: error.code || "MOBILE_ERROR", message: error.message };
  }
  if (error instanceof Error) {
    return { code: "MOBILE_ERROR", message: error.message };
  }
  return { code: "MOBILE_ERROR", message: "Mobile operation failed." };
}

type WorkspaceContextValue = {
  route: MobileRoute;
  navigate: (route: MobileRoute) => void;
  settings: MobileSettings;
  saveSettings: (next: MobileSettings) => void;
  connection: ConnectionState;
  checkConnection: () => Promise<void>;
  loading: string | null;
  error: UiError | null;
  dismissError: () => void;
  result: Record<string, unknown> | null;
  job: Record<string, unknown> | null;
  live: Record<string, unknown> | null;
  diagnostics: Record<string, unknown> | null;
  historyList: Array<Record<string, unknown>>;
  client: MobileApiClient;
  actions: {
    analyzeText: (payload: { text: string; deep_check: boolean; max_length: number }) => Promise<void>;
    analyzeUrl: (payload: { url: string; deep_check: boolean; max_length: number }) => Promise<void>;
    uploadMedia: (
      mediaType: "image" | "audio" | "video",
      file: { uri: string; name: string; mimeType?: string; blob?: Blob },
      filename?: string
    ) => Promise<void>;
    cancelJob: () => Promise<void>;
    startLive: () => Promise<void>;
    submitLiveFrame: (payload: Record<string, unknown>) => Promise<void>;
    verifyLive: () => Promise<void>;
    openHistory: (item: { analysisId?: string }) => Promise<void>;
    diagnostics: () => Promise<void>;
  };
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<MobileRoute>("analyze");
  const [settings, setSettings] = useState<MobileSettings>(() => defaultSettings());
  const [connection, setConnection] = useState<ConnectionState>({
    status: "unknown",
    label: "Not checked"
  });
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [live, setLive] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const history = useMemo(() => createHistoryStore(), []);
  const [historyList, setHistoryList] = useState(history.list());

  const clientRef = useRef<MobileApiClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = new MobileApiClient({
      apiUrl: settings.backendOrigin,
      requestTimeoutMs: settings.requestTimeoutMs,
      analysisTimeoutMs: settings.requestTimeoutMs
    });
  }
  const client = clientRef.current;

  useEffect(() => {
    client.configure({
      backendOrigin: cleanOrigin(settings.backendOrigin),
      requestTimeoutMs: settings.requestTimeoutMs,
      analysisTimeoutMs: settings.requestTimeoutMs
    });
  }, [client, settings]);

  async function run(label: string, operation: () => Promise<void>) {
    setLoading(label);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(normalizeUiError(caught));
    } finally {
      setLoading(null);
    }
  }

  function rememberResult(next: Record<string, unknown>) {
    setResult(next);
    setHistoryList(history.add(compactHistoryItem(next)));
    setRoute("result");
  }

  const actions: WorkspaceContextValue["actions"] = {
    async analyzeText(payload) {
      await run("analyze", async () => {
        rememberResult(await client.analyzeText(payload));
      });
    },
    async analyzeUrl(payload) {
      await run("analyze", async () => {
        rememberResult(await client.analyzeUrl(payload));
      });
    },
    async uploadMedia(mediaType, file, filename) {
      await run("media", async () => {
        const accepted = await client.uploadMediaUri(
          mediaType,
          {
            uri: file.uri,
            name: filename || file.name,
            mimeType: file.mimeType
          },
          {
            deepCheck: settings.defaultDeepCheck,
            maxLength: settings.defaultMaxLength
          }
        );
        const finished = await client.waitForJob(String(accepted.job_id), {
          onProgress: (next) => setJob(next),
          timeoutMs: Math.max(180000, settings.requestTimeoutMs)
        });
        setJob(finished);
        if (finished.analysis_id) {
          rememberResult(await client.getAnalysis(String(finished.analysis_id)));
        }
      });
    },
    async cancelJob() {
      if (!job?.job_id) {
        return;
      }
      await run("cancel", async () => {
        setJob(await client.cancelJob(String(job.job_id)));
      });
    },
    async startLive() {
      await run("live", async () => {
        const session = await client.createLiveSession({
          source_type: "screen",
          source_id: "mobile-live",
          permission_granted: true
        });
        setLive(session);
      });
    },
    async submitLiveFrame(payload) {
      if (!live?.session_id) {
        throw new Error("Start a live session first.");
      }
      const next = await client.submitLiveFrame(String(live.session_id), payload);
      setLive((current) => ({ ...(current || {}), ...next }));
    },
    async verifyLive() {
      if (!live?.session_id) {
        setError({ code: "MOBILE_VALIDATION_ERROR", message: "Start a live session before verifying." });
        return;
      }
      const stableText = String(live.stable_text || "").trim();
      if (!stableText) {
        setError({
          code: "MOBILE_VALIDATION_ERROR",
          message: "No stable text yet. Submit OCR text frames until readable text appears."
        });
        return;
      }
      await run("verify", async () => {
        const next = await client.verifyLiveSession(String(live.session_id), {
          trigger: "user",
          force: true,
          deep_check: settings.defaultDeepCheck,
          max_length: settings.defaultMaxLength
        });
        setLive((current) => ({ ...(current || {}), ...next }));
        const latest = next.latest_verification as { analysis_id?: string } | null | undefined;
        if (!latest?.analysis_id) {
          throw new Error("Verification completed without an analysis result.");
        }
        rememberResult(await client.getAnalysis(String(latest.analysis_id)));
      });
    },
    async openHistory(item) {
      if (!item.analysisId) {
        return;
      }
      await run("history", async () => {
        rememberResult(await client.getAnalysis(String(item.analysisId)));
      });
    },
    async diagnostics() {
      await run("diagnostics", async () => {
        const [livePayload, readyPayload, models] = await Promise.all([
          client.live(),
          client.ready(),
          client.models()
        ]);
        setDiagnostics({
          live: livePayload,
          ready: readyPayload,
          models,
          backendOrigin: cleanOrigin(settings.backendOrigin),
          checkedAt: new Date().toISOString()
        });
        setRoute("diagnostics");
      });
    }
  };

  const value: WorkspaceContextValue = {
    route,
    navigate: setRoute,
    settings,
    saveSettings(next) {
      const normalized = {
        ...defaultSettings(),
        ...next,
        backendOrigin: cleanOrigin(next.backendOrigin),
        settingsVersion: SETTINGS_SCHEMA_VERSION
      };
      setSettings(normalized);
    },
    connection,
    async checkConnection() {
      setConnection({ status: "checking", label: "Checking…" });
      try {
        const payload = await client.getHealth();
        setConnection({
          status: "ready",
          label: payload && payload.status ? String(payload.status) : "Ready"
        });
      } catch (caught) {
        const safe = normalizeUiError(caught);
        setConnection({ status: "error", label: safe.message });
      }
    },
    loading,
    error,
    dismissError: () => setError(null),
    result,
    job,
    live,
    diagnostics,
    historyList,
    client,
    actions
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used within WorkspaceProvider.");
  }
  return value;
}
