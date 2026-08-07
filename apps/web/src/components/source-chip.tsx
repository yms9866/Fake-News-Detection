import React, { useState } from "react";
import { evidenceLinkDescriptor, textOnly } from "./safe-rendering.js";

export function SourceChip({ item, onClick }: { item: any; onClick?: (item: any, descriptor: any) => void }) {
  const descriptor = evidenceLinkDescriptor(item);
  const firstLetter = (descriptor.domain || descriptor.publisher || "U").charAt(0).toUpperCase();
  
  return (
    <div
      className="source-chip"
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={() => onClick?.(item, descriptor)}
    >
      <div className={`stance-dot stance-${getStanceClass(descriptor.stance)}`} />
      <div className="source-icon">{firstLetter}</div>
      <span className="source-domain">{descriptor.domain || descriptor.publisher || "Unknown"}</span>
      <div className={`reliability-dot reliability-${getReliabilityClass(descriptor.reliability)}`} />
    </div>
  );
}

export function SourceDetail({ item, descriptor }: { item: any; descriptor: any }) {
  return (
    <div className="source-detail panel">
      <h4>{descriptor.title}</h4>
      <p className="muted">{descriptor.publisher || descriptor.domain || "Unknown publisher"}</p>
      
      <div className={`badge stance-badge stance-${getStanceClass(descriptor.stance)}`}>
        {stanceLabel(descriptor.stance)}
      </div>
      <div className="badge">{sourceTypeLabel(descriptor.sourceType)}</div>
      
      <div className="reliability-wrapper">
        <div className={`reliability-dot reliability-${getReliabilityClass(descriptor.reliability)}`} />
        <span className="muted">{descriptor.reliability} reliability</span>
      </div>
      
      {descriptor.fetched && <p className="muted">Gemini returned this via Google Search grounding</p>}
      {item.fetch_message && <p className="muted">{textOnly(item.fetch_message)}</p>}
      {item.qualification_explanation && <p className="muted">{textOnly(item.qualification_explanation)}</p>}
      
      {descriptor.url ? (
        <a
          href={descriptor.url}
          target="_blank"
          rel="noopener noreferrer"
          className="button link-button"
          aria-label={`Open ${descriptor.citationLabel}: ${descriptor.title}`}
        >
          Open source
        </a>
      ) : (
        <p className="muted">No safe source link available.</p>
      )}
    </div>
  );
}

function getStanceClass(stance: string): string {
  if (stance === "SUPPORTS") return "supports";
  if (stance === "CONTRADICTS") return "contradicts";
  if (stance === "MENTIONS") return "mentions";
  return "unknown";
}

function getReliabilityClass(reliability: string): string {
  const rel = (reliability || "").toUpperCase();
  if (rel.includes("HIGH")) return "high";
  if (rel.includes("MEDIUM")) return "medium";
  return "low";
}

function stanceLabel(stance: string): string {
  if (stance === "SUPPORTS") return "Supports the claim";
  if (stance === "CONTRADICTS") return "Contradicts the claim";
  if (stance === "MENTIONS") return "Mentions the topic";
  return "Stance unknown";
}

function sourceTypeLabel(sourceType: string): string {
  if (sourceType === "OFFICIAL") return "Official or primary source";
  if (sourceType === "REPUTABLE_NEWS" || sourceType === "FACT_CHECK") return "Secondary reporting";
  return `${sourceType || "UNKNOWN"} source`;
}
