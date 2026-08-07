import React, { useState } from "react";
import { evidenceLinkDescriptor, textOnly } from "./safe-rendering.js";
import { VerdictBanner } from "./verdict-banner";
import { CollapsibleSection } from "./collapsible-section";
import { SourceChip, SourceDetail } from "./source-chip";

export function ResultView({ result }: { result: any }) {
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  
  if (!result) {
    return (
      <div className="empty-state">
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
    <div className="result-view">
      <VerdictBanner result={result} />
      <CollapsibleSection title="How we checked this" collapsed={true}>
        <div className="methodology-content">
          {renderStyleSignal(result)}
          {renderClaims(result.claims)}
          {renderSearchSummary(result.search_summary)}
          {renderEvidenceSources(result, expandedSources, toggleSource)}
          {renderGeminiEvidence(result.gemini_evidence || result.verification)}
          {renderWarnings(result.warnings)}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function renderGeminiEvidence(verification: any) {
  if (!verification) {
    return (
      <div className="panel verification-panel">
        <h3>Gemini evidence analysis</h3>
        <p className="muted">Evidence verification was not performed for this analysis.</p>
      </div>
    );
  }
  
  const assessment = verification.assessment || verification.verdict || "UNVERIFIED";
  const confidence = verification.confidence || "LOW";
  const quality = verification.evidence_quality || "LOW";
  
  return (
    <div className="panel verification-panel">
      <h3>Gemini evidence analysis</h3>
      <p>{textOnly(assessment, "UNVERIFIED")} - {textOnly(confidence, "LOW")} confidence</p>
      <p className="muted">Evidence quality: {textOnly(quality, "LOW")}</p>
      <p className="muted">{textOnly(verification.explanation, "No explanation returned.")}</p>
      {verification.grounding_used !== undefined && (
        <p className="muted">{verification.grounding_used ? "Grounded in reviewed source passages." : "No reviewed source grounding was available."}</p>
      )}
      <p className="muted">The final system verdict is decided separately by deterministic evidence policy.</p>
      {verification.error_message && <p className="muted">{textOnly(verification.error_message)}</p>}
    </div>
  );
}

function renderClaims(claims: any[] = []) {
  if (!Array.isArray(claims) || claims.length === 0) {
    return (
      <div className="panel claims-panel">
        <h3>Claims checked</h3>
        <p className="muted">No atomic factual claims were checked for this analysis.</p>
      </div>
    );
  }
  
  return (
    <div className="panel claims-panel">
      <h3>Claims checked</h3>
      <div className="claim-list">
        {claims.map((claim, index) => (
          <div key={index} className="claim-card">
            <p className="eyebrow">Claim {Number(claim.sequence || 0) || ""}</p>
            <h4>{textOnly(claim.claim_text, "Untitled claim")}</h4>
            <div className="badge-list">
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
        <h3>Gemini Google Search</h3>
        <p className="muted">Gemini Google Search grounding was not run.</p>
      </div>
    );
  }
  
  const queries = Array.isArray(searchSummary.queries) ? searchSummary.queries.slice(0, 6) : [];
  
  return (
    <div className="panel search-panel">
      <h3>Gemini Google Search</h3>
      <p>{textOnly(searchSummary.scope, "Gemini searches the live public web with Google Search grounding.")}</p>
      <p className="muted">{Number(searchSummary.total_queries || 0)} searches, {Number(searchSummary.total_results || 0)} grounded results, {Number(searchSummary.reviewed_source_count || 0)} cited sources</p>
      {queries.length > 0 && (
        <ul className="warnings">
          {queries.map((query: any, index: number) => (
            <li key={index}>{textOnly(query.query)}</li>
          ))}
        </ul>
      )}
      {Array.isArray(searchSummary.limitations) && searchSummary.limitations.length > 0 && (
        <p className="muted">{textOnly(searchSummary.limitations.join(" "))}</p>
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
        <h3>Reviewed sources</h3>
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
      <h3>Reviewed sources</h3>
      {(Object.entries(grouped) as [string, Array<{ item: any; descriptor: any }>][]).map(([stance, items]) => (
        <div key={stance}>
          <h4>{items.length} {stanceLabel(stance).toLowerCase()}</h4>
          <div className="source-chip-list">
            {items.map(({ item, descriptor }, index) => (
              <div key={index}>
                <SourceChip
                  item={item}
                  onClick={() => toggleSource(item.citation_label || index.toString())}
                />
                {expandedSources.has(item.citation_label || index.toString()) && (
                  <SourceDetail item={item} descriptor={descriptor} />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderStyleSignal(result: any) {
  const assessment = result.style_assessment || {};
  const displayText = assessment.display_text || fallbackStyleText(result.style_signal);
  const displayConfidence = assessment.display_confidence || fallbackStyleConfidence(result.style_confidence);
  const limitation = assessment.limitation || "This assessment evaluates writing patterns only. Writing style alone cannot establish whether the claims are true or false.";
  
  return (
    <div className="panel style-panel">
      <h3>Writing-style assessment</h3>
      <p>{textOnly(displayText, "The writing-style assessment is unavailable.")}</p>
      <p className="confidence-line">Style signal strength: {textOnly(displayConfidence, "N/A")}</p>
      <p className="muted">{textOnly(limitation)}</p>
      {(assessment.warning || result.style_warning) && <p className="muted">{textOnly(assessment.warning || result.style_warning)}</p>}
    </div>
  );
}

function renderWarnings(warnings: any[] = []) {
  if (!Array.isArray(warnings) || warnings.length === 0) {
    return (
      <div className="panel warnings-panel">
        <h3>Warnings and limitations</h3>
        <p className="muted">No warnings were returned.</p>
      </div>
    );
  }
  
  return (
    <div className="panel warnings-panel">
      <h3>Warnings and limitations</h3>
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
