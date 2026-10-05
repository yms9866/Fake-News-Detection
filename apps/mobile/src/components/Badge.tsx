import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { radius, space, type, useTheme } from "../theme";

type BadgeProps = {
  label: string;
  tone?: "neutral" | "accent" | "real" | "fake" | "uncertain" | "info";
};

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  const { colors } = useTheme();
  const palette =
    tone === "real"
      ? { bg: colors.statusRealBg, border: colors.statusRealBorder, text: colors.statusRealText }
      : tone === "fake"
        ? { bg: colors.statusFakeBg, border: colors.statusFakeBorder, text: colors.statusFakeText }
        : tone === "uncertain"
          ? { bg: colors.statusUncertainBg, border: colors.statusUncertainBorder, text: colors.statusUncertainText }
          : tone === "info"
            ? { bg: colors.statusInfoBg, border: colors.statusInfoBorder, text: colors.statusInfoText }
            : tone === "accent"
              ? { bg: colors.brandBadgeBg, border: colors.brandBadgeBorder, text: colors.brandBadgeText }
              : { bg: colors.bgSurfaceHover, border: colors.borderSubtle, text: colors.textSecondary };

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.sm + 2,
    paddingVertical: space.xs + 1
  },
  label: {
    ...type.label,
    fontSize: 11
  }
});
