import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "./Panel";
import { radius, space, type, useTheme } from "../theme";

type VerdictTone = "real" | "fake" | "uncertain";

function resolveTone(verdict: string): VerdictTone {
  const value = String(verdict || "").toUpperCase();
  if (value.includes("REAL") || value.includes("TRUE") || value.includes("AUTHENTIC")) {
    return "real";
  }
  if (value.includes("FAKE") || value.includes("FALSE") || value.includes("MISLEADING")) {
    return "fake";
  }
  return "uncertain";
}

function confidencePercent(confidence: string): number {
  const upper = String(confidence || "").toUpperCase();
  if (upper.includes("HIGH")) return 92;
  if (upper.includes("MEDIUM")) return 68;
  if (upper.includes("LOW")) return 35;
  const numeric = Number(confidence);
  if (!Number.isNaN(numeric) && String(confidence).trim() !== "") {
    return Math.round(numeric <= 1 ? numeric * 100 : numeric);
  }
  return 50;
}

type VerdictBannerProps = {
  verdict: string;
  confidence: string;
  reason: string;
  warning?: string;
};

export function VerdictBanner({ verdict, confidence, reason, warning }: VerdictBannerProps) {
  const { colors } = useTheme();
  const tone = resolveTone(verdict);
  const percent = useMemo(() => confidencePercent(confidence), [confidence]);
  const palette =
    tone === "real"
      ? { bg: colors.statusRealBg, border: colors.statusRealBorder, text: colors.statusRealText, fill: colors.statusRealText }
      : tone === "fake"
        ? { bg: colors.statusFakeBg, border: colors.statusFakeBorder, text: colors.statusFakeText, fill: colors.statusFakeText }
        : {
            bg: colors.statusUncertainBg,
            border: colors.statusUncertainBorder,
            text: colors.statusUncertainText,
            fill: colors.statusUncertainText
          };

  return (
    <Panel style={{ backgroundColor: palette.bg, borderColor: palette.border }}>
      <View style={styles.header}>
        <View style={styles.verdictBlock}>
          <View style={[styles.icon, { backgroundColor: colors.bgSurfaceElevated, borderColor: palette.border }]}>
            <Text style={[styles.iconGlyph, { color: palette.text }]}>
              {tone === "real" ? "✓" : tone === "fake" ? "!" : "?"}
            </Text>
          </View>
          <Text style={[styles.verdict, { color: palette.text }]}>{String(verdict || "UNVERIFIED").toUpperCase()}</Text>
        </View>
        <View style={styles.meterBlock}>
          <Text style={[styles.meterLabel, { color: colors.accentSecondary }]}>
            {String(confidence || "LOW").toUpperCase()} confidence
          </Text>
          <View style={[styles.meterTrack, { backgroundColor: colors.meterTrack }]}>
            <View
              style={[
                styles.meterFill,
                {
                  backgroundColor: palette.fill,
                  width: `${Math.max(8, Math.min(100, percent))}%`
                }
              ]}
            />
          </View>
        </View>
      </View>
      <Text style={[styles.reason, { color: colors.textPrimary }]}>{reason || "No reason returned."}</Text>
      {warning ? <Text style={[styles.warning, { color: colors.textSecondary }]}>{warning}</Text> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: space.lg
  },
  verdictBlock: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md
  },
  icon: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  iconGlyph: {
    fontSize: 22,
    fontWeight: "800"
  },
  verdict: {
    ...type.verdict,
    flexShrink: 1
  },
  meterBlock: {
    gap: space.sm
  },
  meterLabel: {
    ...type.label,
    fontSize: 12,
    textTransform: "uppercase"
  },
  meterTrack: {
    borderRadius: radius.pill,
    height: 8,
    overflow: "hidden",
    width: "100%"
  },
  meterFill: {
    borderRadius: radius.pill,
    height: "100%"
  },
  reason: {
    ...type.body,
    fontSize: 15,
    lineHeight: 22
  },
  warning: {
    ...type.body,
    fontSize: 13
  }
});
