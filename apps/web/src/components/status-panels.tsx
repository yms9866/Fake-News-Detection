import React from "react";

export function LoadingState({ message = "Working" }: { message?: string }) {
  return (
    <div className="status-panel loading-state" aria-live="polite">
      <div className="loading-spinner" />
      <div className="loading-content">
        <strong>{message}</strong>
        <p className="muted">The request is in progress. You can continue using the app when it completes.</p>
      </div>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p className="muted">{message}</p>
    </div>
  );
}

export function ErrorPanel({ error, retryAction }: { error: any; retryAction?: (() => void) | null }) {
  return (
    <div className="error-panel" role="alert" aria-live="assertive">
      <h2>{errorTitle(error?.code)}</h2>
      <p>{readableErrorMessage(error)}</p>
      <div className="actions">
        {typeof retryAction === "function" && isRetryable(error) && (
          <button onClick={retryAction}>Retry request</button>
        )}
      </div>
      {validationMessages(error).length > 0 && (
        <ul className="warnings">
          {validationMessages(error).map((item: string, i: number) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConnectionStatus({ connection, retryAction }: { connection: any; retryAction: () => void }) {
  const status = connection?.status || "unknown";
  return (
    <div className={`connection-status ${status}`} aria-live="polite">
      <strong>Backend: {connectionLabel(status)}</strong>
      <span className="muted">{connection?.origin || "http://127.0.0.1:8000"}</span>
      {status !== "ready" && (
        <button onClick={retryAction} className="button compact">
          Check connection
        </button>
      )}
    </div>
  );
}

function errorTitle(code) {
  if (code === "WEB_CONNECTION_REFUSED" || code === "WEB_CORS_OR_NETWORK_FAILURE") {
    return "Backend unavailable";
  }
  if (code === "WEB_REQUEST_TIMEOUT") {
    return "Backend request timed out";
  }
  if (code === "WEB_VALIDATION_ERROR" || code === "VALIDATION_ERROR") {
    return "Request needs attention";
  }
  if (code === "WEB_SERVER_ERROR") {
    return "Backend error";
  }
  return "Request failed";
}

function readableErrorMessage(error) {
  if (!error) {
    return "Something went wrong.";
  }
  if (error.backendOrigin && (error.code === "WEB_CONNECTION_REFUSED" || error.code === "WEB_CORS_OR_NETWORK_FAILURE")) {
    return `The local API could not be reached at ${error.backendOrigin}. Start the backend, then try again.`;
  }
  if (Array.isArray(error.validationDetails) && error.validationDetails.length > 0) {
    const first = error.validationDetails[0];
    return `${error.message} ${first.loc ? `Field: ${first.loc.join(".")}.` : ""}`.trim();
  }
  return error.message || "The operation failed.";
}

function isRetryable(error) {
  return !error || !error.status || error.status >= 500 || [
    "WEB_CONNECTION_REFUSED",
    "WEB_CORS_OR_NETWORK_FAILURE",
    "WEB_REQUEST_TIMEOUT"
  ].includes(error.code);
}

function validationMessages(error) {
  if (!error || !Array.isArray(error.validationDetails)) {
    return [];
  }
  return error.validationDetails
    .map((detail) => {
      const field = Array.isArray(detail.loc) && detail.loc.length > 0 ? ` (${detail.loc.join(".")})` : "";
      return `${detail.msg || "Please check this field."}${field}`;
    })
    .filter(Boolean);
}

function connectionLabel(status) {
  if (status === "ready") {
    return "connected";
  }
  if (status === "checking") {
    return "checking";
  }
  if (status === "unavailable") {
    return "unavailable";
  }
  return "not checked";
}
