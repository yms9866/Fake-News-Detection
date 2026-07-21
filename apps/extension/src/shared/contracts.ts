// Shared extension-facing contracts. Runtime modules import validators and constants
// from sibling files; this file intentionally remains type-only for generated-contract
// compatibility and future TypeScript builds.

export type AnalysisInputType = "text" | "url" | "file" | "unknown";
export type MediaType = "image" | "audio" | "video";
export type LiveSourceType = "screen" | "window" | "region" | "browser_tab";
export type LiveSessionStatus =
  | "created"
  | "awaiting_permission"
  | "capturing"
  | "paused"
  | "finalizing"
  | "completed"
  | "cancelled"
  | "failed";
export type Quality = "HIGH" | "MEDIUM" | "LOW";
export type StyleSignal = "LOW_STYLE_RISK" | "HIGH_STYLE_RISK" | "UNKNOWN" | "ERROR";
export type ClientAnalysisState =
  | "idle"
  | "extracting"
  | "submitting"
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";
export type BackendJobStatus =
  | "queued"
  | "validating"
  | "preprocessing"
  | "extracting"
  | "cleaning"
  | "style_analysis"
  | "searching"
  | "fetching_evidence"
  | "verifying"
  | "deciding"
  | "completed"
  | "failed"
  | "cancelled";

export interface ConnectionCredentials {
  backendOrigin: string;
  pairingToken?: string;
}

export interface ExtensionSettings extends ConnectionCredentials {
  defaultDeepCheck: boolean;
  defaultMaxLength: number;
  requestTimeoutMs: number;
  showOverlayAutomatically: boolean;
  storeLatestAnalysisReference: boolean;
}

export interface AnalyzeTextRequest {
  text: string;
  deep_check?: boolean;
  max_length?: number | null;
}

export interface AnalyzeUrlRequest {
  url: string;
  deep_check?: boolean;
  max_length?: number | null;
}

export interface VerificationResponse {
  verdict: string | null;
  evidence_quality: Quality | null;
  explanation: string;
  recommendation: string;
  evidence_summary: string[];
  evidence: Array<{
    url: string;
    title: string;
    stance: string;
    source_type: string;
    reliability: Quality;
    fetched: boolean;
  }>;
  web_context: string | null;
  error: string | null;
}

export interface AnalysisResponse {
  analysis_id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  input_type: AnalysisInputType;
  media_type: MediaType | null;
  extracted_text: string;
  cleaned_text: string;
  source_url: string | null;
  style_signal: StyleSignal;
  style_confidence: number | null;
  style_scope_reliable: boolean;
  style_word_count: number;
  style_minimum_word_count: number;
  style_warning: string | null;
  verification: VerificationResponse | null;
  final_verdict: string;
  confidence: Quality;
  reason: string;
  warnings: string[];
  created_at: string;
  completed_at: string | null;
  request_id: string;
  trace_id: string;
}

export interface MediaAnalysisAccepted {
  analysis_id: string;
  job_id: string;
  status: "queued";
  input_type: "file";
  media_type: MediaType;
  status_url: string;
  job_url: string;
  events_url: string;
  request_id: string;
  trace_id: string;
}

export interface JobResponse {
  job_id: string;
  analysis_id: string;
  status: BackendJobStatus;
  progress: number;
  current_stage: BackendJobStatus;
  message: string;
  error: { code: string; message: string; retryable: boolean } | null;
  request_id: string;
  trace_id: string;
}

export interface CreateLiveSessionRequest {
  source_type: LiveSourceType;
  source_id: string;
  permission_granted: boolean;
  source_url?: string | null;
  settings?: Record<string, unknown>;
}

export interface SubmitLiveFrameRequest {
  frame_id: string;
  perceptual_hash: string;
  ocr_text?: string;
  dom_text?: string | null;
  source_url?: string | null;
}

export interface LiveSessionResponse {
  session_id: string;
  status: LiveSessionStatus;
  source_type: LiveSourceType;
  source_id: string;
  source_url: string | null;
  stable_text: string;
  frame_count: number;
  skipped_frame_count: number;
  changed_frame_count: number;
  buffer_chars: number;
  visible_indicator_required: boolean;
  visible_indicator_active: boolean;
  frame_bytes_retained: boolean;
  verification_count: number;
  request_id: string;
  trace_id: string;
}

export interface AnalysisResultSummary {
  analysisId: string;
  jobId?: string;
  clientState: ClientAnalysisState;
  backendJobStatus?: BackendJobStatus;
  styleSignal?: StyleSignal;
  styleScopeReliable?: boolean;
  finalVerdict?: string;
  confidence?: Quality;
  verificationStatus: "not_run" | "checking" | "completed" | "failed";
  sourceCount: number;
  warnings: string[];
  reason?: string;
  requestId?: string;
  traceId?: string;
}
