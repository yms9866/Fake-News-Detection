import { useState, useEffect } from "react";
import { createWebApiClient } from "./api/client.js";
import { createBackendAuthAdapter } from "./auth/dev-auth.js";
import { createHistoryStore } from "./stores/history-store.js";
import { compactHistoryItem } from "./components/safe-rendering.js";
import { createCsrfToken } from "./security/csrf.js";
import { requestCameraImage, requestDisplayCapture, requestMicrophone, stopStream } from "./capture/browser-capture.js";
import { ConnectionStatus, EmptyState, ErrorPanel, LoadingState } from "./components/status-panels";
import { ResultView } from "./components/result-view";

const DEFAULT_SETTINGS = {
  backendOrigin: "http://127.0.0.1:8000",
  defaultDeepCheck: true,
  defaultMaxLength: 512,
  requestTimeoutMs: 60000,
  csrfToken: createCsrfToken("web-client")
};

export default function App() {
  const client = createWebApiClient(DEFAULT_SETTINGS);
  const auth = createBackendAuthAdapter(client);
  const history = createHistoryStore();
  
  const [route, setRoute] = useState("analyze");
  const [session, setSession] = useState<any>(null);
  const [result, setAnalysisResult] = useState<any>(null);
  const [job, setJob] = useState<any>(null);
  const [live, setLive] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [connection, setConnection] = useState({ status: "unknown", origin: DEFAULT_SETTINGS.backendOrigin });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [lastRetry, setLastRetry] = useState<(() => void) | null>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);

  const actions = {
    navigate(newRoute: string) {
      setRoute(newRoute);
    },
    async checkConnection() {
      setConnection({ status: "checking", origin: DEFAULT_SETTINGS.backendOrigin });
      setLastRetry(() => actions.checkConnection);
      try {
        await client.live();
        setConnection({ status: "ready", origin: DEFAULT_SETTINGS.backendOrigin });
      } catch (error) {
        setConnection({ status: "unavailable", origin: DEFAULT_SETTINGS.backendOrigin });
        setError(normalizeUiError(error));
      }
    },
    async signIn() {
      setLoading(true);
      setError(null);
      try {
        setSession(await auth.signIn("local-reviewer"));
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async signOut() {
      setLoading(true);
      setError(null);
      try {
        await auth.signOut();
        setSession(null);
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async analyzeText(payload: any) {
      setLoading(true);
      setError(null);
      try {
        const result = await client.analyzeText(payload);
        setAnalysisResult(result);
        setHistoryList(history.add(compactHistoryItem(result)));
        setRoute("result");
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async analyzeUrl(payload: any) {
      setLoading(true);
      setError(null);
      try {
        const result = await client.analyzeUrl(payload);
        setAnalysisResult(result);
        setHistoryList(history.add(compactHistoryItem(result)));
        setRoute("result");
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async uploadMedia(file: File) {
      setLoading(true);
      setError(null);
      try {
        if (!file) {
          throw new Error("Choose a media file first.");
        }
        const type = file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "image";
        const accepted = await client.uploadMedia(type, file, { deepCheck: false, maxLength: 512 });
        setJob(await client.getJob(accepted.job_id));
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async cancelJob() {
      setLoading(true);
      setError(null);
      try {
        if (job) {
          setJob(await client.cancelJob(job.job_id));
        }
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async capture(kind: string) {
      setLoading(true);
      setError(null);
      try {
        const stream = kind === "display"
          ? await requestDisplayCapture()
          : kind === "camera"
            ? await requestCameraImage()
            : await requestMicrophone();
        stopStream(stream);
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async startLive() {
      setLoading(true);
      setError(null);
      try {
        setLive(await client.createLiveSession({
          source_type: "screen",
          source_id: "browser-display",
          permission_granted: true
        }));
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async submitLiveText(text: string) {
      setLoading(true);
      setError(null);
      try {
        if (!live) {
          throw new Error("Start a live session first.");
        }
        setLive(await client.submitLiveFrame(live.session_id, {
          frame_id: `web-frame-${Date.now()}`,
          perceptual_hash: String(Date.now()),
          ocr_text: text
        }));
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async verifyLive() {
      setLoading(true);
      setError(null);
      try {
        if (live) {
          setLive(await client.verifyLiveSession(live.session_id, { trigger: "user", force: true }));
        }
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    },
    async diagnostics() {
      setLoading(true);
      setError(null);
      try {
        setDiagnostics({
          live: await client.live(),
          ready: await client.ready(),
          models: await client.models()
        });
      } catch (error) {
        setError(normalizeUiError(error));
      } finally {
        setLoading(false);
      }
    }
  };

  // Initialize connection check on mount
  useEffect(() => {
    actions.checkConnection();
  }, []);

  function NavButton({ label, route: targetRoute, icon }: { label: string; route: string; icon: string }) {
    const isActive = route === targetRoute;
    return (
      <button
        className={isActive ? "nav active" : "nav"}
        aria-current={isActive ? "page" : "false"}
        onClick={() => actions.navigate(targetRoute)}
      >
        {icon} {label}
      </button>
    );
  }

  function NavSection({ title }: { title: string }) {
    return <div className="nav-section-header">{title}</div>;
  }

  // Main JSX render
  return (
    <main className="app-shell">
      <nav aria-label="Primary">
        <NavSection title="Input" />
        <NavButton label="Analyze" route="analyze" icon="📝" />
        <NavButton label="Media" route="media" icon="📎" />
        <NavButton label="Capture" route="capture" icon="📷" />
        <NavButton label="Live" route="live" icon="🔴" />
        <NavSection title="Results" />
        <NavButton label="Result" route="result" icon="✓" />
        <NavButton label="History" route="history" icon="📜" />
        <NavButton label="Report" route="report" icon="📊" />
        <NavButton label="Review" route="review" icon="👁" />
        <NavSection title="System" />
        <NavButton label="Admin" route="admin" icon="⚙" />
        <NavButton label="Auth" route="auth" icon="🔐" />
        <NavButton label="Diagnostics" route="diagnostics" icon="🔧" />
      </nav>
      <div className="content-shell">
        <ConnectionStatus connection={connection} retryAction={actions.checkConnection} />
        {error && <ErrorPanel error={error} retryAction={lastRetry} />}
        {loading && <LoadingState message="Analyzing" />}
        {renderRoute()}
      </div>
    </main>
  );

  function renderRoute() {
    switch (route) {
      case "media":
        return renderMedia();
      case "capture":
        return renderCapture();
      case "live":
        return renderLive();
      case "result":
        return renderResult();
      case "history":
        return renderHistory();
      case "report":
        return renderReport();
      case "review":
        return renderReview();
      case "admin":
        return renderAdmin();
      case "auth":
        return renderAuth();
      case "diagnostics":
        return renderDiagnostics();
      default:
        return renderAnalyze();
    }
  }

  function renderAnalyze() {
    const [text, setText] = useState("");
    const [url, setUrl] = useState("");
    const [deepCheck, setDeepCheck] = useState(DEFAULT_SETTINGS.defaultDeepCheck);
    const [maxLength, setMaxLength] = useState(String(DEFAULT_SETTINGS.defaultMaxLength));

    return (
      <div className="screen">
        <p className="eyebrow">Evidence-focused analysis</p>
        <h1>Check a claim, article, or source</h1>
        <p className="lede">The final verdict is based on deterministic evidence policy. Style analysis is shown separately and never proves truth by itself.</p>
        <label>
          Text
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          URL
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Deep check
          <input type="checkbox" checked={deepCheck} onChange={(e) => setDeepCheck(e.target.checked)} />
        </label>
        <label>
          Max length
          <input
            type="number"
            value={maxLength}
            min="128"
            max="8192"
            step="1"
            onChange={(e) => setMaxLength(e.target.value)}
          />
        </label>
        <div className="actions">
          <button onClick={() => actions.analyzeText({ text, deep_check: deepCheck, max_length: Number(maxLength) || DEFAULT_SETTINGS.defaultMaxLength })}>
            Analyze text
          </button>
          <button onClick={() => actions.analyzeUrl({ url, deep_check: deepCheck, max_length: Number(maxLength) || DEFAULT_SETTINGS.defaultMaxLength })}>
            Analyze URL
          </button>
        </div>
      </div>
    );
  }

  function renderMedia() {
    const [file, setFile] = useState<File | null>(null);
    
    return (
      <div className="screen">
        <h1>Media</h1>
        <label>
          Upload
          <input
            type="file"
            accept="image/*,audio/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <button onClick={() => { if (file) actions.uploadMedia(file); }}>Analyze upload</button>
        {job && (
          <>
            <p className="muted">{job.status}: {job.message || ""}</p>
            <button className="danger" onClick={actions.cancelJob}>Cancel job</button>
          </>
        )}
      </div>
    );
  }

  function renderCapture() {
    return (
      <div className="screen">
        <h1>Browser Capture</h1>
        <button onClick={() => actions.capture("display")}>Display capture</button>
        <button onClick={() => actions.capture("camera")}>Camera image</button>
        <button onClick={() => actions.capture("microphone")}>Microphone recording</button>
      </div>
    );
  }

  function renderLive() {
    const [text, setText] = useState("");
    
    return (
      <div className="screen">
        <h1>Live OCR</h1>
        <label>
          Frame text
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Live OCR text block" />
        </label>
        <button onClick={actions.startLive}>Start live session</button>
        <button onClick={() => actions.submitLiveText(text)}>Submit frame</button>
        <button onClick={actions.verifyLive}>Verify</button>
        {live && (
          <>
            <p className="muted">{liveStatusText(live)}</p>
            {live.stable_text && <p className="muted">{live.stable_text}</p>}
          </>
        )}
      </div>
    );
  }

  function renderResult() {
    return (
      <div className="screen result">
        <h1>Analysis result</h1>
        <ResultView result={result} />
      </div>
    );
  }

  function renderHistory() {
    if (historyList.length === 0) {
      return (
        <div className="screen">
          <h1>Analysis History</h1>
          <p className="muted">Your recent analyses are stored here for quick reference.</p>
          <EmptyState title="No history yet" message="Completed analyses will appear here for quick review." />
        </div>
      );
    }
    
    return (
      <div className="screen">
        <h1>Analysis History</h1>
        <p className="muted">Your recent analyses are stored here for quick reference.</p>
        <div className="history-list">
          {historyList.map((item: any, index: number) => (
            <div key={index} className="history-card panel">
              <p className="eyebrow">{item.finalVerdict || "Unknown verdict"}</p>
              <h3>{item.analysisId || "Untitled analysis"}</h3>
              {item.confidence && <p className="muted">Confidence: {item.confidence}</p>}
              {item.timestamp && <p className="muted">{new Date(item.timestamp).toLocaleString()}</p>}
              <button onClick={() => {
                setAnalysisResult(item);
                setRoute("result");
              }}>View result</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderReport() {
    if (!result) {
      return (
        <div className="screen">
          <h1>Analysis Report</h1>
          <EmptyState title="No analysis data" message="Run an analysis to generate a detailed report." />
        </div>
      );
    }
    
    return (
      <div className="screen">
        <h1>Analysis Report</h1>
        <div className="report-container">
          <div className="panel">
            <h3>Summary</h3>
            <p>Verdict: {result.final_verdict || "Unknown"}</p>
            <p>Confidence: {result.confidence || "N/A"}</p>
            {result.reason && <p className="muted">{result.reason}</p>}
          </div>
          
          <div className="panel">
            <h3>Technical Details</h3>
            <div className="technical-details">
              {result.analysis_id && <p className="muted">Analysis ID: {result.analysis_id}</p>}
              {result.timestamp && <p className="muted">Analyzed: {new Date(result.timestamp).toLocaleString()}</p>}
              {result.style_signal && <p className="muted">Style Signal: {result.style_signal}</p>}
              {result.style_confidence && <p className="muted">Style Confidence: {(result.style_confidence * 100).toFixed(1)}%</p>}
            </div>
          </div>
          
          {result.claims && result.claims.length > 0 && (
            <div className="panel">
              <h3>Claims Checked ({result.claims.length})</h3>
              <div className="claims-list">
                {result.claims.map((claim: any, index: number) => (
                  <div key={index} className="claim-item">
                    <p className="eyebrow">Claim {index + 1}</p>
                    <p>{claim.claim_text || "No text"}</p>
                    <p className="muted">Status: {claim.verification_status || "Unknown"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {result.sources && result.sources.length > 0 && (
            <div className="panel">
              <h3>Sources Reviewed ({result.sources.length})</h3>
              <div className="sources-list">
                {result.sources.map((source: any, index: number) => (
                  <div key={index} className="source-item">
                    <p className="eyebrow">Source {index + 1}</p>
                    <p>{source.title || "Untitled"}</p>
                    {source.publisher && <p className="muted">{source.publisher}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderReview() {
    return (
      <div className="screen">
        <h1>Review</h1>
        <p className="muted">{session ? "Reviewer shell active" : "Sign in to review."}</p>
      </div>
    );
  }

  function renderAdmin() {
    return (
      <div className="screen">
        <h1>Admin</h1>
        <p className="muted">Administration shell for future RBAC and tenant controls.</p>
      </div>
    );
  }

  function renderAuth() {
    return (
      <div className="screen">
        <h1>Auth</h1>
        {session ? <p>Signed in as {session.user.name}</p> : <p className="muted">No active session.</p>}
        <button onClick={actions.signIn}>Sign in</button>
        <button onClick={actions.signOut}>Sign out</button>
      </div>
    );
  }

  function renderDiagnostics() {
    return (
      <div className="screen">
        <h1>System Diagnostics</h1>
        <p className="muted">Check the health and status of the backend services.</p>
        <button onClick={actions.diagnostics}>Refresh diagnostics</button>
        
        {!diagnostics ? (
          <EmptyState title="No diagnostics data" message="Click refresh to check system status." />
        ) : (
          <div className="diagnostics-container">
            {diagnostics.backend && (
              <div className="panel">
                <h3>Backend Status</h3>
                <p className="muted">Status: {(diagnostics.backend.state || "unknown").toUpperCase()}</p>
                <p className="muted">Version: {diagnostics.backend.version || "Unknown"}</p>
                {diagnostics.backend.uptime && <p className="muted">Uptime: {diagnostics.backend.uptime}</p>}
              </div>
            )}
            
            {diagnostics.live && (
              <div className="panel">
                <h3>Live OCR Service</h3>
                <p className="muted">Status: {diagnostics.live.status || "Unknown"}</p>
                {diagnostics.live.message && <p className="muted">{diagnostics.live.message}</p>}
              </div>
            )}
            
            {diagnostics.ready && (
              <div className="panel">
                <h3>API Readiness</h3>
                <p className="muted">Status: {diagnostics.ready.status || "Unknown"}</p>
                {diagnostics.ready.message && <p className="muted">{diagnostics.ready.message}</p>}
              </div>
            )}
            
            {diagnostics.models && Array.isArray(diagnostics.models) && (
              <div className="panel">
                <h3>Available Models ({diagnostics.models.length})</h3>
                <div className="models-list">
                  {diagnostics.models.map((model: any, index: number) => (
                    <div key={index} className="model-item">
                      <p className="eyebrow">Model {index + 1}</p>
                      <p>{model.name || "Unnamed model"}</p>
                      {model.type && <p className="muted">{model.type}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
}

function liveStatusText(live: any) {
  const labels: Record<string, string> = {
    awaiting_permission: "Waiting for screen access.",
    capturing: live && live.stable_text ? "Text detected. Ready to verify." : "Looking for readable text.",
    paused: "Live OCR is paused.",
    finalizing: "Preparing the final Live OCR result.",
    completed: "Live OCR stopped.",
    cancelled: "Live OCR cancelled.",
    failed: "Live OCR is temporarily unavailable."
  };
  return labels[live && live.status] || "Preparing Live OCR.";
}

function normalizeUiError(error: any) {
  return {
    code: error && error.code ? error.code : "WEB_ERROR",
    message: error && error.message ? error.message : "Web operation failed.",
    status: error && error.status ? error.status : 0,
    requestId: error && error.requestId ? error.requestId : null,
    traceId: error && error.traceId ? error.traceId : null,
    validationDetails: error && Array.isArray(error.validationDetails) ? error.validationDetails : [],
    backendOrigin: error && error.backendOrigin ? error.backendOrigin : DEFAULT_SETTINGS.backendOrigin,
    technicalDetails: error && error.technicalDetails ? error.technicalDetails : ""
  };
}
