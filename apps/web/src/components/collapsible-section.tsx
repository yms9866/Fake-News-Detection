import React, { useState } from "react";

export function CollapsibleSection({ title, children, collapsed = true }: { title: string; children: React.ReactNode; collapsed?: boolean }) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  
  return (
    <div className="collapsible-section">
      <div className="collapsible-header">
        <h3>{title}</h3>
        <button
          className="toggle-button"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? "Show details" : "Hide details"}
        </button>
      </div>
      <div className={`collapsible-content ${isCollapsed ? "collapsed" : ""}`}>
        {children}
      </div>
    </div>
  );
}
