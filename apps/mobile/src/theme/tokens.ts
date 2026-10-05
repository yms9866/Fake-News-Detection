export type ThemeMode = "light" | "dark";

export type ThemeColors = {
  bgApp: string;
  bgSurface: string;
  bgSurfaceElevated: string;
  bgSurfaceHover: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  textOnAccent: string;
  accentPrimary: string;
  accentPrimaryHover: string;
  accentSecondary: string;
  accentSoft: string;
  accentGlow: string;
  borderSubtle: string;
  borderMedium: string;
  borderFocus: string;
  statusRealBg: string;
  statusRealBorder: string;
  statusRealText: string;
  statusFakeBg: string;
  statusFakeBorder: string;
  statusFakeText: string;
  statusUncertainBg: string;
  statusUncertainBorder: string;
  statusUncertainText: string;
  statusInfoBg: string;
  statusInfoBorder: string;
  statusInfoText: string;
  errorBg: string;
  errorBorder: string;
  errorText: string;
  shadowColor: string;
  brandBadgeBg: string;
  brandBadgeText: string;
  brandBadgeBorder: string;
  inputBg: string;
  meterTrack: string;
};

export const lightColors: ThemeColors = {
  bgApp: "#FCFCFD",
  bgSurface: "#F8F9FA",
  bgSurfaceElevated: "#FFFFFF",
  bgSurfaceHover: "#F1F3F5",
  textPrimary: "#11181C",
  textSecondary: "#687076",
  textMuted: "#889096",
  textDim: "#C1C8CD",
  textOnAccent: "#FFFFFF",
  accentPrimary: "#3E63DD",
  accentPrimaryHover: "#3358D4",
  accentSecondary: "#3A5CCC",
  accentSoft: "#EDF2FE",
  accentGlow: "rgba(62, 99, 221, 0.18)",
  borderSubtle: "rgba(0, 0, 0, 0.08)",
  borderMedium: "rgba(0, 0, 0, 0.14)",
  borderFocus: "rgba(62, 99, 221, 0.45)",
  statusRealBg: "#E6F6EB",
  statusRealBorder: "#8ECEAA",
  statusRealText: "#18794E",
  statusFakeBg: "#FEEBEC",
  statusFakeBorder: "#F4A9AA",
  statusFakeText: "#C62A2F",
  statusUncertainBg: "#FFF7C2",
  statusUncertainBorder: "#E2C547",
  statusUncertainText: "#AD5700",
  statusInfoBg: "#E6F4FE",
  statusInfoBorder: "#96C7F2",
  statusInfoText: "#0D74CE",
  errorBg: "#FEEBEC",
  errorBorder: "#F4A9AA",
  errorText: "#C62A2F",
  shadowColor: "rgba(15, 23, 42, 0.08)",
  brandBadgeBg: "#EDF2FE",
  brandBadgeText: "#3A5CCC",
  brandBadgeBorder: "#AEC0F5",
  inputBg: "#FFFFFF",
  meterTrack: "rgba(0, 0, 0, 0.08)"
};

export const darkColors: ThemeColors = {
  bgApp: "#111113",
  bgSurface: "#18181B",
  bgSurfaceElevated: "#212225",
  bgSurfaceHover: "#27272A",
  textPrimary: "#EDEEF0",
  textSecondary: "#B0B4BA",
  textMuted: "#7E808A",
  textDim: "#5C5F66",
  textOnAccent: "#FFFFFF",
  accentPrimary: "#5472E4",
  accentPrimaryHover: "#3E63DD",
  accentSecondary: "#9EB1FF",
  accentSoft: "rgba(84, 114, 228, 0.16)",
  accentGlow: "rgba(99, 102, 241, 0.22)",
  borderSubtle: "rgba(255, 255, 255, 0.06)",
  borderMedium: "rgba(255, 255, 255, 0.12)",
  borderFocus: "rgba(99, 102, 241, 0.5)",
  statusRealBg: "rgba(16, 185, 129, 0.08)",
  statusRealBorder: "rgba(16, 185, 129, 0.22)",
  statusRealText: "#3DD68C",
  statusFakeBg: "rgba(244, 63, 94, 0.08)",
  statusFakeBorder: "rgba(244, 63, 94, 0.22)",
  statusFakeText: "#F87171",
  statusUncertainBg: "rgba(245, 158, 11, 0.08)",
  statusUncertainBorder: "rgba(245, 158, 11, 0.22)",
  statusUncertainText: "#FBBF24",
  statusInfoBg: "rgba(56, 189, 248, 0.08)",
  statusInfoBorder: "rgba(56, 189, 248, 0.22)",
  statusInfoText: "#38BDF8",
  errorBg: "rgba(244, 63, 94, 0.08)",
  errorBorder: "rgba(244, 63, 94, 0.22)",
  errorText: "#F87171",
  shadowColor: "rgba(0, 0, 0, 0.35)",
  brandBadgeBg: "rgba(84, 114, 228, 0.16)",
  brandBadgeText: "#9EB1FF",
  brandBadgeBorder: "rgba(84, 114, 228, 0.35)",
  inputBg: "#18181B",
  meterTrack: "rgba(255, 255, 255, 0.1)"
};

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999
} as const;

export const type = {
  eyebrow: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.8 },
  title: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20 },
  body: { fontSize: 14, fontWeight: "400" as const, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: "600" as const },
  button: { fontSize: 15, fontWeight: "700" as const },
  verdict: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.6 }
} as const;

export function colorsForMode(mode: ThemeMode): ThemeColors {
  return mode === "dark" ? darkColors : lightColors;
}
