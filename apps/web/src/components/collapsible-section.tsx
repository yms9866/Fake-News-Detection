import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function CollapsibleSection({ title, children, collapsed = true }: { title: string; children: React.ReactNode; collapsed?: boolean }) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);
  
  return (
    <div className="collapsible-section">
      <div className="collapsible-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <h3>{title}</h3>
        <button
          className="toggle-button button compact"
          onClick={(e) => {
            e.stopPropagation();
            setIsCollapsed(!isCollapsed);
          }}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? (
            <>
              Show details <ChevronDown size={14} />
            </>
          ) : (
            <>
              Hide details <ChevronUp size={14} />
            </>
          )}
        </button>
      </div>
      <div className={`collapsible-content ${isCollapsed ? "collapsed" : ""}`}>
        <AnimatePresence initial={false}>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
