import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Camera,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Eye,
  FileText,
  Globe,
  History,
  Mic,
  Monitor,
  Paperclip,
  Radio,
  RefreshCw,
  Settings,
  Sparkles,
  UploadCloud
} from "lucide-react";
import { ResultView } from "../components/result-view";
import { EmptyState } from "../components/status-panels";
import { frameHash, stopStream } from "../capture/browser-capture";

type Actions = {
  analyzeText: (payload: { text: string; deep_check: boolean; max_length: number }) => Promise<void>;
  analyzeUrl: (payload: { url: string; deep_check: boolean; max_length: number }) => Promise<void>;
  uploadMedia: (file: File) => Promise<void>;
  cancelJob: () => Promise<void>;
  capture: (kind: "display" | "camera" | "microphone") => Promise<void>;
  startLive: () => Promise<void>;
  submitLiveFrame: (payload: Record<string, unknown>) => Promise<void>;
  verifyLive: () => Promise<void>;
  openHistory: (item: { analysisId?: string }) => Promise<void>;
  diagnostics: () => Promise<void>;
  saveSettings: (settings: { backendOrigin: string; defaultDeepCheck: boolean; defaultMaxLength: number; requestTimeoutMs: number }) => void;
};

export function AnalyzeScreen({ actions, defaultSettings }: { actions: Actions; defaultSettings: { defaultDeepCheck: boolean; defaultMaxLength: number } }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [deepCheck, setDeepCheck] = useState(defaultSettings.defaultDeepCheck);
  const [maxLength, setMaxLength] = useState(String(defaultSettings.defaultMaxLength));

  return (
    <div className="screen">
      <div className="screen-header">
        <p className="eyebrow">Evidence-Focused AI Analysis</p>
        <h1>Verify any claim, article, or source</h1>
        <p className="lede">The final verdict is based on deterministic evidence policy. Writing style analysis is shown separately and never proves truth by itself.</p>
      </div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <label>
          <span>Article Text or Claim</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste article body, headline, or claim to analyze..." aria-label="Text to analyze" />
        </label>
        <label>
          <span>Source URL</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/news-article" aria-label="Source URL to analyze" />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          <label style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Deep Evidence Grounding</span>
              <p className="muted" style={{ fontSize: 12 }}>Search live web for independent source verification</p>
            </div>
            <input type="checkbox" checked={deepCheck} onChange={(e) => setDeepCheck(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent-primary)" }} />
          </label>
          <label>
            <span>Max Tokens / Length ({maxLength})</span>
            <input type="number" value={maxLength} min="128" max="8192" onChange={(e) => setMaxLength(e.target.value)} />
          </label>
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button className="button primary" onClick={() => actions.analyzeText({ text, deep_check: deepCheck, max_length: Number(maxLength) || defaultSettings.defaultMaxLength })}>
            <Sparkles size={16} /><span>Analyze text</span>
          </button>
          <button className="button" onClick={() => actions.analyzeUrl({ url, deep_check: deepCheck, max_length: Number(maxLength) || defaultSettings.defaultMaxLength })}>
            <Globe size={16} /><span>Analyze URL</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MediaScreen({ actions, job }: { actions: Actions; job: Record<string, unknown> | null }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <div className="screen">
      <div className="screen-header">
        <p className="eyebrow">Multimodal Verification</p>
        <h1>Media Analysis</h1>
        <p className="lede">Upload images, audio recordings, or video clips. The job is polled until a result is ready.</p>
      </div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ border: "2px dashed var(--border-medium)", borderRadius: "var(--radius-lg)", padding: 40, textAlign: "center" }}>
          <UploadCloud size={40} style={{ color: "var(--accent-primary)" }} />
          <p style={{ fontWeight: 600 }}>{file ? file.name : "Select a media file"}</p>
          <input type="file" accept="image/*,audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label="Upload media file" />
        </div>
        <div className="actions">
          <button className="button primary" disabled={!file} onClick={() => file && actions.uploadMedia(file)}>
            <Sparkles size={16} /><span>Analyze upload</span>
          </button>
        </div>
        {job && (
          <div className="panel">
            <p style={{ fontWeight: 600 }}>Job status: {String(job.status || "unknown")}</p>
            <p className="muted">{String(job.message || "Processing media pipeline...")}</p>
            <button className="button danger compact" onClick={actions.cancelJob}>Cancel job</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CaptureScreen({ actions }: { actions: Actions }) {
  return (
    <div className="screen">
      <div className="screen-header">
        <p className="eyebrow">Real-Time Input</p>
        <h1>Browser Capture</h1>
        <p className="lede">Capture a screen, camera still, or short microphone clip and send it through the media pipeline.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Monitor size={32} style={{ color: "var(--accent-primary)" }} />
          <h3>Display Capture</h3>
          <p className="muted">Take a still of a window or screen, then analyze it.</p>
          <button className="button primary" onClick={() => actions.capture("display")}>Capture display</button>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Camera size={32} style={{ color: "var(--accent-primary)" }} />
          <h3>Camera Image</h3>
          <p className="muted">Take a snapshot and run image analysis.</p>
          <button className="button primary" onClick={() => actions.capture("camera")}>Capture camera</button>
        </div>
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Mic size={32} style={{ color: "var(--accent-primary)" }} />
          <h3>Microphone Recording</h3>
          <p className="muted">Record about 8 seconds of audio, then transcribe and analyze.</p>
          <button className="button primary" onClick={() => actions.capture("microphone")}>Record mic</button>
        </div>
      </div>
    </div>
  );
}

export function LiveScreen({ actions, live }: { actions: Actions; live: Record<string, unknown> | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastHash = useRef("");

  useEffect(() => {
    const stream = live?.stream as MediaStream | undefined;
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
      void video.play();
    }
    return () => {
      if (!live) stopStream(stream || null);
    };
  }, [live]);

  const submitFrame = actions.submitLiveFrame;
  useEffect(() => {
    if (!live?.session_id || !live.stream) {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || cancelled || video.videoWidth === 0) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0);
      const hash = frameHash(canvas);
      if (hash === lastHash.current) return;
      lastHash.current = hash;
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng");
        const recognized = await worker.recognize(canvas);
        await worker.terminate();
        const text = recognized.data.text.trim();
        if (text) {
          await submitFrame({
            frame_id: `web-frame-${Date.now()}`,
            perceptual_hash: hash,
            ocr_text: text
          });
        }
      } catch {
        /* keep sampling */
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live?.session_id, live?.stream, submitFrame]);

  return (
    <div className="screen">
      <div className="screen-header">
        <p className="eyebrow">Continuous Monitoring</p>
        <h1>Live OCR Monitor</h1>
        <p className="lede">Grant screen access, then readable text is sampled and sent to the live session.</p>
      </div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", maxHeight: 320, background: "#000", borderRadius: 12 }} />
        <div className="actions">
          <button className="button primary" onClick={actions.startLive}><Radio size={16} /><span>Start live session</span></button>
          <button className="button" onClick={actions.verifyLive}>Verify stable text</button>
        </div>
        {live && <p className="muted">{String(live.stable_text || live.status || "Waiting for readable text.")}</p>}
      </div>
    </div>
  );
}

export function ResultScreen({ result }: { result: Record<string, unknown> | null }) {
  return (
    <div className="screen result">
      <div className="screen-header">
        <p className="eyebrow">Verification Intelligence Report</p>
        <h1>Analysis Result</h1>
      </div>
      <ResultView result={result} />
    </div>
  );
}

export function HistoryScreen({ historyList, onSelect }: { historyList: Array<Record<string, unknown>>; onSelect: (item: Record<string, unknown>) => void }) {
  if (historyList.length === 0) {
    return (
      <div className="screen">
        <div className="screen-header"><p className="eyebrow">Audit Vault</p><h1>Analysis History</h1></div>
        <EmptyState title="No history yet" message="Completed analyses will appear here for quick review." />
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="screen-header"><p className="eyebrow">Audit Vault</p><h1>Analysis History</h1></div>
      <div className="history-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 20 }}>
        {historyList.map((item) => (
          <div key={String(item.analysisId)} className="history-card panel">
            <span className="eyebrow">{String(item.finalVerdict || "Unknown")}</span>
            {item.confidence ? <span className="badge">{String(item.confidence)}</span> : null}
            <h3>{String(item.analysisId)}</h3>
            {item.createdAt ? <p className="muted">{new Date(String(item.createdAt)).toLocaleString()}</p> : null}
            <button className="button compact primary" onClick={() => onSelect(item)}>
              <span>View result</span><ChevronRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportScreen({ result }: { result: Record<string, unknown> | null }) {
  if (!result) {
    return <div className="screen"><EmptyState title="No analysis data" message="Run an analysis to generate a detailed report." /></div>;
  }
  return (
    <div className="screen">
      <div className="screen-header"><p className="eyebrow">Executive Intelligence</p><h1>Analysis Report</h1></div>
      <div className="panel">
        <h3>Summary</h3>
        <p>Verdict: {String(result.final_verdict || "Unknown")}</p>
        <p className="muted">Confidence: {String(result.confidence || "N/A")}</p>
        {result.reason ? <p>{String(result.reason)}</p> : null}
        {result.analysis_id ? <p className="muted">Analysis ID: {String(result.analysis_id)}</p> : null}
      </div>
    </div>
  );
}

export function ReviewScreen({ result }: { result: Record<string, unknown> | null }) {
  if (!result) {
    return <div className="screen"><EmptyState title="Nothing to review" message="Open a result or history item to inspect claims and sources." /></div>;
  }
  const claims = Array.isArray(result.claims) ? result.claims : [];
  const sources = Array.isArray(result.sources) ? result.sources : [];
  return (
    <div className="screen">
      <div className="screen-header"><p className="eyebrow">Evidence inspector</p><h1>Review</h1></div>
      <div className="panel">
        <p>Final verdict: {String(result.final_verdict)}</p>
        <p className="muted">Style is not the verdict. Compare claims against reviewed sources.</p>
      </div>
      {claims.map((claim, index) => (
        <div key={index} className="card">
          <p className="eyebrow">Claim {index + 1}</p>
          <p>{String((claim as { claim_text?: string }).claim_text || "No text")}</p>
        </div>
      ))}
      {sources.map((source, index) => (
        <div key={index} className="card">
          <p className="eyebrow">Source {index + 1}</p>
          <p>{String((source as { title?: string }).title || "Untitled")}</p>
        </div>
      ))}
    </div>
  );
}

export function AdminScreen({ settings, models, onSave }: { settings: { backendOrigin: string; defaultDeepCheck: boolean; defaultMaxLength: number; requestTimeoutMs: number }; models: unknown; onSave: Actions["saveSettings"] }) {
  const [origin, setOrigin] = useState(settings.backendOrigin);
  const [deepCheck, setDeepCheck] = useState(settings.defaultDeepCheck);
  const [maxLength, setMaxLength] = useState(String(settings.defaultMaxLength));
  const [timeoutMs, setTimeoutMs] = useState(String(settings.requestTimeoutMs));
  const modelList = Array.isArray(models) ? models : (models && typeof models === "object" && Array.isArray((models as { models?: unknown[] }).models) ? (models as { models: unknown[] }).models : []);
  return (
    <div className="screen">
      <div className="screen-header"><p className="eyebrow">Local client</p><h1>Settings</h1></div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>Backend origin<input value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Backend origin" /></label>
        <label>Request timeout (ms)<input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} /></label>
        <label>Default max length<input type="number" value={maxLength} onChange={(e) => setMaxLength(e.target.value)} /></label>
        <label style={{ flexDirection: "row", gap: 8 }}>
          <input type="checkbox" checked={deepCheck} onChange={(e) => setDeepCheck(e.target.checked)} />
          Default deep check
        </label>
        <button className="button primary" onClick={() => onSave({ backendOrigin: origin, defaultDeepCheck: deepCheck, defaultMaxLength: Number(maxLength) || 512, requestTimeoutMs: Number(timeoutMs) || 60000 })}>Save settings</button>
      </div>
      <div className="panel">
        <h3>Models</h3>
        {modelList.length === 0 ? <p className="muted">Refresh diagnostics to load models.</p> : modelList.map((model, index) => (
          <p key={index}>{String((model as { name?: string }).name || model)}</p>
        ))}
      </div>
    </div>
  );
}

export function DiagnosticsScreen({ diagnostics, actions }: { diagnostics: Record<string, unknown> | null; actions: Actions }) {
  const live = diagnostics?.live as { status?: string } | undefined;
  const ready = diagnostics?.ready as { status?: string } | undefined;
  const models = diagnostics?.models;
  const modelList = Array.isArray(models) ? models : [];
  return (
    <div className="screen">
      <div className="screen-header"><p className="eyebrow">System Telemetry</p><h1>Diagnostics</h1></div>
      <button className="button primary" onClick={actions.diagnostics}><RefreshCw size={16} /><span>Refresh diagnostics</span></button>
      {!diagnostics ? <EmptyState title="No diagnostics data" message="Click refresh to check system status." /> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
          <div className="panel"><h3>Live</h3><p className="muted">Status: {live?.status || "unknown"}</p></div>
          <div className="panel"><h3>Ready</h3><p className="muted">Status: {ready?.status || "unknown"}</p></div>
          <div className="panel"><h3>Models ({modelList.length})</h3>
            {modelList.map((model, index) => <p key={index}>{String((model as { name?: string }).name || JSON.stringify(model))}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

export const NAV_ITEMS = [
  { section: "Input", items: [
    { label: "Analyze", route: "analyze", icon: FileText },
    { label: "Media", route: "media", icon: Paperclip },
    { label: "Capture", route: "capture", icon: Camera },
    { label: "Live", route: "live", icon: Radio }
  ]},
  { section: "Results", items: [
    { label: "Result", route: "result", icon: CheckCircle2 },
    { label: "History", route: "history", icon: History },
    { label: "Report", route: "report", icon: BarChart3 },
    { label: "Review", route: "review", icon: Eye }
  ]},
  { section: "System", items: [
    { label: "Admin", route: "admin", icon: Settings },
    { label: "Diagnostics", route: "diagnostics", icon: Cpu }
  ]}
];
