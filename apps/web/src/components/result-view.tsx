import React, { useState } from "react";
import { evidenceLinkDescriptor, textOnly } from "./safe-rendering.js";
import { VerdictBanner } from "./verdict-banner";
import { CollapsibleSection } from "./collapsible-section";
import { SourceChip, SourceDetail } from "./source-chip";
import { FileText, Search, Brain, AlertTriangle, Shield, Globe, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function ResultView({ result }: { result: any }) {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  
  if (!result) {
    return (
      <div className="empty-state">
        <Brain size={48} style={{ color: "var(--text-dim)", marginBottom: 12 }} />
        <h2>No analysis selected</h2>
        <p className="muted">Submit text, a URL, or media to see the final verdict and evidence.</p>
      </div>
    );
  }

  const toggleSource = (citationLabel: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(citationLabel)) {
        next.delete(citationLabel);
      } else {
        next.add(citationLabel);
      }
      return next;
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="result-view" 
      style={{ display: "flex", flexDirection: "column", gap: 24 }}
    >
      <VerdictBanner result={result} />

      <CollapsibleSection title="How we checked this" collapsed={true}>
        <div className="methodology-content" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {renderStyleSignal(result)}
          {renderClaims(result.claims)}
          {renderSearchSummary(result.search_summary)}
          {renderEvidenceSources(result, expandedSources, toggleSource)}
          {renderGeminiEvidence(result.gemini_evidence || result.verification)}
          {renderWarnings(result.warnings)}
        </div>
      </CollapsibleSection>
    </motion.div>
  );
}

function renderGeminiEvidence(verification: any) {
  if (!verification) {
    return (
      <div className="panel verification-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Brain size={20} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Gemini evidence analysis</h3>
        </div>
        <p className="muted">Evidence verification was not performed for this analysis.</p>
      </div>
    );
  }
  
  const assessment = verification.assessment || verification.verdict || "UNVERIFIED";
  const confidence = verification.confidence || "LOW";
  const quality = verification.evidence_quality || "LOW";
  
  return (
    <div className="panel verification-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Brain size={20} style={{ color: "var(--accent-primary)" }} />
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Gemini evidence analysis</h3>
      </div>
      <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
        {textOnly(assessment, "UNVERIFIED")} - {textOnly(confidence, "LOW")} confidence
      </p>
      <p className="muted">Evidence quality: {textOnly(quality, "LOW")}</p>
      <p className="muted" style={{ marginTop: 8 }}>{textOnly(verification.explanation, "No explanation returned.")}</p>
      {verification.grounding_used !== undefined && (
        <p className="muted" style={{ marginTop: 4 }}>
          {verification.grounding_used ? "Grounded in reviewed source passages." : "No reviewed source grounding was available."}
        </p>
      )}
      <p className="muted" style={{ marginTop: 8, fontStyle: "italic" }}>
        The final system verdict is decided separately by deterministic evidence policy.
      </p>
      {verification.error_message && <p className="muted" style={{ marginTop: 6, color: "var(--status-fake-text)" }}>{textOnly(verification.error_message)}</p>}
    </div>
  );
}

function renderClaims(claims: any[] = []) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return (
      <div className="panel claims-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Shield size={20} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Claims checked</h3>
        </div>
        <p className="muted">No atomic factual claims were checked for this analysis.</p>
      </div>
    );
  }
  
  return (
    <div className="panel claims-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Shield size={20} style={{ color: "var(--accent-primary)" }} />
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Claims checked</h3>
      </div>
      <div className="claim-list" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {claims.map((claim, index) => (
          <div key={index} className="claim-card card">
            <p className="eyebrow">Claim {Number(claim.sequence || index + 1) || ""}</p>
            <h4 style={{ fontSize: 15, fontWeight: 600, margin: "6px 0", color: "var(--text-primary)" }}>{textOnly(claim.claim_text, "Untitled claim")}</h4>
            <div className="badge-list" style={{ margin: "8px 0" }}>
              <span className="badge">{textOnly(claim.verification_status, "INSUFFICIENT_EVIDENCE")}</span>
              <span className="badge">{textOnly(claim.confidence, "LOW")} confidence</span>
              <span className="badge">{textOnly(claim.importance, "MEDIUM")}</span>
            </div>
            <p className="muted">{textOnly(claim.explanation || claim.unresolved_reason, "No claim explanation returned.")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function renderSearchSummary(searchSummary: any) {
  if (!searchSummary) {
    return (
      <div className="panel search-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Search size={20} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Gemini Google Search</h3>
        </div>
        <p className="muted">Gemini Google Search grounding was not run.</p>
      </div>
    );
  }
  
  const queries = Array.isArray(searchSummary.queries) ? searchSummary.queries.slice(0, 6) : [];
  
  return (
    <div className="panel search-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Search size={20} style={{ color: "var(--accent-primary)" }} />
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Gemini Google Search</h3>
      </div>
      <p style={{ marginBottom: 8 }}>{textOnly(searchSummary.scope, "Gemini searches the live public web with Google Search grounding.")}</p>
      <p className="muted">
        {Number(searchSummary.total_queries || 0)} searches, {Number(searchSummary.total_results || 0)} grounded results, {Number(searchSummary.reviewed_source_count || 0)} cited sources
      </p>
      {queries.length > 0 && (
        <ul className="warnings" style={{ marginTop: 12 }}>
          {queries.map((query: any, index: number) => (
            <li key={index}>{textOnly(query.query)}</li>
          ))}
        </ul>
      )}
      {Array.isArray(searchSummary.limitations) && searchSummary.limitations.length > 0 && (
        <p className="muted" style={{ marginTop: 10 }}>{textOnly(searchSummary.limitations.join(" "))}</p>
      )}
    </div>
  );
}

function renderEvidenceSources(result: any, expandedSources: Set<string>, toggleSource: (label: string) => void) {
  const sources = Array.isArray(result.sources) && result.sources.length > 0
    ? result.sources
    : result.verification && Array.isArray(result.verification.evidence)
      ? result.verification.evidence
      : [];
  
  if (sources.length === 0) {
    return (
      <div className="panel sources-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <Globe size={20} style={{ color: "var(--accent-primary)" }} />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Reviewed sources</h3>
        </div>
        <p className="muted">No structured source records were returned.</p>
      </div>
    );
  }
  
  // Group sources by stance
  const grouped = sources.reduce((acc: Record<string, Array<{ item: any; descriptor: any }>>, item: any) => {
    const descriptor = evidenceLinkDescriptor(item);
    const stance = descriptor.stance || "unknown";
    if (!acc[stance]) acc[stance] = [];
    acc[stance].push({ item, descriptor });
    return acc;
  }, {} as Record<string, Array<{ item: any; descriptor: any }>>);
  
  return (
    <div className="panel sources-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <Globe size={20} style={{ color: "var(--accent-primary)" }} />
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Reviewed sources</h3>
      </div>
      {(Object.entries(grouped) as [string, Array<{ item: any; descriptor: any }>][]).map(([stance, items]) => (
        <div key={stance} style={{ marginBottom: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 12 }}>
            {items.length} {stanceLabel(stance).toLowerCase()}
          </h4>
          <div className="source-chip-list">
            {items.map(({ item, descriptor }, index) => {
              const label = item.citation_label || index.toString();
              const isExpanded = expandedSources.has(label);
              return (
                <div key={index} style={{ display: "flex", flexDirection: "column" }}>
                  <SourceChip
                    item={item}
                    onClick={() => toggleSource(label)}
                  />
                  {!descriptor.fetched && (
                    <span className="muted" style={{ fontSize: 11, marginTop: 4, marginLeft: 8 }}>Source not fetched</span>
                  )}
                  {isExpanded && (
                    <SourceDetail item={item} descriptor={descriptor} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderStyleSignal(result: any) {
  const assessment = result?.style_assessment || {};
  const displayText = assessment.display_text || fallbackStyleText(result?.style_signal);
  const displayConfidence = assessment.display_confidence || fallbackStyleConfidence(result?.style_confidence);
  const limitation = assessment.limitation || "This assessment evaluates writing patterns only. Writing style alone cannot establish whether the claims are true or false.";
  
  return (
    <div className="panel style-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <FileText size={20} style={{ color: "var(--accent-primary)" }} />
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Writing-style assessment</h3>
      </div>
      <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 8, color: "var(--text-primary)" }}>{textOnly(displayText, "The writing-style assessment is unavailable.")}</p>
      <p className="confidence-line" style={{ fontWeight: 600, color: "var(--accent-secondary)", marginBottom: 8 }}>
        Style signal strength: {textOnly(displayConfidence, "N/A")}
      </p>
      <p className="muted">{textOnly(limitation)}</p>
      {(assessment.warning || result?.style_warning) && (
        <p className="muted" style={{ marginTop: 6, color: "var(--status-uncertain-text)" }}>
          {textOnly(assessment.warning || result?.style_warning)}
        </p>
      )}
    </div>
  );
}

function renderWarnings(warnings: any[] = []) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return (
      <div className="panel warnings-panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <AlertTriangle size={20} style={{ color: "var(--status-uncertain-text)" }} />
          <h3 style={{ fontSize: 16, fontWeight: 600 }}>Warnings and limitations</h3>
        </div>
        <p className="muted">No warnings were returned.</p>
      </div>
    );
  }
  
  return (
    <div className="panel warnings-panel">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <AlertTriangle size={20} style={{ color: "var(--status-uncertain-text)" }} />
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Warnings and limitations</h3>
      </div>
      <ul className="warnings">
        {warnings.map((warning, index) => (
          <li key={index}>{textOnly(warning)}</li>
        ))}
      </ul>
    </div>
  );
}

function fallbackStyleText(signal: string): string {
  if (signal === "LOW_STYLE_RISK") {
    return "The writing style seems similar to real or legitimate news reporting.";
  }
  if (signal === "HIGH_STYLE_RISK") {
    return "The writing style seems similar to fake, misleading, or fabricated content.";
  }
  return "The writing-style assessment is unavailable.";
}

function fallbackStyleConfidence(confidence: number): string {
  if (confidence === null || confidence === undefined) {
    return "N/A";
  }
  if (confidence >= 0.9995) {
    return ">99.9%";
  }
  const bounded = Math.max(0, Math.min(Number(confidence), 0.999));
  return `${(bounded * 100).toFixed(1)}%`;
}

function stanceLabel(stance: string): string {
  if (stance === "SUPPORTS") {
    return "Supports the claim";
  }
  if (stance === "CONTRADICTS") {
    return "Contradicts the claim";
  }
  if (stance === "MENTIONS") {
    return "Mentions the topic";
  }
  return "Stance unknown";
}
