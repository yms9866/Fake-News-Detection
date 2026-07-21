// Slice 1 stub: generated TypeScript contracts will replace this in the API slice.

export type AnalysisInputType = "Direct Text" | "URL" | "File" | "Unknown";

export interface AnalyzeTextRequest {
  text: string;
  deepCheck?: boolean;
}

export interface AnalyzeUrlRequest {
  url: string;
  deepCheck?: boolean;
}

export interface AnalysisResponse {
  inputType: AnalysisInputType;
  extractedText: string;
  styleSignal: string;
  styleConfidence: number | null;
  verificationVerdict: string | null;
  evidenceQuality: "HIGH" | "MEDIUM" | "LOW" | null;
  finalVerdict: string;
  finalConfidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
}
