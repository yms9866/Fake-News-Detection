export type MobileRoute =
  | "analyze"
  | "media"
  | "capture"
  | "live"
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
    route: MobileRoute;
    icon: string;
  }>;
};

export const NAV_ITEMS: NavSection[] = [
  {
    section: "Verify",
    items: [
      { label: "Analyze", route: "analyze", icon: "Aa" },
      { label: "Media", route: "media", icon: "◫" },
      { label: "Capture", route: "capture", icon: "◎" },
      { label: "Live", route: "live", icon: "◉" }
    ]
  },
  {
    section: "Results",
    items: [
      { label: "Result", route: "result", icon: "✓" },
      { label: "History", route: "history", icon: "☰" },
      { label: "Report", route: "report", icon: "▣" },
      { label: "Review", route: "review", icon: "👁" }
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

export const PRIMARY_TAB_ROUTES: MobileRoute[] = ["analyze", "media", "capture", "live"];

export function labelForRoute(route: MobileRoute) {
  for (const section of NAV_ITEMS) {
    const match = section.items.find((item) => item.route === route);
    if (match) {
      return match.label;
    }
  }
  return route;
}
