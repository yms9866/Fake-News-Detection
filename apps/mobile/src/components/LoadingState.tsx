import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Panel } from "./Panel";
import { radius, space, type, useTheme } from "../theme";

export function LoadingState({ message = "Verification in progress" }: { message?: string }) {
  const { colors } = useTheme();
  return (
    <Panel style={{ backgroundColor: colors.accentSoft, borderColor: colors.brandBadgeBorder }}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: colors.bgSurfaceElevated }]}>
          <ActivityIndicator color={colors.accentPrimary} />
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{message}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            Style scoring and evidence search are running against your local API.
          </Text>
        </View>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.md
  },
  icon: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  copy: {
    flex: 1,
    gap: 2
  },
  title: {
    ...type.label,
    fontSize: 15
  },
  meta: {
    ...type.body,
    fontSize: 13
  }
});
