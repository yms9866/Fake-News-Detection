// Generated-compatible Slice 3 TypeScript API contracts.
// Regenerate from OpenAPI after starting the API:
//   python -m apps.api.scripts.export_openapi --output packages/contracts/openapi/openapi.json
//   npx openapi-typescript packages/contracts/openapi/openapi.json -o packages/contracts/typescript/api.ts

export type AnalysisStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type Quality = "HIGH" | "MEDIUM" | "LOW";
export type InputTypeCode = "text" | "url" | "file" | "unknown";
export type StyleSignal = "LOW_STYLE_RISK" | "HIGH_STYLE_RISK" | "UNKNOWN" | "ERROR";
export type MediaTypeCode = "image" | "audio" | "video";
export type JobStatusCode =
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

export interface EvidenceSummaryItem {
  url: string;
  title: string;
  stance: string;
  source_type: string;
  reliability: Quality;
  fetched: boolean;
}

export interface MediaMetadata {
  media_type: MediaTypeCode;
  mime_type: string;
  size_bytes: number;
  sha256: string;
}

export interface ImageMetadata extends MediaMetadata {
  width?: number | null;
  height?: number | null;
  format?: string | null;
  ocr_engine?: string | null;
  ocr_language?: string | null;
  ocr_confidence?: number | null;
}

export interface AudioMetadata extends MediaMetadata {
  duration_seconds?: number | null;
  detected_language?: string | null;
  transcription_model?: string | null;
  segment_count?: number | null;
}

export interface VideoMetadata extends MediaMetadata {
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  frame_rate?: number | null;
  audio_transcribed?: boolean | null;
  sampled_frame_count?: number | null;
  ocr_frame_count?: number | null;
  transcription_segment_count?: number | null;
}

export interface ExtractionMetadata {
  media_type: MediaTypeCode;
  warnings: string[];
  channels: Record<string, unknown>;
  timings_ms: Record<string, number>;
}

export interface VerificationResponse {
  verdict: string | null;
  evidence_quality: Quality | null;
  explanation: string;
  recommendation: string;
  evidence_summary: string[];
  evidence: EvidenceSummaryItem[];
  web_context: string | null;
  error: string | null;
}

export interface AnalysisResponse {
  analysis_id: string;
  status: AnalysisStatus;
  input_type: InputTypeCode;
  media_type: MediaTypeCode | null;
  extracted_text: string;
  cleaned_text: string;
  source_url: string | null;
  media_metadata: Record<string, unknown> | null;
  extraction_metadata: ExtractionMetadata | null;
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

export interface MediaAnalysisResult extends AnalysisResponse {
  input_type: "file";
  media_type: MediaTypeCode;
}

export interface MediaAnalysisAccepted {
  analysis_id: string;
  job_id: string;
  status: "queued";
  input_type: "file";
  media_type: MediaTypeCode;
  status_url: string;
  job_url: string;
  events_url: string;
  request_id: string;
  trace_id: string;
}

export interface JobError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface JobResponse {
  job_id: string;
  analysis_id: string;
  status: JobStatusCode;
  progress: number;
  current_stage: JobStatusCode;
  message: string;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  error: JobError | null;
  request_id: string;
  trace_id: string;
}

export interface JobProgressEvent {
  event_id: string;
  job_id: string;
  sequence: number;
  status: JobStatusCode;
  progress: number;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface PendingAnalysisResponse {
  analysis_id: string;
  status: "queued" | "running" | "failed" | "cancelled";
  input_type: "file";
  media_type: MediaTypeCode;
  job_id: string;
  error: JobError | null;
  created_at: string;
  completed_at: string | null;
  request_id: string;
  trace_id: string;
}

export interface ApiErrorResponse {
  error_code: string;
  message: string;
  request_id: string;
  trace_id: string;
  details: Record<string, unknown>[];
}

export interface HealthResponse {
  status: "live" | "ready" | "degraded" | "unready";
  service: string;
  request_id: string;
  trace_id: string;
}

export interface ComponentStatus {
  name: string;
  status: "ready" | "configured" | "missing" | "disabled" | "unloaded" | "loaded";
  detail: string;
}

export interface ReadinessResponse extends HealthResponse {
  components: ComponentStatus[];
}

export interface ModelInfo {
  name: string;
  path: string;
  exists: boolean;
  loaded: boolean;
  label_map: Record<number, string>;
  max_length: number;
}

export interface ModelsResponse {
  models: ModelInfo[];
  request_id: string;
  trace_id: string;
}
