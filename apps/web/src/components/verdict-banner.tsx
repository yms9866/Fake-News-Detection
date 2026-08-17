import React from "react";
import { textOnly } from "./safe-rendering.js";
import { ShieldCheck, ShieldAlert, HelpCircle, Activity, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export function VerdictBanner({ result }: { result: any }) {
  const verdict = textOnly(result?.final_verdict, "UNVERIFIED");
  const confidence = textOnly(result?.confidence, "LOW");
  const reason = textOnly(result?.reason, "No reason returned.");
  
  let colorClass = "verdict-uncertain";
  const verdictDisplay = verdict;
  let VerdictIcon = HelpCircle;
  let meterPercentage = 50;

  const upperVerdict = verdict.toUpperCase();
  if (upperVerdict.includes("REAL") || upperVerdict.includes("TRUE") || upperVerdict.includes("AUTHENTIC")) {
    colorClass = "verdict-real";
    VerdictIcon = ShieldCheck;
  } else if (upperVerdict.includes("FAKE") || upperVerdict.includes("FALSE") || upperVerdict.includes("MISLEADING")) {
    colorClass = "verdict-fake";
    VerdictIcon = ShieldAlert;
  } else {
    colorClass = "verdict-uncertain";
    VerdictIcon = HelpCircle;
  }

  const upperConf = confidence.toUpperCase();
  if (upperConf.includes("HIGH")) {
    meterPercentage = 92;
  } else if (upperConf.includes("MEDIUM")) {
    meterPercentage = 68;
  } else if (upperConf.includes("LOW")) {
    meterPercentage = 35;
  } else if (!isNaN(Number(confidence))) {
    meterPercentage = Math.round(Number(confidence) * 100);
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`verdict-banner ${colorClass}`}
    >
      <div className="verdict-header-row">
        <div className="verdict-status-badge">
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 15 }}
          >
            <VerdictIcon size={38} />
          </motion.div>
          <span>{verdictDisplay}</span>
        </div>

        <div className="confidence-meter-container">
          <div className="confidence-badge">
            <Activity size={14} style={{ color: "var(--accent-secondary)" }} />
            <span className="confidence-label">{confidence} Confidence</span>
            <span className="muted">({meterPercentage}%)</span>
          </div>
          <div className="confidence-meter-bar" aria-label={`Confidence level: ${meterPercentage}%`}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${meterPercentage}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="confidence-meter-fill" 
            />
          </div>
        </div>
      </div>

      <p className="verdict-summary">{reason}</p>
    </motion.div>
  );
}
