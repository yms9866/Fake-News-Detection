import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, type, useTheme } from "../theme";

type ConnectionStatus = "unknown" | "checking" | "ready" | "error";

type ConnectionPillProps = {
  status: ConnectionStatus;
  label: string;
  onPress?: () => void;
};

export function ConnectionPill({ status, label, onPress }: ConnectionPillProps) {
  const { colors } = useTheme();
  const tone =
    status === "ready"
      ? { bg: colors.statusRealBg, border: colors.statusRealBorder, text: colors.statusRealText, dot: colors.statusRealText }
      : status === "error"
        ? { bg: colors.statusFakeBg, border: colors.statusFakeBorder, text: colors.statusFakeText, dot: colors.statusFakeText }
        : status === "checking"
          ? { bg: colors.statusInfoBg, border: colors.statusInfoBorder, text: colors.statusInfoText, dot: colors.statusInfoText }
          : { bg: colors.bgSurfaceHover, border: colors.borderMedium, text: colors.textSecondary, dot: colors.textMuted };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: tone.bg, borderColor: tone.border }]}
    >
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.label, { color: tone.text }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: space.sm,
    maxWidth: 160,
    paddingHorizontal: space.md,
    paddingVertical: space.sm
  },
  dot: {
    borderRadius: radius.pill,
    height: 8,
    width: 8
  },
  label: {
    ...type.label,
    fontSize: 12
  }
});
