import { button, div, el } from "./dom.js";

export function renderJobProgress(job, onCancel) {
  const wrapper = div("job-progress");
  if (!job) {
    wrapper.append(el("p", "No active job.", "muted"));
    return wrapper;
  }
  const progress = document.createElement("progress");
  progress.max = 100;
  progress.value = Math.round(Number(job.progress || 0) * 100);
  wrapper.append(el("h2", job.current_stage || job.status || "processing"));
  wrapper.append(progress);
  wrapper.append(el("p", job.message || "Working...", "muted"));
  if (!["completed", "failed", "cancelled"].includes(job.status)) {
    wrapper.append(button("Cancel job", onCancel, "danger"));
  }
  return wrapper;
}
