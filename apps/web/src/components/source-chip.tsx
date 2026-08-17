import React from "react";
import { evidenceLinkDescriptor, textOnly } from "./safe-rendering.js";
import { Globe, ExternalLink, ShieldCheck, ShieldAlert, FileText } from "lucide-react";
import { motion } from "framer-motion";

export function SourceChip({ item, onClick }: { item: any; onClick?: (item: any, descriptor: any) => void }) {
  const descriptor = evidenceLinkDescriptor(item);
  const firstLetter = (descriptor.domain || descriptor.publisher || "U").charAt(0).toUpperCase();
  
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="source-chip"
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={() => onClick?.(item, descriptor)}
    >
      <div className={`stance-dot stance-${getStanceClass(descriptor.stance)}`} />
      <div className="source-icon">{firstLetter}</div>
      <span className="source-domain">{descriptor.domain || descriptor.publisher || "Unknown"}</span>
      <div className={`reliability-dot reliability-${getReliabilityClass(descriptor.reliability)}`} />
    </motion.div>
  );
}

export function SourceDetail({ item, descriptor }: { item: any; descriptor: any }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="source-detail panel"
    >
      <div className="source-detail-header" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Globe size={18} style={{ color: "var(--accent-primary)" }} />
        <h4 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{descriptor.title}</h4>
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>{descriptor.publisher || descriptor.domain || "Unknown publisher"}</p>
      
      <div className="badge-list" style={{ marginBottom: 16 }}>
        <div className={`badge stance-badge stance-${getStanceClass(descriptor.stance)}`}>
          {stanceLabel(descriptor.stance)}
        </div>
        <div className="badge">{sourceTypeLabel(descriptor.sourceType)}</div>
        <div className="badge">
          <div className={`reliability-dot reliability-${getReliabilityClass(descriptor.reliability)}`} style={{ marginRight: 4 }} />
          <span>{descriptor.reliability} reliability</span>
        </div>
      </div>
      
      {descriptor.fetched && <p className="muted" style={{ marginBottom: 8 }}>Gemini returned this via Google Search grounding</p>}
      {item.fetch_message && <p className="muted" style={{ marginBottom: 8 }}>{textOnly(item.fetch_message)}</p>}
      {item.qualification_explanation && <p className="muted" style={{ marginBottom: 12 }}>{textOnly(item.qualification_explanation)}</p>}
      
      {descriptor.url ? (
        <a
          href={descriptor.url}
          target="_blank"
          rel="noopener noreferrer"
          className="button primary compact"
          aria-label={`Open ${descriptor.citationLabel}: ${descriptor.title}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <span>Open source</span>
          <ExternalLink size={14} />
        </a>
      ) : (
        <p className="muted">No safe source link available.</p>
      )}
    </motion.div>
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
