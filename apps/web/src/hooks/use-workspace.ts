import { useEffect, useMemo, useRef, useState } from "react";
import { createWebApiClient, WebApiClient } from "../api/client";
import { compactHistoryItem } from "../components/safe-rendering";
import { createHistoryStore } from "../stores/history-store";
import {
  recordMicrophoneToFile,
  requestCameraImage,
  requestDisplayCapture,
  requestMicrophone,
  snapshotStreamToFile,
  stopStream
} from "../capture/browser-capture";

export type WebSettings = {
  backendOrigin: string;
  defaultDeepCheck: boolean;
  defaultMaxLength: number;
  requestTimeoutMs: number;
};

const SETTINGS_KEY = "fnd.web.settings";

export function defaultSettings(): WebSettings {
  return {
    backendOrigin: "http://127.0.0.1:8000",
    defaultDeepCheck: true,
    defaultMaxLength: 512,
    requestTimeoutMs: 60000
  };
}

export function loadSettings(): WebSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return { ...defaultSettings(), ...JSON.parse(raw) };
    }
  } catch {
    /* ignore */
  }
  return defaultSettings();
}

function normalizeUiError(error: unknown, origin: string) {
  const err = error as {
    code?: string;
    message?: string;
    status?: number;
    requestId?: string;
    traceId?: string;
    validationDetails?: unknown[];
    backendOrigin?: string;
    technicalDetails?: string;
  };
  return {
    code: err?.code || "WEB_ERROR",
    message: err?.message || "Web operation failed.",
    status: err?.status || 0,
    requestId: err?.requestId || null,
    traceId: err?.traceId || null,
    validationDetails: Array.isArray(err?.validationDetails) ? err.validationDetails : [],
    backendOrigin: err?.backendOrigin || origin,
    technicalDetails: err?.technicalDetails || ""
  };
}

export function useWorkspace() {
  const [settings, setSettings] = useState<WebSettings>(() => loadSettings());
  const clientRef = useRef<WebApiClient | null>(null);
  if (!clientRef.current) {
    clientRef.current = createWebApiClient(settings);
  }
  const client = clientRef.current;
  const history = useMemo(() => createHistoryStore(), []);

  const [route, setRoute] = useState("analyze");
  const [result, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [job, setJob] = useState<Record<string, unknown> | null>(null);
  const [live, setLive] = useState<Record<string, unknown> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [connection, setConnection] = useState({ status: "unknown", origin: settings.backendOrigin });
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<ReturnType<typeof normalizeUiError> | null>(null);
  const [lastRetry, setLastRetry] = useState<(() => void) | null>(null);
  const [historyList, setHistoryList] = useState(history.list());

  useEffect(() => {
    client.configure(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [client, settings]);

  async function run(label: string, operation: () => Promise<void>, retry = operation) {
    setLoading(label);
    setError(null);
    setLastRetry(() => () => {
      void run(label, retry, retry);
    });
    try {
      await operation();
    } catch (caught) {
      setError(normalizeUiError(caught, settings.backendOrigin));
    } finally {
      setLoading(null);
    }
  }

  async function performUpload(file: File) {
    const type = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "image";
    const accepted = await client.uploadMedia(type, file, {
      deepCheck: settings.defaultDeepCheck,
      maxLength: settings.defaultMaxLength,
      filename: file.name
    });
    const finished = await client.waitForJob(accepted.job_id, { onProgress: setJob });
    setJob(finished);
    if (finished.analysis_id) {
      const next = await client.getAnalysis(String(finished.analysis_id));
      setAnalysisResult(next);
      setHistoryList(history.add(compactHistoryItem(next)));
      setRoute("result");
    }
  }

  const actions = {
    navigate(newRoute: string) {
      setRoute(newRoute);
    },
    saveSettings(next: WebSettings) {
      setSettings(next);
      client.configure(next);
    },
    async checkConnection() {
      setConnection({ status: "checking", origin: settings.backendOrigin });
      await run("connection", async () => {
        await client.live();
        setConnection({ status: "ready", origin: settings.backendOrigin });
      });
    },
    async analyzeText(payload: { text: string; deep_check: boolean; max_length: number }) {
      await run("analyze", async () => {
        const next = await client.analyzeText(payload);
        setAnalysisResult(next);
        setHistoryList(history.add(compactHistoryItem(next)));
        setRoute("result");
      });
    },
    async analyzeUrl(payload: { url: string; deep_check: boolean; max_length: number }) {
      await run("analyze", async () => {
        const next = await client.analyzeUrl(payload);
        setAnalysisResult(next);
        setHistoryList(history.add(compactHistoryItem(next)));
        setRoute("result");
      });
    },
    async uploadMedia(file: File) {
      await run("media", () => performUpload(file));
    },
    async cancelJob() {
      if (!job?.job_id) return;
      await run("cancel", async () => {
        setJob(await client.cancelJob(String(job.job_id)));
      });
    },
    async capture(kind: "display" | "camera" | "microphone") {
      await run("capture", async () => {
        let stream: MediaStream | null = null;
        try {
          if (kind === "microphone") {
            stream = await requestMicrophone();
            await performUpload(await recordMicrophoneToFile(stream));
            return;
          }
          stream = kind === "display" ? await requestDisplayCapture() : await requestCameraImage();
          await performUpload(await snapshotStreamToFile(stream, `${kind}.jpg`));
        } finally {
          stopStream(stream);
        }
      });
    },
    async startLive() {
      await run("live", async () => {
        const stream = await requestDisplayCapture();
        const session = await client.createLiveSession({
          source_type: "screen",
          source_id: "browser-display",
          permission_granted: true
        });
        setLive({ ...session, stream });
      });
    },
    async submitLiveFrame(payload: Record<string, unknown>) {
      if (!live?.session_id) {
        throw new Error("Start a live session first.");
      }
      const next = await client.submitLiveFrame(String(live.session_id), payload);
      setLive((current) => ({ ...current, ...next }));
    },
    async verifyLive() {
      if (!live?.session_id) return;
      await run("verify", async () => {
        const next = await client.verifyLiveSession(String(live.session_id), { trigger: "user", force: true });
        setLive(next);
        const analysisId = next.analysis_id || next.verification_analysis_id || next.latest_analysis_id;
        if (analysisId) {
          const analyzed = await client.getAnalysis(String(analysisId));
          setAnalysisResult(analyzed);
          setHistoryList(history.add(compactHistoryItem(analyzed)));
          setRoute("result");
        }
      });
    },
    async openHistory(item: { analysisId?: string }) {
      if (!item.analysisId) return;
      await run("history", async () => {
        const next = await client.getAnalysis(item.analysisId as string);
        setAnalysisResult(next);
        setRoute("result");
      });
    },
    async diagnostics() {
      await run("diagnostics", async () => {
        const models = await client.models();
        setDiagnostics({
          live: await client.live(),
          ready: await client.ready(),
          models: models.models || models.items || models
        });
      });
    }
  };

  useEffect(() => {
    void actions.checkConnection();
  }, []);

  return {
    settings,
    route,
    result,
    job,
    live,
    diagnostics,
    connection,
    loading,
    error,
    lastRetry,
    historyList,
    actions,
    dismissError: () => setError(null)
  };
}
