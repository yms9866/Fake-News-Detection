import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import { useWorkspace } from "./hooks/use-workspace";
import { ConnectionStatus, ErrorPanel, LoadingState } from "./components/status-panels";
import {
  AdminScreen,
  AnalyzeScreen,
  CaptureScreen,
  DiagnosticsScreen,
  HistoryScreen,
  LiveScreen,
  MediaScreen,
  NAV_ITEMS,
  ReportScreen,
  ResultScreen,
  ReviewScreen
} from "./screens";

export default function App() {
  const workspace = useWorkspace();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { route, actions, loading, error, lastRetry, connection, result, job, live, diagnostics, historyList, settings } = workspace;

  function renderRoute() {
    switch (route) {
      case "media":
        return <MediaScreen actions={actions} job={job} />;
      case "capture":
        return <CaptureScreen actions={actions} />;
      case "live":
        return <LiveScreen actions={actions} live={live} />;
      case "result":
        return <ResultScreen result={result} />;
      case "history":
        return <HistoryScreen historyList={historyList} onSelect={(item) => void actions.openHistory(item)} />;
      case "report":
        return <ReportScreen result={result} />;
      case "review":
        return <ReviewScreen result={result} />;
      case "admin":
        return <AdminScreen settings={settings} models={diagnostics?.models} onSave={actions.saveSettings} />;
      case "diagnostics":
        return <DiagnosticsScreen diagnostics={diagnostics} actions={actions} />;
      default:
        return <AnalyzeScreen actions={actions} defaultSettings={settings} />;
    }
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-header">
          <div className="brand-container">
            <div className="brand-icon"><Sparkles size={18} /></div>
            {!isSidebarCollapsed && (<><span className="brand-title">VERITAS AI</span><span className="brand-badge">LOCAL</span></>)}
          </div>
          <button className="collapse-toggle" onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav aria-label="Primary">
          {NAV_ITEMS.map((section) => (
            <div className="nav-section" key={section.section}>
              <div className="nav-section-header">{section.section}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = route === item.route;
                return (
                  <button key={item.route} className={isActive ? "nav active" : "nav"} aria-current={isActive ? "page" : "false"} onClick={() => actions.navigate(item.route)} title={item.label}>
                    <div className="nav-icon"><Icon size={18} /></div>
                    <span className="nav-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="content-shell">
        <header className="top-header">
          <div className="header-left">
            <span className="header-title" style={{ textTransform: "capitalize" }}>{route === "analyze" ? "Verification Console" : route}</span>
          </div>
          <div className="header-right">
            <ConnectionStatus connection={connection} retryAction={() => void actions.checkConnection()} />
          </div>
        </header>
        <div className="main-content">
          {error && <ErrorPanel error={error} retryAction={lastRetry} onDismiss={workspace.dismissError} />}
          {loading && <LoadingState message={loading === "analyze" ? "Analyzing source evidence" : "Working"} />}
          <AnimatePresence mode="wait">
            <motion.div key={route} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} style={{ width: "100%" }}>
              {renderRoute()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
