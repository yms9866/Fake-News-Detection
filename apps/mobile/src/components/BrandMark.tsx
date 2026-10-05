import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, space, type, useTheme } from "../theme";

type BrandMarkProps = {
  onPress?: () => void;
};

export function BrandMark({ onPress }: BrandMarkProps) {
  const { colors, mode, toggleMode } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { backgroundColor: colors.accentPrimary }]}>
        <Text style={styles.markText}>V</Text>
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>VERITAS</Text>
        <View style={[styles.badge, { backgroundColor: colors.brandBadgeBg, borderColor: colors.brandBadgeBorder }]}>
          <Text style={[styles.badgeText, { color: colors.brandBadgeText }]}>LOCAL</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle theme"
        onPress={onPress || toggleMode}
        style={[styles.themeButton, { borderColor: colors.borderMedium, backgroundColor: colors.bgSurfaceElevated }]}
      >
        <Text style={{ color: colors.textPrimary, fontWeight: "700" }}>{mode === "dark" ? "☀" : "☾"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md
  },
  mark: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  markText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800"
  },
  copy: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: space.sm
  },
  title: {
    ...type.label,
    fontSize: 16,
    letterSpacing: 0.4
  },
  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.sm,
    paddingVertical: 2
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6
  },
  themeButton: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  }
});
