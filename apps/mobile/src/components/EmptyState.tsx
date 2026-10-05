import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "./Panel";
import { radius, space, type, useTheme } from "../theme";

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <Panel>
      <View style={styles.center}>
        <View style={[styles.icon, { backgroundColor: colors.accentSoft, borderColor: colors.brandBadgeBorder }]}>
          <Text style={[styles.glyph, { color: colors.accentSecondary }]}>○</Text>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.md
  },
  icon: {
    alignItems: "center",
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    marginBottom: space.sm,
    width: 56
  },
  glyph: {
    fontSize: 22,
    fontWeight: "700"
  },
  title: {
    ...type.label,
    fontSize: 16
  },
  message: {
    ...type.body,
    textAlign: "center"
  }
});
