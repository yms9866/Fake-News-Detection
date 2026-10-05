export type DesktopRoute =
  | "analyze"
  | "media"
  | "capture"
  | "live"
  | "active-job"
  | "result"
  | "history"
  | "report"
  | "review"
  | "settings"
  | "diagnostics";

export type NavSection = {
  section: string;
  items: Array<{
    label: string;
    route: DesktopRoute;
    icon: string;
  }>;
};

/** Icon glyphs mirror the web Lucide set as compact symbols for the vanilla DOM shell. */
export const NAV_ITEMS: NavSection[] = [
  {
    section: "Verify",
    items: [
      { label: "Analyze", route: "analyze", icon: "📄" },
      { label: "Media", route: "media", icon: "📎" },
      { label: "Capture", route: "capture", icon: "📷" },
      { label: "Live", route: "live", icon: "📡" }
    ]
  },
  {
    section: "Results",
    items: [
      { label: "Result", route: "result", icon: "✓" },
      { label: "History", route: "history", icon: "◷" },
      { label: "Report", route: "report", icon: "▣" },
      { label: "Review", route: "review", icon: "◎" }
    ]
  },
  {
    section: "System",
    items: [
      { label: "Settings", route: "settings", icon: "⚙" },
      { label: "Diagnostics", route: "diagnostics", icon: "⌬" }
    ]
  }
];

export function labelForRoute(route: DesktopRoute) {
  if (route === "analyze") {
    return "Verify";
  }
  if (route === "active-job") {
    return "Active job";
  }
  for (const section of NAV_ITEMS) {
    const match = section.items.find((item) => item.route === route);
    if (match) {
      return match.label;
    }
  }
  return route;
}
