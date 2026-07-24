import { button, div, el } from "./dom.js";

export function renderLoadingState(message = "Working") {
  const panel = div("status-panel loading-state");
  panel.setAttribute("aria-live", "polite");
  panel.append(el("strong", message));
  panel.append(el("p", "The request is in progress. You can continue using the app when it completes.", "muted"));
  return panel;
}

export function renderEmptyState(title, message) {
  const panel = div("empty-state");
  panel.append(el("h2", title), el("p", message, "muted"));
  return panel;
}

export function renderErrorPanel(error, retryAction = null) {
  const panel = div("error-panel");
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-live", "assertive");
  panel.append(el("h2", errorTitle(error && error.code)));
  panel.append(el("p", readableErrorMessage(error)));
  const actions = div("actions");
  if (typeof retryAction === "function" && isRetryable(error)) {
    actions.append(button("Retry request", retryAction));
  }
  panel.append(actions);
  const details = document.createElement("details");
  details.append(el("summary", "Technical details"));
  const pre = el("pre", JSON.stringify(error || {}, null, 2));
  details.append(pre);
  panel.append(details);
  return panel;
}

export function renderConnectionStatus(connection, retryAction) {
  const panel = div(`connection-status ${connection && connection.status ? connection.status : "unknown"}`);
  panel.setAttribute("aria-live", "polite");
  const status = connection && connection.status ? connection.status : "unknown";
  panel.append(el("strong", `Backend: ${connectionLabel(status)}`));
  panel.append(el("span", connection && connection.origin ? connection.origin : "http://127.0.0.1:8000", "muted"));
  if (status !== "ready") {
    panel.append(button("Check connection", retryAction, "button compact"));
  }
  return panel;
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
