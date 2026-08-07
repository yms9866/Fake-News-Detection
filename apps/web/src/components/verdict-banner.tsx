import React from "react";
import { textOnly } from "./safe-rendering.js";

export function VerdictBanner({ result }: { result: any }) {
  const verdict = textOnly(result?.final_verdict, "UNVERIFIED");
  const confidence = textOnly(result?.confidence, "LOW");
  const reason = textOnly(result?.reason, "No reason returned.");
  
  // Determine color based on verdict
  let colorClass = "verdict-uncertain";
  let verdictDisplay = verdict;
  
  if (verdict.toUpperCase().includes("REAL") || verdict.toUpperCase().includes("TRUE") || verdict.toUpperCase().includes("AUTHENTIC")) {
    colorClass = "verdict-real";
  } else if (verdict.toUpperCase().includes("FAKE") || verdict.toUpperCase().includes("FALSE") || verdict.toUpperCase().includes("MISLEADING")) {
    colorClass = "verdict-fake";
  } else if (verdict.toUpperCase().includes("UNCERTAIN") || verdict.toUpperCase().includes("MIXED") || verdict.toUpperCase().includes("UNVERIFIED")) {
    colorClass = "verdict-uncertain";
  }
  
  return (
    <div className={`verdict-banner ${colorClass}`}>
      <h1>{verdictDisplay}</h1>
      <div className="confidence-badge">
        <span className="confidence-label">{confidence}</span>
      </div>
      <p className="verdict-summary">{reason}</p>
    </div>
  );
}
