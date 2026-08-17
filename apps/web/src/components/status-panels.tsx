import { userMessageForError } from "@fnd/analysis-view-model";
import { AlertTriangle, Loader2, Inbox, RefreshCw, Wifi, WifiOff, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function LoadingState({ message = "Working" }: { message?: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="status-panel loading-state" 
      aria-live="polite"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ position: "relative" }}>
          <Loader2 size={24} style={{ color: "var(--accent-primary)", animation: "spin 1.2s linear infinite" }} />
        </div>
        <div className="loading-content">
          <strong style={{ fontSize: 15, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={16} style={{ color: "var(--accent-secondary)" }} />
            {message}
          </strong>
          <p className="muted">Veritas is checking the claim against independent evidence.</p>
        </div>
      </div>
    </motion.div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="empty-state"
    >
      <div 
        style={{ 
          width: 56, 
          height: 56, 
          borderRadius: "50%", 
          background: "var(--bg-surface-elevated)", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          border: "1px solid var(--border-subtle)",
          marginBottom: 6
        }}
      >
        <Inbox size={28} style={{ color: "var(--text-muted)" }} />
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>{title}</h2>
      <p className="muted" style={{ maxWidth: 400 }}>{message}</p>
    </motion.div>
  );
}

export function ErrorPanel({ error, retryAction, onDismiss }: { error: any; retryAction?: (() => void) | null; onDismiss?: () => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="error-panel" 
      role="alert" 
      aria-live="assertive"
      style={{ position: "relative" }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={22} style={{ color: "var(--status-fake-text)" }} />
          <h2>{errorTitle(error?.code)}</h2>
        </div>
        {typeof onDismiss === "function" && (
          <button 
            onClick={onDismiss} 
            className="button compact" 
            style={{ padding: "4px 8px", background: "transparent", border: "none" }}
            title="Dismiss error"
          >
            ✕
          </button>
        )}
      </div>
      <p>{readableErrorMessage(error)}</p>
      <div className="actions">
        {typeof retryAction === "function" && isRetryable(error) && (
          <button onClick={retryAction} className="button compact primary">
            <RefreshCw size={14} />
            <span>Retry request</span>
          </button>
        )}
      </div>
      {validationMessages(error).length > 0 && (
        <ul className="warnings">
          {validationMessages(error).map((item: string, i: number) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

export function ConnectionStatus({ connection, retryAction }: { connection: any; retryAction: () => void }) {
  const status = connection?.status || "unknown";
  const isReady = status === "ready";
  
  return (
    <div className={`connection-status ${status}`} aria-live="polite">
      <div className="status-dot" />
      {isReady ? <Wifi size={14} style={{ color: "var(--status-real-text)" }} /> : <WifiOff size={14} style={{ color: "var(--text-muted)" }} />}
      <strong>{connectionLabel(status)}</strong>
      {status !== "ready" && (
        <button onClick={retryAction} className="button compact" style={{ marginLeft: 4 }}>
          <RefreshCw size={12} />
          <span>Check connection</span>
        </button>
      )}
    </div>
  );
}

function errorTitle(code: string) {
  if (code === "WEB_CONNECTION_REFUSED" || code === "WEB_CORS_OR_NETWORK_FAILURE" || code === "FND_CONNECTION_REFUSED" || code === "FND_CORS_OR_NETWORK_FAILURE") {
    return "Backend unavailable";
  }
  if (code === "WEB_REQUEST_TIMEOUT" || code === "FND_REQUEST_TIMEOUT") {
    return "Backend request timed out";
  }
  if (code === "WEB_VALIDATION_ERROR" || code === "VALIDATION_ERROR" || code === "FND_VALIDATION_ERROR" || code === "FND_EMPTY_TEXT") {
    return "Request needs attention";
  }
  if (code === "WEB_SERVER_ERROR" || code === "FND_SERVER_ERROR") {
    return "Backend error";
  }
  return "Request failed";
}

function readableErrorMessage(error: any) {
  if (!error) {
    return "Something went wrong.";
  }
  return userMessageForError(error);
}

function isRetryable(error: any) {
  return !error || !error.status || error.status >= 500 || [
    "WEB_CONNECTION_REFUSED",
    "WEB_CORS_OR_NETWORK_FAILURE",
    "WEB_REQUEST_TIMEOUT",
    "FND_CONNECTION_REFUSED",
    "FND_CORS_OR_NETWORK_FAILURE",
    "FND_REQUEST_TIMEOUT"
  ].includes(error.code);
}

function validationMessages(error: any) {
  if (!error || !Array.isArray(error.validationDetails)) {
    return [];
  }
  return error.validationDetails
    .map((detail: any) => {
      const field = Array.isArray(detail.loc) && detail.loc.length > 0 ? ` (${detail.loc.join(".")})` : "";
      return `${detail.msg || "Please check this field."}${field}`;
    })
    .filter(Boolean);
}

function connectionLabel(status: string) {
  if (status === "ready") return "Ready";
  if (status === "checking") return "Checking";
  if (status === "unavailable") return "Offline";
  return "Not checked";
}
