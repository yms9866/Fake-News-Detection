import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  const [activeTab, setActiveTab] = useState<"text" | "url">("text");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [deepCheck, setDeepCheck] = useState(defaultSettings.defaultDeepCheck);
  const [maxLength, setMaxLength] = useState(String(defaultSettings.defaultMaxLength));

  return (
    <div className="screen">
      <div className="screen-header">
        <p className="eyebrow">EVIDENCE-FIRST VERIFICATION</p>
        <h1>What would you like to verify?</h1>
        <p className="lede">Paste a claim, article, headline, or source and Veritas will analyze the available evidence.</p>
      </div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="tabs">
          <button className={`tab-button ${activeTab === "text" ? "active" : ""}`} onClick={() => setActiveTab("text")}>Text Analysis</button>
          <button className={`tab-button ${activeTab === "url" ? "active" : ""}`} onClick={() => setActiveTab("url")}>URL Analysis</button>
        </div>

        {activeTab === "text" ? (
          <label>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a claim, article, headline, or text to analyze..." aria-label="Text to analyze" style={{ minHeight: 120 }} />
          </label>
        ) : (
          <label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste the original source URL..." aria-label="Source URL to analyze" />
          </label>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
          <label style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
            <div>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Search for supporting evidence</span>
              <p className="muted" style={{ fontSize: 12 }}>Search independent sources to strengthen the verification.</p>
            </div>
            <div className="toggle-switch">
              <input type="checkbox" checked={deepCheck} onChange={(e) => setDeepCheck(e.target.checked)} />
              <span className="toggle-slider"></span>
            </div>
          </label>
          <details className="advanced-options">
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Advanced options</summary>
            <div style={{ marginTop: 12 }}>
              <label>
                <span>Maximum analysis length ({maxLength})</span>
                <input type="number" value={maxLength} min="128" max="8192" onChange={(e) => setMaxLength(e.target.value)} />
              </label>
            </div>
          </details>
        </div>
        <div className="actions" style={{ marginTop: 8 }}>
          <button 
            className="button primary" 
            onClick={() => activeTab === "text" 
              ? actions.analyzeText({ text, deep_check: deepCheck, max_length: Number(maxLength) || defaultSettings.defaultMaxLength })
              : actions.analyzeUrl({ url, deep_check: deepCheck, max_length: Number(maxLength) || defaultSettings.defaultMaxLength })
            }
          >
            <span>Verify Now &rarr;</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function MediaScreen({ actions, job }: { actions: Actions; job: Record<string, unknown> | null }) {
  const [activeTab, setActiveTab] = useState<"image" | "audio" | "video">("image");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    setFile(null);
  }, [activeTab]);

  const acceptMap = {
    image: "image/*",
    audio: "audio/*",
    video: "video/*"
  };

  return (
    <div className="screen">
      <div className="screen-header">
        <p className="eyebrow">Multimodal Verification</p>
        <h1>Media Analysis</h1>
        <p className="lede">Upload images, audio recordings, or video clips to verify.</p>
        
        <div className="info-callout">
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            <strong style={{ color: "var(--text-primary)" }}>How it works:</strong> Veritas extracts the text or speech from your media and analyzes that text against independent evidence. It does <strong>not</strong> directly analyze the visual content for manipulation or deepfakes.
          </p>
        </div>
      </div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div className="tabs">
          <button className={`tab-button ${activeTab === "image" ? "active" : ""}`} onClick={() => setActiveTab("image")}>Image</button>
          <button className={`tab-button ${activeTab === "audio" ? "active" : ""}`} onClick={() => setActiveTab("audio")}>Audio</button>
          <button className={`tab-button ${activeTab === "video" ? "active" : ""}`} onClick={() => setActiveTab("video")}>Video</button>
        </div>

        <div className="upload-dropzone">
          <UploadCloud size={40} style={{ color: "var(--accent-primary)", marginBottom: 12 }} />
          <p style={{ fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>{file ? file.name : `Select an ${activeTab} file`}</p>
          <input type="file" accept={acceptMap[activeTab]} onChange={(e) => setFile(e.target.files?.[0] || null)} aria-label={`Upload ${activeTab} file`} />
        </div>
        <div className="actions">
          <button className="button primary" disabled={!file} onClick={() => file && actions.uploadMedia(file)}>
            <span>Analyze {activeTab} &rarr;</span>
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
      <div className="card-grid">
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
      <div className="history-list">
        {historyList.map((item) => (
          <div key={String(item.analysisId)} className="history-card panel">
            <span className="eyebrow">{String(item.finalVerdict || "Unknown")}</span>
            {item.confidence ? <span className="badge" style={{ marginLeft: 8 }}>{String(item.confidence)}</span> : null}
            <h3 style={{ marginTop: 8, marginBottom: 8, fontSize: 16 }}>{String(item.title || item.analysisId)}</h3>
            {item.createdAt ? <p className="muted" style={{ marginBottom: 12 }}>{new Date(String(item.createdAt)).toLocaleString()}</p> : null}
            <Link to={`/history/${item.slug || item.analysisId}`} className="button compact primary" onClick={() => onSelect(item)}>
              <span>View result</span><ChevronRight size={14} />
            </Link>
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
        {result.reason ? <p style={{ marginTop: 8 }}>{String(result.reason)}</p> : null}
        <details style={{ marginTop: 16 }}>
          <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>Technical details</summary>
          <p className="muted" style={{ marginTop: 8, fontSize: 12, wordBreak: "break-all" }}>Analysis ID: {String(result.analysis_id)}</p>
        </details>
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

export function SettingsScreen({ settings, models, onSave }: { settings: { backendOrigin: string; defaultDeepCheck: boolean; defaultMaxLength: number; requestTimeoutMs: number }; models: unknown; onSave: Actions["saveSettings"] }) {
  const [origin, setOrigin] = useState(settings.backendOrigin);
  const [deepCheck, setDeepCheck] = useState(settings.defaultDeepCheck);
  const [maxLength, setMaxLength] = useState(String(settings.defaultMaxLength));
  const [timeoutMs, setTimeoutMs] = useState(String(settings.requestTimeoutMs));
  const modelList = Array.isArray(models) ? models : (models && typeof models === "object" && Array.isArray((models as { models?: unknown[] }).models) ? (models as { models: unknown[] }).models : []);
  return (
    <div className="screen">
      <div className="screen-header">
        <p className="eyebrow">PREFERENCES</p>
        <h1>Settings</h1>
        <p className="lede">Manage your connection to the Veritas engine and default analysis parameters.</p>
      </div>
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
        <section>
          <h3 style={{ marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>Connection</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label>
              <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>Request Timeout (ms)</span>
              <input type="number" value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} />
              <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>Maximum time to wait for the backend to respond.</span>
            </label>
          </div>
        </section>

        <section>
          <h3 style={{ marginBottom: 16, paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)" }}>Analysis Defaults</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <label style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer" }}>
              <div>
                <span style={{ fontWeight: 500, color: "var(--text-primary)", display: "block" }}>Search for supporting evidence</span>
                <span className="muted" style={{ fontSize: 12, display: "block" }}>Enable deep web search by default for all verifications.</span>
              </div>
              <div className="toggle-switch">
                <input type="checkbox" checked={deepCheck} onChange={(e) => setDeepCheck(e.target.checked)} />
                <span className="toggle-slider"></span>
              </div>
            </label>
            <label>
              <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>Maximum Analysis Length</span>
              <input type="number" value={maxLength} min="128" max="8192" onChange={(e) => setMaxLength(e.target.value)} />
              <span className="muted" style={{ fontSize: 12, marginTop: 4, display: "block" }}>Maximum length of text to analyze. Larger values use more processing power.</span>
            </label>
          </div>
        </section>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8 }}>
          <button className="button primary" onClick={() => onSave({ backendOrigin: origin, defaultDeepCheck: deepCheck, defaultMaxLength: Number(maxLength) || 512, requestTimeoutMs: Number(timeoutMs) || 60000 })}>
            Save Settings
          </button>
        </div>
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
        <div className="diagnostics-grid">
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
  { section: "Verify", items: [
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
    { label: "Settings", route: "settings", icon: Settings },
    { label: "Diagnostics", route: "diagnostics", icon: Cpu }
  ]}
];
