import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, PanelLeftClose, PanelLeftOpen, Sparkles, X } from "lucide-react";
import { useWorkspace } from "./hooks/use-workspace";
import { useTheme } from "./hooks/use-theme";
import { useMediaQuery } from "./hooks/use-media-query";
import { ConnectionStatus, ErrorPanel, LoadingState } from "./components/status-panels";
import { ThemeToggle } from "./components/theme-toggle";
import {
  SettingsScreen,
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
  const { theme, toggleTheme } = useTheme();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { route, actions, loading, error, lastRetry, connection, result, job, live, diagnostics, historyList, settings } = workspace;
  const location = useLocation();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    document.body.style.overflow = isMobile && isMobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobile, isMobileMenuOpen]);

  const sidebarClassName = [
    "sidebar",
    isMobile ? (isMobileMenuOpen ? "mobile-open" : "") : (isSidebarCollapsed ? "collapsed" : "")
  ].filter(Boolean).join(" ");

  return (
    <main className="app-shell">
      {isMobile && (
        <button
          type="button"
          className={`sidebar-backdrop ${isMobileMenuOpen ? "visible" : ""}`}
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Close navigation menu"
        />
      )}
      <aside className={sidebarClassName} aria-hidden={isMobile && !isMobileMenuOpen}>
        <div className="sidebar-header">
          <div className="brand-container">
            <div className="brand-icon"><Sparkles size={18} /></div>
            {(!isSidebarCollapsed || isMobile) && (
              <>
                <span className="brand-title">VERITAS AI</span>
                <span className="brand-badge">LOCAL</span>
              </>
            )}
          </div>
          {isMobile ? (
            <button className="collapse-toggle" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close navigation menu">
              <X size={18} />
            </button>
          ) : (
            <button
              className="collapse-toggle"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              aria-label={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isSidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          )}
        </div>
        <nav aria-label="Primary">
          {NAV_ITEMS.map((section) => (
            <div className="nav-section" key={section.section}>
              <div className="nav-section-header">{section.section}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.route}
                    to={`/${item.route}`}
                    className={({ isActive }) => isActive ? "nav active" : "nav"}
                    title={item.label}
                    onClick={() => isMobile && setIsMobileMenuOpen(false)}
                  >
                    <div className="nav-icon"><Icon size={18} /></div>
                    <span className="nav-label">{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
      <div className="content-shell">
        <header className="top-header">
          <div className="header-left">
            {isMobile && (
              <button
                type="button"
                className="menu-toggle"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={isMobileMenuOpen}
              >
                <Menu size={18} />
              </button>
            )}
            <span className="header-title" style={{ textTransform: "capitalize" }}>{route === "analyze" ? "Verify" : route}</span>
          </div>
          <div className="header-right">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <ConnectionStatus connection={connection} retryAction={() => void actions.checkConnection()} />
          </div>
        </header>
        <div className="main-content">
          {error && <ErrorPanel error={error} retryAction={lastRetry} onDismiss={workspace.dismissError} />}
          {loading && <LoadingState message={loading === "analyze" ? "Verification in progress" : "Working"} />}
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} style={{ width: "100%" }}>
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Navigate to="/analyze" replace />} />
                <Route path="/analyze" element={<AnalyzeScreen actions={actions} defaultSettings={settings} />} />
                <Route path="/media" element={<MediaScreen actions={actions} job={job} />} />
                <Route path="/capture" element={<CaptureScreen actions={actions} />} />
                <Route path="/live" element={<LiveScreen actions={actions} live={live} />} />
                <Route path="/result" element={<ResultScreen result={result} />} />
                <Route path="/history" element={<HistoryScreen historyList={historyList} onSelect={(item) => void actions.openHistory(item)} />} />
                <Route path="/history/:slug" element={<ResultScreen result={result} />} />
                <Route path="/report" element={<ReportScreen result={result} />} />
                <Route path="/review" element={<ReviewScreen result={result} />} />
                <Route path="/settings" element={<SettingsScreen settings={settings} models={diagnostics?.models} onSave={actions.saveSettings} />} />
                <Route path="/diagnostics" element={<DiagnosticsScreen diagnostics={diagnostics} actions={actions} />} />
                <Route path="*" element={<Navigate to="/analyze" replace />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
